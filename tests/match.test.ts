import { describe, expect, it } from "vitest";
import { mainArtist, normalize, pickBest, textQuery } from "../lib/match";
import type { AppleTrack, SpotifyCandidate } from "../lib/types";

const apple: AppleTrack = {
  appleId: "1",
  title: "Nightcall (feat. Lovefoxxx)",
  artist: "Kavinsky & Lovefoxxx",
  album: "OutRun",
  durationMs: 258_000,
};

const cand = (o: Partial<SpotifyCandidate>): SpotifyCandidate => ({
  uri: "spotify:track:x",
  name: "Nightcall",
  artists: ["Kavinsky"],
  durationMs: 258_500,
  ...o,
});

describe("normalize", () => {
  it("retire accents, feat. et mentions de remaster", () => {
    expect(normalize("Déjà Vu (feat. X)")).toBe("deja vu");
    expect(normalize("Song - 2011 Remaster")).toBe("song");
  });
});

describe("mainArtist", () => {
  it("garde le premier artiste", () => {
    expect(mainArtist("Kavinsky & Lovefoxxx")).toBe("Kavinsky");
    expect(mainArtist("A, B")).toBe("A");
  });
});

describe("textQuery", () => {
  it("construit une requête titre + artiste", () => {
    expect(textQuery(apple)).toBe('track:"Nightcall" artist:"Kavinsky"');
  });
});

describe("pickBest", () => {
  it("préfère l'ISRC identique", () => {
    const t = { ...apple, isrc: "FR123" };
    const best = pickBest(t, [cand({ uri: "a" }), cand({ uri: "b", isrc: "fr123", durationMs: 100 })]);
    expect(best?.uri).toBe("b");
  });

  it("choisit la durée la plus proche", () => {
    const best = pickBest(apple, [cand({ uri: "far", durationMs: 266_000 }), cand({ uri: "near", durationMs: 258_100 })]);
    expect(best?.uri).toBe("near");
  });

  it("rejette un autre artiste ou une durée trop éloignée", () => {
    expect(pickBest(apple, [cand({ artists: ["Someone Else"] })])).toBeNull();
    expect(pickBest(apple, [cand({ durationMs: 400_000 })])).toBeNull();
  });
});
