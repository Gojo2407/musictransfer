/** Logos simplifiés (dessinés à la main) et pictos de statut. */

export function AppleMusicIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="am-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb5c74" />
          <stop offset="1" stopColor="#fa233b" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#am-grad)" />
      <MusicNote color="#fff" />
    </svg>
  );
}

/** Croche double, centrée dans un carré de 48. */
export function MusicNote({ color = "currentColor" }: { color?: string }) {
  return (
    <g fill={color}>
      <ellipse cx="17.5" cy="33" rx="4.6" ry="3.8" transform="rotate(-20 17.5 33)" />
      <ellipse cx="30.5" cy="30" rx="4.6" ry="3.8" transform="rotate(-20 30.5 30)" />
      <rect x="20.2" y="15" width="2.4" height="18.5" />
      <rect x="33.2" y="12" width="2.4" height="18.5" />
      <path d="M20.2 15 35.6 12v4.2l-15.4 3z" />
    </g>
  );
}

export function SpotifyIcon({ size = 40, circle = "#1ed760", bars = "#0b0b0d" }: { size?: number; circle?: string; bars?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill={circle} />
      <g fill="none" stroke={bars} strokeLinecap="round">
        <path d="M12.5 18.3c7.4-2.3 16-1.7 22.6 1.9" strokeWidth="3.6" />
        <path d="M14 25c6.1-1.8 12.8-1.2 18.2 1.6" strokeWidth="3" />
        <path d="M15.3 31.2c4.9-1.3 10-.9 14.3 1.2" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="M9 5h10v10M19 5 6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
