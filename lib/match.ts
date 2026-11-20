/** Logique de correspondance Apple → Spotify (pure, testable). */
import type { AppleTrack, SpotifyCandidate } from "./types";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*[([].*?(feat|ft|with|remaster|version|edit|mono|stereo|deluxe|live|bonus).*?[)\]]/g, "")
    .replace(/\s+-\s+.*(remaster|version|edit|mix|live).*$/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Premier artiste seulement : « A & B », « A, B », « A feat. B » → « A ». */
export function mainArtist(artist: string): string {
  return artist.split(/\s*(?:,|&| feat\.? | ft\.? | x | with )\s*/i)[0].trim();
}

/** Requête de recherche Spotify par titre + artiste. */
export function textQuery(t: AppleTrack): string {
  const title = t.title.replace(/\s*[([].*?[)\]]/g, "").replace(/"/g, "").trim();
  return `track:"${title}" artist:"${mainArtist(t.artist).replace(/"/g, "")}"`;
}

const VARIOUS = new Set(["various artists", "artistes divers", "verschiedene interpreten", "varios artistas", "artisti vari", "various"]);

function sameArtist(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}

/**
 * Vrai si le titre vient d'un album ou single de l'artiste lui-même (sa page artiste),
 * faux pour une compilation ou un album d'un autre artiste (B.O., « Various Artists »…).
 * Si Spotify ne fournit pas l'info, on considère que oui.
 */
export function fromArtist(t: AppleTrack, c: SpotifyCandidate): boolean {
  if (c.albumType === "compilation") return false;
  const albumArtists = c.albumArtists ?? [];
  if (albumArtists.length === 0) return true;
  if (albumArtists.some((a) => VARIOUS.has(normalize(a)))) return false;
  const main = mainArtist(t.artist);
  return albumArtists.some((a) => sameArtist(a, main));
}

/** Pénalité appliquée aux compilations : un album de l'artiste gagne même sans ISRC identique. */
const COMPILATION_PENALTY = 40;

/**
 * Score d'un candidat (plus haut = meilleur, < 0 = rejeté).
 * Exige un titre et un artiste compatibles ; la durée départage ;
 * les compilations passent après les albums et singles de l'artiste.
 */
export function score(t: AppleTrack, c: SpotifyCandidate): number {
  const s = baseScore(t, c);
  return s < 0 || fromArtist(t, c) ? s : s - COMPILATION_PENALTY;
}

function baseScore(t: AppleTrack, c: SpotifyCandidate): number {
  if (t.isrc && c.isrc && t.isrc.toUpperCase() === c.isrc.toUpperCase()) return 100;
  const nt = normalize(t.title);
  const nc = normalize(c.name);
  const titleOk = nt === nc || nc.startsWith(nt) || nt.startsWith(nc);
  const artist = normalize(mainArtist(t.artist));
  const artistOk = c.artists.some((a) => {
    const na = normalize(a);
    return na === artist || na.includes(artist) || artist.includes(na);
  });
  if (!titleOk || !artistOk) return -1;
  let s = 50;
  if (nt === nc) s += 10;
  if (t.durationMs && c.durationMs) {
    const diff = Math.abs(t.durationMs - c.durationMs);
    if (diff > 10_000) return -1;
    s += 10 - diff / 1000;
  }
  return s;
}

export function pickBest(t: AppleTrack, candidates: SpotifyCandidate[]): SpotifyCandidate | null {
  let best: SpotifyCandidate | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const s = score(t, c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : null;
}
