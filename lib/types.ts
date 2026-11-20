export interface AppleTrack {
  /** Identifiant catalogue Apple Music (stable, sert de clé de cache). */
  appleId: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  isrc?: string;
}

export interface SpotifyCandidate {
  uri: string;
  name: string;
  artists: string[];
  durationMs: number;
  isrc?: string;
}
