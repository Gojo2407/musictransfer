import type { ReactNode } from "react";
import { AppleMusicIcon, CheckIcon, CrossIcon, ExternalIcon, MusicNote, SpotifyIcon } from "@/components/icons";
import { parsePlaylistUrl } from "@/lib/apple";
import { isLoggedIn } from "@/lib/auth";
import { describeResult, parseResult, type Tone } from "@/lib/describe";
import { isConnected } from "@/lib/spotify";
import { getState, K, redis } from "@/lib/store";

export const dynamic = "force-dynamic";

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })
    : "Jamais";

function Header() {
  return (
    <header className="header">
      <div className="brand-mark" aria-hidden="true">
        <AppleMusicIcon size={28} />
        <SpotifyIcon size={28} />
      </div>
      <div>
        <h1>Music Tracker</h1>
        <p className="sub">Ta playlist Apple Music, recopiée sur Spotify toutes les 10 minutes.</p>
      </div>
    </header>
  );
}

function ConnectionTile(props: {
  name: string;
  ok: boolean;
  logo: ReactNode;
  detail: string;
  action: ReactNode;
}) {
  return (
    <div className="conn">
      <div className={`conn-box ${props.ok ? "is-ok" : "is-ko"}`}>
        {props.logo}
        <span className="conn-badge" aria-hidden="true">
          {props.ok ? <CheckIcon /> : <CrossIcon />}
        </span>
      </div>
      <div className="conn-text">
        <strong>{props.name}</strong>
        <span className={props.ok ? "ok-text" : "ko-text"}>{props.ok ? "Connecté" : "Non connecté"}</span>
        <span className="muted small">{props.detail}</span>
      </div>
      {props.action}
    </div>
  );
}

function Album(props: {
  variant: "apple" | "spotify";
  href?: string;
  title: string;
  caption: string;
  children: ReactNode;
}) {
  const body = (
    <>
      <div className={`cover cover-${props.variant}`}>
        <span className="cover-art">{props.children}</span>
        <span className="cover-title">{props.title}</span>
      </div>
      <span className="album-caption">
        {props.caption}
        {props.href && <ExternalIcon />}
      </span>
    </>
  );
  return props.href ? (
    <a className={`album album-${props.variant}`} href={props.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className={`album album-${props.variant} is-empty`}>{body}</div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {children}
    </div>
  );
}

function NoteArt() {
  return (
    <svg width="72" height="72" viewBox="0 0 48 48" aria-hidden="true">
      <MusicNote color="#fff" />
    </svg>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; login?: string }>;
}) {
  const { msg, login } = await searchParams;

  if (!(await isLoggedIn())) {
    // Messages fixes : le paramètre d'URL n'est jamais affiché tel quel avant connexion.
    const loginError =
      login === "locked"
        ? "Trop d'essais. Réessaie dans 15 minutes."
        : login === "failed"
          ? "Mot de passe incorrect."
          : null;
    return (
      <main className="narrow">
        <Header />
        <form className="card login" method="post" action="/api/login">
          {loginError && <p className="login-error">{loginError}</p>}
          <label htmlFor="password">Mot de passe</label>
          <div className="row">
            <input id="password" type="password" name="password" required autoFocus />
            <button className="btn btn-primary" type="submit">
              Entrer
            </button>
          </div>
        </form>
      </main>
    );
  }

  const [spotifyOk, state, storedPlaylist] = await Promise.all([
    isConnected(),
    getState(),
    process.env.SPOTIFY_PLAYLIST_ID
      ? Promise.resolve(process.env.SPOTIFY_PLAYLIST_ID)
      : redis().get<string>(K.playlist),
  ]);

  const appleUrl = process.env.APPLE_PLAYLIST_URL;
  let appleValid = false;
  try {
    if (appleUrl) appleValid = !!parsePlaylistUrl(appleUrl);
  } catch {
    appleValid = false;
  }
  // Vert si le lien est valide et que la dernière lecture n'a pas échoué.
  const appleOk = appleValid && state.appleOk !== false;

  const spotifyId = storedPlaylist?.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1] ?? storedPlaylist ?? undefined;
  const spotifyUrl = spotifyId ? `https://open.spotify.com/playlist/${spotifyId}` : undefined;

  const result = parseResult(state.lastResult);
  const summary: { label: string; text: string; tone: Tone } = state.lastError
    ? { label: "Erreur", text: state.lastError, tone: "ko" }
    : result
      ? describeResult(result)
      : { label: "En attente", text: "Aucune synchro pour le moment.", tone: "idle" };

  const pct =
    state.trackCount && state.matchedCount !== undefined
      ? Math.round((state.matchedCount / state.trackCount) * 100)
      : null;

  return (
    <main>
      <Header />

      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}

      {/* Connexions */}
      <section className="card" aria-labelledby="conn-title">
        <h2 id="conn-title">Connexions</h2>
        <div className="conn-grid">
          <ConnectionTile
            name="Apple Music"
            ok={appleOk}
            logo={<AppleMusicIcon size={56} />}
            detail={
              !appleValid
                ? "Lien APPLE_PLAYLIST_URL manquant ou invalide dans Vercel."
                : state.appleOk === false
                  ? "Lecture incomplète : vérifie que la playlist est publique."
                  : "Playlist publique, lue sans compte développeur."
            }
            action={
              appleValid ? (
                <a className="btn" href={appleUrl} target="_blank" rel="noreferrer">
                  Ouvrir la playlist <ExternalIcon />
                </a>
              ) : (
                <span className="btn is-disabled">À configurer dans Vercel</span>
              )
            }
          />
          <ConnectionTile
            name="Spotify"
            ok={spotifyOk}
            logo={<SpotifyIcon size={56} />}
            detail={spotifyOk ? "Compte relié, la playlist peut être modifiée." : "Relie ton compte pour autoriser la copie."}
            action={
              <a className={`btn ${spotifyOk ? "" : "btn-primary"}`} href="/api/auth/login">
                {spotifyOk ? "Reconnecter Spotify" : "Connecter Spotify"}
              </a>
            }
          />
        </div>
      </section>

      {/* Les deux albums qui s'échangent des CD */}
      <section className="exchange" aria-label="Playlists">
        <Album variant="apple" href={appleValid ? appleUrl : undefined} title="Apple Music" caption="Source">
          <NoteArt />
        </Album>
        <div className="lane" aria-hidden="true">
          <span className="disc disc-a" />
          <span className="disc disc-b" />
        </div>
        <Album
          variant="spotify"
          href={spotifyUrl}
          title="Spotify"
          caption={spotifyUrl ? "Copie" : "Créée à la 1re synchro"}
        >
          <SpotifyIcon size={72} circle="#0b0b0d" bars="#1ed760" />
        </Album>
      </section>

      {/* État */}
      <section className="card" aria-labelledby="state-title">
        <div className="card-head">
          <h2 id="state-title">État</h2>
          <span className={`pill pill-${summary.tone}`}>{summary.label}</span>
        </div>
        <p className={`summary summary-${summary.tone}`}>{summary.text}</p>

        <div className="stats">
          <Stat label="Dernière vérification" value={fmt(state.lastCheck)} />
          <Stat label="Dernière synchro" value={fmt(state.lastSync)} />
          <Stat
            label="Titres copiés"
            value={state.trackCount !== undefined ? `${state.matchedCount ?? 0} / ${state.trackCount}` : "—"}
          >
            {pct !== null && (
              <span className="meter" role="img" aria-label={`${pct} %`}>
                <span style={{ width: `${pct}%` }} />
              </span>
            )}
          </Stat>
        </div>

        <div className="row actions">
          <form method="post" action="/api/sync">
            <button className="btn btn-primary" type="submit" disabled={!spotifyOk}>
              Synchroniser maintenant
            </button>
          </form>
          <form method="post" action="/api/sync">
            <input type="hidden" name="force" value="1" />
            <button className="btn" type="submit" disabled={!spotifyOk}>
              Forcer la réécriture
            </button>
          </form>
        </div>
      </section>

      {!!state.notFound?.length && (
        <section className="card" aria-labelledby="nf-title">
          <div className="card-head">
            <h2 id="nf-title">Introuvables sur Spotify</h2>
            <span className="pill pill-warn">{state.notFound.length}</span>
          </div>
          <ul className="tracklist">
            {state.notFound.map((t, i) => (
              <li key={i}>
                <span>{t.title}</span>
                <span className="muted">{t.artist}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
