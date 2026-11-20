import { describe, expect, it } from "vitest";
import { ampSongToTrack, parsePlaylistUrl, parseServerData } from "../lib/apple";

describe("parsePlaylistUrl", () => {
  it("extrait storefront et id", () => {
    expect(parsePlaylistUrl("https://music.apple.com/fr/playlist/ma-playlist/pl.u-AbC123xyz")).toEqual({
      storefront: "fr",
      id: "pl.u-AbC123xyz",
    });
  });
  it("refuse un lien invalide", () => {
    expect(() => parsePlaylistUrl("https://example.com")).toThrow();
  });
});

describe("ampSongToTrack", () => {
  it("convertit une réponse amp-api", () => {
    expect(
      ampSongToTrack({
        id: "42",
        type: "songs",
        attributes: { name: "T", artistName: "A", albumName: "Al", durationInMillis: 1000, isrc: "X" },
      }),
    ).toEqual({ appleId: "42", title: "T", artist: "A", album: "Al", durationMs: 1000, isrc: "X" });
  });
});

describe("parseServerData", () => {
  it("trouve les morceaux dans le JSON de la page", () => {
    const data = [
      {
        data: {
          sections: [
            {
              items: [
                {
                  title: "Song 1",
                  artistName: "Artist 1",
                  duration: 200000,
                  contentDescriptor: { kind: "song", identifiers: { storeAdamID: "111" } },
                },
                {
                  title: "Song 2",
                  subtitleLinks: [{ title: "Artist 2" }],
                  contentDescriptor: { kind: "song", identifiers: { storeAdamID: "222" } },
                },
              ],
            },
          ],
        },
      },
    ];
    const html = `<html><script type="application/json" id="serialized-server-data">${JSON.stringify(data)}</script></html>`;
    const tracks = parseServerData(html);
    expect(tracks.map((t) => [t.appleId, t.artist])).toEqual([
      ["111", "Artist 1"],
      ["222", "Artist 2"],
    ]);
  });
});
