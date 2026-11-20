/**
 * Lecture d'une playlist Apple Music PUBLIQUE, sans compte Apple Developer.
 *
 * Méthode principale : on récupère le jeton public utilisé par le lecteur web
 * music.apple.com (il est intégré dans son bundle JavaScript) et on interroge
 * amp-api.music.apple.com, qui renvoie titres + ISRC avec pagination.
 * Méthode de secours : on lit le JSON « serialized-server-data » de la page HTML.
 *
 * Rien de tout ça n'est officiel : si Apple change son site, c'est CE fichier
 * qu'il faudra adapter.
 */
import type { AppleTrack } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ORIGIN = "https://music.apple.com";

export function parsePlaylistUrl(url: string): { storefront: string; id: string } {
  const m = url.match(/music\.apple\.com\/([a-z]{2})\/playlist\/(?:[^/?#]+\/)?(pl\.[\w-]+)/i);
  if (!m) throw new Error(`Lien de playlist Apple Music invalide : ${url}`);
  return { storefront: m[1].toLowerCase(), id: m[2] };
}

let cachedToken: { value: string; at: number } | null = null;

async function getWebToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.at < 6 * 3600_000) return cachedToken.value;
  const html = await (await fetch(`${ORIGIN}/us/browse`, { headers: { "User-Agent": UA } })).text();
  const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  // Le bundle principal s'appelle généralement /assets/index~xxxx.js ou index-xxxx.js
  scripts.sort((a, b) => Number(/index/.test(b)) - Number(/index/.test(a)));
  for (const src of scripts) {
    const js = await (await fetch(ORIGIN + src, { headers: { "User-Agent": UA } })).text();
    const tok = js.match(/eyJh[\w-]+\.[\w-]+\.[\w-]+/);
    if (tok) {
      cachedToken = { value: tok[0], at: Date.now() };
      return tok[0];
    }
  }
  throw new Error("Jeton web Apple Music introuvable (le site d'Apple a peut-être changé).");
}

interface AmpSong {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
  };
}

export function ampSongToTrack(s: AmpSong): AppleTrack | null {
  const a = s.attributes;
  if (!a?.name) return null;
  return {
    appleId: s.id,
    title: a.name,
    artist: a.artistName ?? "",
    album: a.albumName ?? "",
    durationMs: a.durationInMillis ?? 0,
    isrc: a.isrc,
  };
}

async function fetchViaAmpApi(storefront: string, id: string): Promise<AppleTrack[]> {
  const token = await getWebToken();
  const headers = { Authorization: `Bearer ${token}`, Origin: ORIGIN, "User-Agent": UA };
  const tracks: AppleTrack[] = [];
  let next: string | null = `/v1/catalog/${storefront}/playlists/${id}/tracks?limit=100`;
  while (next) {
    const res: Response = await fetch(`https://amp-api.music.apple.com${next}`, { headers, cache: "no-store" });
    if (res.status === 401 || res.status === 403) cachedToken = null;
    if (!res.ok) throw new Error(`amp-api Apple Music : HTTP ${res.status}`);
    const body = (await res.json()) as { data: AmpSong[]; next?: string };
    for (const s of body.data) {
      const t = ampSongToTrack(s);
      if (t) tracks.push(t);
    }
    next = body.next ?? null;
  }
  return tracks;
}

/** Secours : parcourt le JSON intégré à la page publique et en extrait les morceaux. */
export function parseServerData(html: string): AppleTrack[] {
  const m = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const root = JSON.parse(m[1]);
  const out: AppleTrack[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) return node.forEach(walk);
    const o = node as Record<string, any>;
    const adamId = o.contentDescriptor?.identifiers?.storeAdamID;
    if (adamId && typeof o.title === "string" && o.contentDescriptor?.kind === "song") {
      out.push({
        appleId: String(adamId),
        title: o.title,
        artist: o.artistName ?? o.subtitleLinks?.[0]?.title ?? "",
        album: o.tertiaryLinks?.[0]?.title ?? "",
        durationMs: typeof o.duration === "number" ? o.duration : 0,
      });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(root);
  return out;
}

/**
 * `complete` = false quand on n'a peut-être lu qu'une partie de la playlist
 * (la page HTML n'affiche qu'environ 100 titres). Dans ce cas la synchro
 * refuse d'écrire, pour ne pas supprimer à tort des titres côté Spotify.
 */
export async function getApplePlaylist(
  url: string,
): Promise<{ tracks: AppleTrack[]; complete: boolean; source: "amp-api" | "html" }> {
  const { storefront, id } = parsePlaylistUrl(url);
  try {
    return { tracks: await fetchViaAmpApi(storefront, id), complete: true, source: "amp-api" };
  } catch (err) {
    console.warn("amp-api indisponible, lecture de la page HTML :", err);
    const html = await (await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" })).text();
    const tracks = parseServerData(html);
    if (tracks.length === 0) throw err;
    return { tracks, complete: tracks.length < 100, source: "html" };
  }
}
