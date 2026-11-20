import { isLoggedIn } from "@/lib/auth";
import { isConnected } from "@/lib/spotify";
import { getState, K, redis } from "@/lib/store";

export const dynamic = "force-dynamic";

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "jamais";

export default async function Home({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;

  if (!(await isLoggedIn())) {
    return (
      <main>
        <h1>Music Tracker</h1>
        <p className="sub">Synchro Apple Music → Spotify</p>
        <form className="card row" method="post" action="/api/login">
          <input type="password" name="password" placeholder="Mot de passe" required autoFocus />
          <button className="primary" type="submit">Entrer</button>
        </form>
      </main>
    );
  }

  const [connected, state, playlistId] = await Promise.all([
    isConnected(),
    getState(),
    process.env.SPOTIFY_PLAYLIST_ID ? Promise.resolve(process.env.SPOTIFY_PLAYLIST_ID) : redis().get<string>(K.playlist),
  ]);
  const spotifyId = playlistId?.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1] ?? playlistId;

  return (
    <main>
      <h1>Music Tracker</h1>
      <p className="sub">Synchro automatique Apple Music → Spotify, vérifiée toutes les 10 minutes.</p>

      {msg && <div className="card msg">{msg}</div>}

      <section className="card">
        <h2>Connexions</h2>
        <dl>
          <dt>Apple Music</dt>
          <dd>
            {process.env.APPLE_PLAYLIST_URL ? (
              <a href={process.env.APPLE_PLAYLIST_URL} target="_blank" rel="noreferrer">playlist source</a>
            ) : (
              <span className="error">APPLE_PLAYLIST_URL manquant</span>
            )}
          </dd>
          <dt>Spotify</dt>
          <dd>
            {connected ? "connecté" : <span className="warn">non connecté</span>}
            {spotifyId && (
              <>
                {" · "}
                <a href={`https://open.spotify.com/playlist/${spotifyId}`} target="_blank" rel="noreferrer">
                  playlist cible
                </a>
              </>
            )}
          </dd>
        </dl>
        <div className="row" style={{ marginTop: 12 }}>
          <a className="btn" href="/api/auth/login">{connected ? "Reconnecter Spotify" : "Connecter Spotify"}</a>
        </div>
      </section>

      <section className="card">
        <h2>État</h2>
        <dl>
          <dt>Dernière vérification</dt>
          <dd>{fmt(state.lastCheck)}</dd>
          <dt>Dernière synchro</dt>
          <dd>{fmt(state.lastSync)}</dd>
          <dt>Titres</dt>
          <dd>
            {state.trackCount !== undefined ? `${state.matchedCount} / ${state.trackCount} trouvés sur Spotify` : "—"}
          </dd>
          <dt>Dernier résultat</dt>
          <dd>{state.lastResult ?? "—"}</dd>
          {state.lastError && (
            <>
              <dt>Erreur</dt>
              <dd className="error">{state.lastError}</dd>
            </>
          )}
        </dl>
        <div className="row" style={{ marginTop: 12 }}>
          <form method="post" action="/api/sync">
            <button className="primary" type="submit" disabled={!connected}>Synchroniser maintenant</button>
          </form>
          <form method="post" action="/api/sync">
            <input type="hidden" name="force" value="1" />
            <button type="submit" disabled={!connected}>Forcer (réécrire la playlist)</button>
          </form>
        </div>
      </section>

      {!!state.notFound?.length && (
        <section className="card">
          <h2>Introuvables sur Spotify ({state.notFound.length})</h2>
          <ul>
            {state.notFound.map((t, i) => (
              <li key={i}>
                {t.title} — <span className="sub">{t.artist}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
