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
  map: "mt:map", // hash appleId -> spotify uri
  lock: "mt:lock",
  oauthState: "mt:oauth-state",
};

export interface SyncState {
  appleHash?: string;
  spotifySnapshot?: string;
  lastCheck?: string;
  lastSync?: string;
  lastResult?: string;
  lastError?: string;
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
