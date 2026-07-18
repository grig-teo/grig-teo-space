import type { CSSProperties } from 'react';

type Props = {
  /** Public stress average, 0–100. */
  stress: number;
};

const ACCENT = 'rgb(var(--color-accent))';
const FLAME = 'rgb(var(--color-accent-2))';

/** Smooth 0→1 ramp over a sub-range of the stress level. */
function ramp(level: number, from: number, to: number): number {
  return Math.min(Math.max((level - from) / (to - from), 0), 1);
}

/** One teardrop flame; height scales with `s`, flickers via CSS. */
function Flame({ x, s, dur, delay }: { x: number; s: number; dur: string; delay: string }) {
  return (
    <g transform={`translate(${x} 36) scale(${s.toFixed(2)})`}>
      <path
        className="flame"
        style={{ animationDuration: dur, animationDelay: delay }}
        d="M0 0 C -7 -9 -3 -16 0 -24 C 3 -16 7 -9 0 0 Z"
        fill={FLAME}
      />
    </g>
  );
}

/**
 * Stress as a brain character (site-accent palette): at 0% it levitates in
 * zen meditation — closed happy eyes, smile, mudra arms, soft shadow. As
 * the public stress average climbs, flames ignite and grow above its head,
 * arms rise from zen pose to panic, the smile inverts to a frown, eyes pop
 * open, legs drop, and the whole brain starts trembling. Every parameter
 * is a continuous function of the 0–100 level. Pure CSS/SVG, frozen under
 * prefers-reduced-motion (see globals.css).
 */
export function StressScene({ stress }: Props) {
  const level = Math.min(Math.max(Math.round(stress), 0), 100);

  const flames = ramp(level, 20, 80);
  const flameDur = `${(1.2 - (level / 100) * 0.7).toFixed(2)}s`;
  const armDeg = 25 + (level / 100) * 135; // zen (down) → raised (up)
  const eyesOpen = ramp(level, 30, 70).toFixed(2);
  const frown = ramp(level, 30, 70).toFixed(2);
  const legs = ramp(level, 45, 85).toFixed(2);
  const trembleAmp = `${(ramp(level, 50, 100) * 2).toFixed(2)}px`;
  const trembleSec = `${(1.4 - (level / 100) * 1.1).toFixed(2)}s`;
  const bobSec = `${(4.5 - (level / 100) * 2.5).toFixed(2)}s`;

  return (
    <div className="flex flex-col items-center gap-1" aria-hidden="true">
      <svg width="110" height="140" viewBox="0 0 100 140">
        <g className="zen-float" style={{ animationDuration: bobSec }}>
          <g
            className="stress-tremble"
            style={{ '--tremble-amp': trembleAmp, animationDuration: trembleSec } as CSSProperties}
          >
            {/* Flames — ignite ~20% and grow with the level. */}
            <g opacity={flames.toFixed(2)}>
              <Flame x={36} s={flames * 0.8} dur={flameDur} delay="0s" />
              <Flame x={50} s={flames * 1.1} dur={flameDur} delay="-0.3s" />
              <Flame x={64} s={flames * 0.8} dur={flameDur} delay="-0.6s" />
            </g>
            {/* Brain body: bumpy blob, accent outline like the other scenes. */}
            <g fill="rgb(var(--color-background))" stroke={ACCENT} strokeWidth="2.5">
              <circle cx="36" cy="56" r="12" />
              <circle cx="50" cy="47" r="15" />
              <circle cx="64" cy="56" r="12" />
              <rect x="30" y="54" width="40" height="14" rx="7" />
            </g>
            {/* Brain folds. */}
            <path
              d="M39 56 q4 -6 8 0 q4 6 8 0 M50 48 q4 -5 8 0"
              fill="none"
              stroke={ACCENT}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.6"
            />
            {/* Closed zen eyes ↔ open worried eyes. */}
            <g stroke={ACCENT} strokeWidth="2" strokeLinecap="round" fill="none" opacity={(1 - Number(eyesOpen)).toFixed(2)}>
              <path d="M39 58 q3 3 6 0" />
              <path d="M55 58 q3 3 6 0" />
            </g>
            <g fill={ACCENT} opacity={eyesOpen}>
              <circle cx="42" cy="58" r="2" />
              <circle cx="58" cy="58" r="2" />
            </g>
            {/* Smile ↔ frown. */}
            <path
              d="M45 64 q5 4 10 0"
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              opacity={(1 - Number(frown)).toFixed(2)}
            />
            <path
              d="M45 67 q5 -4 10 0"
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              opacity={frown}
            />
            {/* Arms rotate from zen pose up to panic around the shoulders. */}
            <g transform={`rotate(${-armDeg.toFixed(1)} 28 66)`}>
              <line x1="28" y1="66" x2="20" y2="80" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="19" cy="82" r="2.5" fill="none" stroke={ACCENT} strokeWidth="2" />
            </g>
            <g transform={`rotate(${armDeg.toFixed(1)} 72 66)`}>
              <line x1="72" y1="66" x2="80" y2="80" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="81" cy="82" r="2.5" fill="none" stroke={ACCENT} strokeWidth="2" />
            </g>
            {/* Legs drop in once the brain stops levitating. */}
            <g stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" opacity={legs}>
              <line x1="44" y1="68" x2="41" y2="86" />
              <line x1="41" y1="86" x2="36" y2="88" />
              <line x1="56" y1="68" x2="59" y2="86" />
              <line x1="59" y1="86" x2="64" y2="88" />
            </g>
          </g>
          {/* Levitation shadow — fades as the legs take over. */}
          <ellipse
            cx="50"
            cy="96"
            rx="14"
            ry="3"
            fill={ACCENT}
            opacity={(0.18 * (1 - Number(legs))).toFixed(2)}
          />
        </g>
      </svg>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {level}% stress avg
      </span>
    </div>
  );
}
