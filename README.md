# Music Tracker — synchro Apple Music → Spotify

Copie une playlist Apple Music (source) dans une playlist Spotify (cible), en **miroir exact** :
ajouts, suppressions et ordre. Toutes les 10 minutes, une tâche GitHub Actions appelle le site. Le site relit
la playlist Apple Music et ne réécrit Spotify **que si quelque chose a changé**, des deux côtés : si tu modifies
la playlist Spotify à la main, elle est remise en miroir.

> Ni Apple ni Spotify ne préviennent quand une playlist change. La synchro « automatique » vient donc
> d'une vérification régulière (délai max ≈ 10 min, parfois un peu plus selon GitHub).

## Comment ça marche
- **Apple Music** : pas de compte développeur. Le site lit la playlist **publique** comme le fait le
  lecteur web music.apple.com. Ce n'est pas officiel : si Apple change son site, il faudra adapter
  `lib/apple.ts`. Par sécurité, si la lecture semble incomplète, le site ne touche pas à Spotify.
- **Spotify** : API officielle. Recherche d'abord par ISRC (le code unique d'un enregistrement),
  sinon par titre + artiste + durée.
- **Stockage** : Upstash Redis (jetons Spotify, état, cache des correspondances).

## Mise en place (une seule fois)

### 1. Playlist Apple Music
Dans Apple Music : playlist → `…` → **Partager** → **Copier le lien**. La playlist doit être publique.
Le lien ressemble à `https://music.apple.com/fr/playlist/nom/pl.u-XXXX`.

### 2. Upstash Redis
1. https://console.upstash.com → **Create database** (gratuit, région Europe).
2. Note `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` (onglet REST API).

### 3. Mettre le code sur GitHub et déployer sur Vercel
1. Crée un dépôt **privé** sur GitHub et pousse ce dossier.
2. https://vercel.com → **Add New Project** → importe le dépôt.
3. Note l'URL obtenue, par ex. `https://musictracker-xxx.vercel.app`.

### 4. App Spotify
1. https://developer.spotify.com/dashboard → **Create app** (cocher *Web API*).
2. Redirect URI : `https://musictracker-xxx.vercel.app/api/auth/callback`.
3. Note le **Client ID** et le **Client Secret**.
4. ⚠️ Depuis février 2026, une app en mode développement ne fonctionne que si son propriétaire
   a **Spotify Premium**.

### 5. Variables d'environnement (Vercel → Settings → Environment Variables)
Voir `.env.example` :

| Variable | Valeur |
|---|---|
| `APPLE_PLAYLIST_URL` | lien de l'étape 1 |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | étape 4 |
| `SPOTIFY_REDIRECT_URI` | `https://musictracker-xxx.vercel.app/api/auth/callback` |
| `SPOTIFY_PLAYLIST_ID` | lien ou ID de la playlist Spotify cible (vide = créée automatiquement) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | étape 2 |
| `CRON_SECRET` | une longue chaîne aléatoire |
| `DASHBOARD_PASSWORD` | mot de passe du tableau de bord |

Puis **Redeploy** pour que les variables soient prises en compte.

### 6. Connecter Spotify
Ouvre le site, entre le mot de passe, clique sur **Connecter Spotify**, puis sur **Synchroniser maintenant**.
La première synchro d'une grosse playlist peut se faire en plusieurs passages (45 s max par passage) :
relance-la, ou laisse le cron finir.

> ⚠️ Si tu indiques une playlist Spotify existante, **son contenu est remplacé** par celui d'Apple Music.

### 7. Activer la synchro automatique
Dans le dépôt GitHub → **Settings → Secrets and variables → Actions**, ajoute :
- `SITE_URL` = `https://musictracker-xxx.vercel.app` (sans `/` final)
- `CRON_SECRET` = la même valeur que dans Vercel

Le workflow `.github/workflows/sync.yml` tourne alors toutes les 10 minutes. Tu peux aussi le lancer à la main
(onglet **Actions** → *Run workflow*).

## Développement local (optionnel)
Nécessite Node.js 20+.
```bash
npm install
cp .env.example .env.local   # puis remplir, avec SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback
npm run dev                  # http://127.0.0.1:3000
npm test
```
En local, le cookie de session est marqué `secure` : utilise `http://127.0.0.1` (que les navigateurs
traitent comme sûr) et ajoute aussi cette redirect URI dans l'app Spotify.

## Limites
- Les titres absents de Spotify, ou mal reconnus, sont listés dans le tableau de bord.
- Les morceaux importés à la main dans ta bibliothèque Apple (hors catalogue) ne sont pas visibles publiquement.
