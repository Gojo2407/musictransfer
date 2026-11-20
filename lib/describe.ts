/** Résultat d'une synchro et sa traduction en message lisible (sans dépendance serveur). */
export type SyncResult =
  | { status: "unchanged"; tracks: number }
  | { status: "synced"; tracks: number; matched: number; notFound: number }
  | { status: "partial"; resolved: number; remaining: number }
  | { status: "skipped"; reason: string };

export type Tone = "ok" | "warn" | "ko" | "idle";

export function describeResult(r: SyncResult): { label: string; text: string; tone: Tone } {
  switch (r.status) {
    case "unchanged":
      return { label: "À jour", tone: "ok", text: `Aucun changement : les ${r.tracks} titres sont déjà synchronisés.` };
    case "synced":
      return {
        label: "Synchronisé",
        tone: r.notFound ? "warn" : "ok",
        text:
          `${r.matched} titre${r.matched > 1 ? "s" : ""} sur ${r.tracks} copiés sur Spotify.` +
          (r.notFound ? ` ${r.notFound} introuvable${r.notFound > 1 ? "s" : ""}.` : ""),
      };
    case "partial":
      return {
        label: "En cours",
        tone: "warn",
        text: `${r.resolved} titres trouvés, ${r.remaining} restants. La suite se fera au prochain passage.`,
      };
    case "skipped":
      return { label: "Ignoré", tone: "warn", text: r.reason };
  }
}

export function parseResult(json?: string): SyncResult | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as SyncResult;
  } catch {
    return null;
  }
}
