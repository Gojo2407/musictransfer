import { Redis } from "@upstash/redis";

let client: Redis | null = null;
export function redis(): Redis {
  return (client ??= Redis.fromEnv());
}

export const K = {
  refresh: "mt:spotify:refresh",
  access: "mt:spotify:access",
  playlist: "mt:spotify:playlist",
  state: "mt:state",
  // hash appleId -> spotify uri. Le suffixe change avec MATCHER_VERSION (lib/sync.ts) :
  // un nouvel algorithme de correspondance repart d'un cache vide.
  map: "mt:map:v2",
  lock: "mt:lock",
  oauthState: "mt:oauth-state",
};

export interface SyncState {
  appleHash?: string;
  /** Version de l'algorithme de correspondance utilisée pour la dernière synchro complète. */
  matcherVersion?: number;
  spotifySnapshot?: string;
  lastCheck?: string;
  lastSync?: string;
  lastResult?: string;
  lastError?: string;
  /** Dernière lecture de la playlist Apple : complète (true) ou en échec / partielle (false). */
  appleOk?: boolean;
  trackCount?: number;
  matchedCount?: number;
  notFound?: { title: string; artist: string }[];
}

export async function getState(): Promise<SyncState> {
  return ((await redis().get<SyncState>(K.state)) ?? {}) as SyncState;
}

export async function patchState(patch: Partial<SyncState>): Promise<void> {
  const cur = await getState();
  await redis().set(K.state, { ...cur, ...patch });
}
