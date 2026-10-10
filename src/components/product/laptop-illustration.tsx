/**
 * Neutraalne sülearvuti illustratsioon, kui tootel pole fotot.
 * Teadlikult EI kasutata võltsitud "tootefotosid" — kasutaja näeb kohe, et tegu on illustratsiooniga.
 */
export type IllustrationView = "front" | "closed" | "side";

export function LaptopIllustration({ view = "front", screenSizeIn = 14, className }: { view?: IllustrationView; screenSizeIn?: number; className?: string }) {
  // Suurem ekraan → veidi laiem illustratsioon, et kaardid ei näeks täpselt ühesugused välja
  const widen = Math.max(0, Math.min(24, (screenSizeIn - 13) * 8));

  if (view === "closed") {
    return (
      <svg viewBox="0 0 400 300" className={className} role="img" aria-label="Suletud sülearvuti illustratsioon">
        <rect x={70 - widen / 2} y="70" width={260 + widen} height="170" rx="12" fill="var(--c-text)" opacity="0.88" />
        <rect x={70 - widen / 2} y="70" width={260 + widen} height="170" rx="12" fill="none" stroke="var(--c-border-strong)" strokeWidth="2" opacity="0.3" />
        <circle cx="200" cy="155" r="10" fill="var(--c-surface)" opacity="0.12" />
        <rect x={80 - widen / 2} y="228" width={240 + widen} height="4" rx="2" fill="var(--c-surface)" opacity="0.08" />
      </svg>
    );
  }

  if (view === "side") {
    return (
      <svg viewBox="0 0 400 300" className={className} role="img" aria-label="Sülearvuti küljevaate illustratsioon">
        <rect x="40" y="140" width="320" height="24" rx="8" fill="var(--c-text)" opacity="0.85" />
        <rect x="70" y="148" width="14" height="8" rx="2" fill="var(--c-surface)" opacity="0.5" />
        <rect x="92" y="148" width="14" height="8" rx="2" fill="var(--c-surface)" opacity="0.5" />
        <rect x="116" y="147" width="22" height="10" rx="2" fill="var(--c-surface)" opacity="0.5" />
        <rect x="148" y="149" width="10" height="6" rx="3" fill="var(--c-surface)" opacity="0.5" />
        <rect x="300" y="148" width="18" height="8" rx="2" fill="var(--c-surface)" opacity="0.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 400 300" className={className} role="img" aria-label="Avatud sülearvuti illustratsioon">
      {/* Ekraan */}
      <rect x={78 - widen / 2} y="36" width={244 + widen} height="166" rx="10" fill="var(--c-text)" />
      <rect x={88 - widen / 2} y="46" width={224 + widen} height="146" rx="3" fill="var(--c-primary)" opacity="0.9" />
      <path d={`M${88 - widen / 2} 46 H${200 + widen / 4} L${150} 192 H${88 - widen / 2} Z`} fill="var(--c-surface)" opacity="0.06" />
      {/* Abstraktne "töölaud" */}
      <rect x={104 - widen / 2} y="64" width="74" height="8" rx="4" fill="var(--c-surface)" opacity="0.55" />
      <rect x={104 - widen / 2} y="80" width="120" height="6" rx="3" fill="var(--c-surface)" opacity="0.3" />
      <rect x={104 - widen / 2} y="92" width="96" height="6" rx="3" fill="var(--c-surface)" opacity="0.3" />
      <circle cx="200" cy="41" r="1.6" fill="var(--c-surface)" opacity="0.4" />
      {/* Alus */}
      <path
        d={`M${54 - widen / 2} 206 H${346 + widen / 2} L${366 + widen / 2} 236 Q${367 + widen / 2} 244 ${358 + widen / 2} 244 H${42 - widen / 2} Q${33 - widen / 2} 244 ${34 - widen / 2} 236 Z`}
        fill="var(--c-border-strong)"
      />
      <path d={`M${54 - widen / 2} 206 H${346 + widen / 2} L${350 + widen / 2} 214 H${50 - widen / 2} Z`} fill="var(--c-text-subtle)" opacity="0.6" />
      <rect x="170" y="230" width="60" height="6" rx="3" fill="var(--c-text-subtle)" opacity="0.5" />
    </svg>
  );
}
