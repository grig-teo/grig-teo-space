type Props = {
  /** Strides per second, derived from the publicly shared steps metric. */
  cadence: number;
};

const STROKE = 'rgb(var(--color-accent))';

/**
 * Pseudo-3D walking figure for the landing hero, companion to the
 * heartbeat vignette. A stick figure on a ground ellipse: limbs swing in
 * anti-phase around their joints, the body bobs and the shadow breathes —
 * back limbs render dimmer for depth. Pure CSS animation; the stride
 * cadence comes from the steps metric, so it walks faster when the owner
 * walks more. Frozen under prefers-reduced-motion (see globals.css).
 */
export function WalkerScene({ cadence }: Props) {
  const swing = `${(1 / cadence).toFixed(2)}s`;
  const antiPhase = `-${(1 / cadence / 2).toFixed(2)}s`;

  return (
    <div className="flex items-center" aria-hidden="true">
      <svg width="110" height="150" viewBox="0 0 100 140">
        <ellipse
          cx="50"
          cy="130"
          rx="30"
          ry="7"
          fill="none"
          stroke="rgb(var(--color-border) / 0.6)"
          strokeWidth="1"
        />
        <ellipse
          className="walk-shadow"
          style={{ animationDuration: swing }}
          cx="50"
          cy="130"
          rx="16"
          ry="4"
          fill="rgb(var(--color-accent) / 0.15)"
        />
        <g className="walk-bob" style={{ animationDuration: swing }}>
          {/* Back limbs first — dimmer, behind the torso (depth). */}
          <g className="walk-limb" style={{ animationDuration: swing, animationDelay: antiPhase }} opacity="0.45">
            <line x1="50" y1="72" x2="50" y2="106" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <g className="walk-limb" style={{ animationDuration: swing }} opacity="0.45">
            <line x1="50" y1="36" x2="50" y2="64" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
          </g>
          {/* Torso + head. */}
          <line x1="50" y1="30" x2="50" y2="72" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="50" cy="20" r="9" fill="rgb(var(--color-background))" stroke={STROKE} strokeWidth="2.5" />
          {/* Front limbs. */}
          <g className="walk-limb" style={{ animationDuration: swing }}>
            <line x1="50" y1="72" x2="50" y2="106" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <g className="walk-limb" style={{ animationDuration: swing, animationDelay: antiPhase }}>
            <line x1="50" y1="36" x2="50" y2="64" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}
