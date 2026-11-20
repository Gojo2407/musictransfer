import { createHash } from "node:crypto";
import { getApplePlaylist } from "./apple";
import { env } from "./env";
import { ensurePlaylist, findTrack, getSnapshot, replacePlaylist } from "./spotify";
import { K, patchState, getState, redis } from "./store";
import type { AppleTrack } from "./types";

/** Au-delà, on s'arrête et on laisse le prochain passage du cron continuer (le cache garde la progression). */
const TIME_BUDGET_MS = 45_000;
const CONCURRENCY = 4;
/**
 * À incrémenter quand la logique de correspondance change (et changer K.map en même temps) :
 * la synchro suivante recalcule alors tous les titres, sans action manuelle.
 * v2 : priorité aux albums/singles de l'artiste plutôt qu'aux compilations.
 */
const MATCHER_VERSION = 2;

import type { SyncResult } from "./describe";
export type { SyncResult };

export async function runSync({ force = false } = {}): Promise<SyncResult> {
  const r = redis();
  if (!(await r.set(K.lock, "1", { nx: true, ex: 120 }))) {
    return { status: "skipped", reason: "Une synchro est déjà en cours." };
  }
  const now = new Date().toISOString();
  try {
    const result = await doSync(force);
    await patchState({ lastCheck: now, lastError: undefined, lastResult: JSON.stringify(result) });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await patchState({ lastCheck: now, lastError: msg });
    throw e;
  } finally {
    await r.del(K.lock);
  }
}

async function doSync(force: boolean): Promise<SyncResult> {
  const started = Date.now();
  let apple: Awaited<ReturnType<typeof getApplePlaylist>>;
  try {
    apple = await getApplePlaylist(env("APPLE_PLAYLIST_URL"));
  } catch (e) {
    await patchState({ appleOk: false });
    throw e;
  }
  const { tracks, complete, source } = apple;
  // Sert au tableau de bord : l'encadré Apple Music est vert si la playlist a été lue entièrement.
  await patchState({ appleOk: complete });

  if (!complete) {
    return { status: "skipped", reason: `Lecture Apple incomplète (source ${source}) : rien n'est modifié côté Spotify.` };
  }
  if (tracks.length === 0 && !force) {
    return { status: "skipped", reason: "La playlist Apple semble vide : synchro forcée requise pour vider Spotify." };
  }

  const appleHash = createHash("sha256").update(tracks.map((t) => t.appleId).join(",")).digest("hex");
  const playlistId = await ensurePlaylist();
  const state = await getState();
  const snapshot = await getSnapshot(playlistId);

  // Rien n'a changé côté Apple, personne n'a touché la playlist Spotify et l'algorithme
  // de correspondance est le même → rien à faire.
  if (
    !force &&
    state.appleHash === appleHash &&
    state.spotifySnapshot === snapshot &&
    state.matcherVersion === MATCHER_VERSION
  ) {
    return { status: "unchanged", tracks: tracks.length };
  }

  // Résolution des titres, avec cache appleId → uri Spotify.
  const ids = [...new Set(tracks.map((t) => t.appleId))];
  const cached = ids.length ? ((await redis().hmget<Record<string, string>>(K.map, ...ids)) ?? {}) : {};
  const uriOf = new Map<string, string | null>();
  for (const id of ids) if (cached[id]) uriOf.set(id, cached[id]);

  const todo: AppleTrack[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    if (!uriOf.has(t.appleId) && !seen.has(t.appleId)) {
      todo.push(t);
      seen.add(t.appleId);
    }
  }

  let i = 0;
  const worker = async () => {
    while (i < todo.length && Date.now() - started < TIME_BUDGET_MS) {
      const t = todo[i++];
      const uri = await findTrack(t);
      uriOf.set(t.appleId, uri);
      // Seules les correspondances trouvées sont mises en cache : un titre
      // introuvable sera recherché à nouveau à la prochaine modification.
      if (uri) await redis().hset(K.map, { [t.appleId]: uri });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const remaining = todo.filter((t) => !uriOf.has(t.appleId)).length;
  if (remaining > 0) {
    return { status: "partial", resolved: todo.length - remaining, remaining };
  }

  const uris: string[] = [];
  const notFound: { title: string; artist: string }[] = [];
  for (const t of tracks) {
    const u = uriOf.get(t.appleId);
    if (u) uris.push(u);
    else notFound.push({ title: t.title, artist: t.artist });
  }

  const newSnapshot = await replacePlaylist(playlistId, uris);
  await patchState({
    appleHash,
    matcherVersion: MATCHER_VERSION,
    spotifySnapshot: newSnapshot,
    lastSync: new Date().toISOString(),
    trackCount: tracks.length,
    matchedCount: uris.length,
    notFound,
  });
  return { status: "synced", tracks: tracks.length, matched: uris.length, notFound: notFound.length };
}
