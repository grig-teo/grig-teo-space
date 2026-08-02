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

/** Brain silhouette shared by every expression. */
const BRAIN_PATH =
  'M50 34 C 42 34 36 40 35 47 C 28 49 25 55 27 61 C 25 68 30 73 37 73 ' +
  'C 40 78 46 78 50 75 C 54 78 60 78 63 73 C 70 73 75 68 73 61 ' +
  'C 75 55 72 49 65 47 C 64 40 58 34 50 34 Z';

/** Top crease + four side sulci, kept short and away from the face. */
const FOLDS_PATH =
  'M50 36 C 49 41 51 45 50 49 ' +
  'M38 44 C 41 42 43 45 40 47 M62 44 C 59 42 57 45 60 47 ' +
  'M32 58 C 35 56 37 59 34 61 M68 58 C 65 56 63 59 66 61';

/** Cartoon flame (bottom anchored at 0,0, drawn upward). */
const FLAME_PATH =
  'M0 0 C -12 -2 -14 -12 -8 -20 C -6 -24 -8 -28 -6 -34 C -2 -28 -1 -26 0 -30 ' +
  'C 1 -26 4 -24 6 -30 C 10 -22 14 -16 12 -8 C 11 -3 6 0 0 0 Z';

/**
 * Stress as a brain character (site-accent palette): at 0% it levitates in
 * zen meditation — closed happy eyes, smile, crossed mudra arms, soft
 * shadow. As the public stress average climbs, a flame ignites and grows
 * above its head, arms rise from zen pose to panic, the smile inverts to a
 * frown, eyes pop open under angry eyebrows, legs drop, and the whole brain
 * starts trembling. Every parameter is a continuous function of the 0–100
 * level. Pure CSS/SVG, frozen under prefers-reduced-motion (globals.css).
 */
export function StressScene({ stress }: Props) {
  const level = Math.min(Math.max(Math.round(stress), 0), 100);

  const flames = ramp(level, 20, 80);
  const flameDur = `${(1.2 - (level / 100) * 0.7).toFixed(2)}s`;
  const eyesOpen = ramp(level, 30, 60).toFixed(2);
  const frown = ramp(level, 35, 65).toFixed(2);
  const panicArms = ramp(level, 30, 60).toFixed(2);
  const zenArms = (1 - ramp(level, 25, 55)).toFixed(2);
  const eyebrows = ramp(level, 55, 85).toFixed(2);
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
            {/* Flame — ignites ~20% and grows with the level. */}
            <g
              opacity={flames.toFixed(2)}
              transform={`translate(50 36) scale(${flames.toFixed(2)})`}
            >
              <path
                className="flame"
                style={{ animationDuration: flameDur }}
                d={FLAME_PATH}
                fill={FLAME}
              />
            </g>

            {/* Brain body + folds, accent outline like the other scenes. */}
            <path d={BRAIN_PATH} fill="rgb(var(--color-background))" stroke={ACCENT} strokeWidth="2.5" />
            <path
              d={FOLDS_PATH}
              fill="none"
              stroke={ACCENT}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.55"
            />

            {/* Closed zen eyes ↔ open worried eyes + angry eyebrows. */}
            <g
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity={(1 - Number(eyesOpen)).toFixed(2)}
            >
              <path d="M37 55 q4 4.5 8 0" />
              <path d="M55 55 q4 4.5 8 0" />
            </g>
            <g fill={ACCENT} opacity={eyesOpen}>
              <circle cx="41" cy="56" r="2.8" />
              <circle cx="59" cy="56" r="2.8" />
            </g>
            <g
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              opacity={eyebrows}
            >
              <line x1="36" y1="49" x2="44" y2="52" />
              <line x1="64" y1="49" x2="56" y2="52" />
            </g>

            {/* Smile ↔ frown. */}
            <path
              d="M43 64 q7 6 14 0"
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              opacity={(1 - Number(frown)).toFixed(2)}
            />
            <path
              d="M43 68 q7 -6 14 0"
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              opacity={frown}
            />

            {/* Crossed meditation arms fade out as panic arms rise. */}
            <g
              stroke={ACCENT}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              opacity={zenArms}
            >
              <path d="M32 68 C 38 76 44 76 50 72" />
              <path d="M68 68 C 62 76 56 76 50 72" />
            </g>
            <g
              stroke={ACCENT}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              opacity={panicArms}
            >
              <line x1="26" y1="60" x2="16" y2="46" />
              <circle cx="15" cy="44" r="2.5" />
              <line x1="74" y1="60" x2="84" y2="46" />
              <circle cx="85" cy="44" r="2.5" />
            </g>

            {/* Legs drop in once the brain stops levitating. */}
            <g stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity={legs}>
              <line x1="44" y1="73" x2="41" y2="88" />
              <line x1="41" y1="88" x2="36" y2="90" />
              <line x1="56" y1="73" x2="59" y2="88" />
              <line x1="59" y1="88" x2="64" y2="90" />
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
