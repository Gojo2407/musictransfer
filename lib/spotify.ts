import { env } from "./env";
import { K, redis } from "./store";
import { pickBest, textQuery } from "./match";
import type { AppleTrack, SpotifyCandidate } from "./types";

const API = "https://api.spotify.com/v1";
export const SCOPES = "playlist-read-private playlist-modify-private playlist-modify-public";

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: env("SPOTIFY_CLIENT_ID"),
    scope: SCOPES,
    redirect_uri: env("SPOTIFY_REDIRECT_URI"),
    state,
  });
  return `https://accounts.spotify.com/authorize?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const basic = Buffer.from(`${env("SPOTIFY_CLIENT_ID")}:${env("SPOTIFY_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token : HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
}

async function saveTokens(t: { access_token: string; expires_in: number; refresh_token?: string }) {
  await redis().set(K.access, t.access_token, { ex: Math.max(60, t.expires_in - 120) });
  if (t.refresh_token) await redis().set(K.refresh, t.refresh_token);
}

export async function exchangeCode(code: string): Promise<void> {
  await saveTokens(
    await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: env("SPOTIFY_REDIRECT_URI") }),
  );
}

export async function isConnected(): Promise<boolean> {
  return !!(await redis().get(K.refresh));
}

async function accessToken(): Promise<string> {
  const cached = await redis().get<string>(K.access);
  if (cached) return cached;
  const refresh = await redis().get<string>(K.refresh);
  if (!refresh) throw new Error("Spotify n'est pas connecté : ouvre le tableau de bord et clique sur « Connecter Spotify ».");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  await saveTokens(t);
  return t.access_token;
}

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("retry-after") ?? "2");
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return api(path, init, attempt + 1);
  }
  if (res.status === 401 && attempt === 0) {
    await redis().del(K.access);
    return api(path, init, 1);
  }
  if (!res.ok) throw new SpotifyError(res.status, `Spotify ${init.method ?? "GET"} ${path} : HTTP ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

interface SpTrack {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  external_ids?: { isrc?: string };
}

const toCandidate = (t: SpTrack): SpotifyCandidate => ({
  uri: t.uri,
  name: t.name,
  artists: t.artists.map((a) => a.name),
  durationMs: t.duration_ms,
  isrc: t.external_ids?.isrc,
});

async function search(q: string, limit: number): Promise<SpotifyCandidate[]> {
  // Pas de `market` : avec un jeton utilisateur, Spotify applique déjà le pays du compte,
  // et `market=from_token` est soupçonné de provoquer un 403 « Insufficient client scope ».
  const p = new URLSearchParams({ q, type: "track", limit: String(limit) });
  const r = await api<{ tracks: { items: SpTrack[] } }>(`/search?${p}`);
  return r.tracks.items.filter(Boolean).map(toCandidate);
}

/** Trouve l'équivalent Spotify d'un titre Apple : d'abord par ISRC, sinon titre + artiste. */
export async function findTrack(t: AppleTrack): Promise<string | null> {
  if (t.isrc) {
    const byIsrc = await search(`isrc:${t.isrc}`, 5);
    if (byIsrc.length) return (pickBest(t, byIsrc) ?? byIsrc[0]).uri;
  }
  const byText = await search(textQuery(t), 10);
  const best = pickBest(t, byText);
  if (best) return best.uri;
  // Dernier essai, recherche libre (utile si le titre contient des caractères spéciaux)
  const loose = await search(`${t.title} ${t.artist}`, 10);
  return pickBest(t, loose)?.uri ?? null;
}

export function parsePlaylistId(input: string): string {
  return input.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1] ?? input.trim();
}

/** Renvoie l'ID de la playlist cible ; la crée si aucune n'est configurée. */
export async function ensurePlaylist(): Promise<string> {
  const configured = process.env.SPOTIFY_PLAYLIST_ID;
  if (configured) return parsePlaylistId(configured);
  const stored = await redis().get<string>(K.playlist);
  if (stored) return stored;
  const body = JSON.stringify({ name: "Apple Music (synchro)", public: false, description: "Synchronisée automatiquement depuis Apple Music" });
  let created: { id: string };
  try {
    created = await api<{ id: string }>("/me/playlists", { method: "POST", body });
  } catch (e) {
    if (!(e instanceof SpotifyError) || (e.status !== 404 && e.status !== 405)) throw e;
    const me = await api<{ id: string }>("/me");
    created = await api<{ id: string }>(`/users/${me.id}/playlists`, { method: "POST", body });
  }
  await redis().set(K.playlist, created.id);
  return created.id;
}

export async function getSnapshot(playlistId: string): Promise<string> {
  const r = await api<{ snapshot_id: string }>(`/playlists/${playlistId}?fields=snapshot_id`);
  return r.snapshot_id;
}

// Spotify a renommé /playlists/{id}/tracks en /playlists/{id}/items : on essaie le nouveau, puis l'ancien.
let itemsSegment: "items" | "tracks" = "items";

async function playlistItems<T>(playlistId: string, method: "PUT" | "POST", uris: string[]): Promise<T> {
  const body = JSON.stringify({ uris });
  try {
    return await api<T>(`/playlists/${playlistId}/${itemsSegment}`, { method, body });
  } catch (e) {
    if (itemsSegment === "items" && e instanceof SpotifyError && (e.status === 404 || e.status === 410)) {
      itemsSegment = "tracks";
      return api<T>(`/playlists/${playlistId}/${itemsSegment}`, { method, body });
    }
    throw e;
  }
}

/** Remplace tout le contenu de la playlist par `uris` (dans l'ordre). Renvoie le nouveau snapshot_id. */
export async function replacePlaylist(playlistId: string, uris: string[]): Promise<string> {
  let r = await playlistItems<{ snapshot_id: string }>(playlistId, "PUT", uris.slice(0, 100));
  for (let i = 100; i < uris.length; i += 100) {
    r = await playlistItems<{ snapshot_id: string }>(playlistId, "POST", uris.slice(i, i + 100));
  }
  return r.snapshot_id;
}
