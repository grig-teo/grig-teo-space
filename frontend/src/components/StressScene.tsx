import type { CSSProperties } from 'react';

type Props = {
  /** Public stress average, 0–100. */
  stress: number;
};

/** teal (calm) → amber (moderate) → red (stressed). */
function stressColor(level: number): string {
  const calm = [45, 212, 191];
  const mid = [251, 191, 36];
  const high = [248, 113, 113];
  const [from, to, t] =
    level <= 50 ? [calm, mid, level / 50] : [mid, high, (level - 50) / 50];
  const rgb = from.map((channel, i) => Math.round(channel + (to[i] - channel) * t));
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

/**
 * Stress-figure companion to the walker: a standing stick figure whose
 * animation is fully parameterized by the public stress value (0–100) —
 * tremble amplitude and speed, breathing rate, pressure waves above the
 * head, and a calm→stressed color ramp all change with every point.
 * Pure CSS/SVG, frozen under prefers-reduced-motion (see globals.css).
 */
export function StressScene({ stress }: Props) {
  const level = Math.min(Math.max(Math.round(stress), 0), 100);
  const color = stressColor(level);

  // Continuous parameterization: higher stress = stronger, faster tremble,
  // faster breathing, more visible pressure waves.
  const trembleAmp = `${((level / 100) * 2.5).toFixed(2)}px`;
  const trembleSec = `${(1.6 - (level / 100) * 1.4).toFixed(2)}s`;
  const breatheSec = `${(4.5 - (level / 100) * 3).toFixed(2)}s`;
  const waveOpacity = (level / 100).toFixed(2);

  return (
    <div className="flex flex-col items-center gap-1" aria-hidden="true">
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
        <g
          className="stress-tremble"
          style={
            {
              '--tremble-amp': trembleAmp,
              animationDuration: trembleSec,
            } as CSSProperties
          }
        >
          {/* Pressure waves above the head — appear/grow with the level. */}
          <g
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            style={{ '--wave-opacity': waveOpacity } as CSSProperties}
          >
            <path className="stress-wave" d="M32 14 q4 -6 8 0" />
            <path className="stress-wave" style={{ animationDelay: '-0.5s' }} d="M60 14 q4 -6 8 0" />
            <path className="stress-wave" style={{ animationDelay: '-1s' }} d="M46 6 q4 -6 8 0" />
          </g>
          {/* Head + torso. */}
          <circle cx="50" cy="24" r="9" fill="rgb(var(--color-background))" stroke={color} strokeWidth="2.5" />
          <line x1="50" y1="34" x2="50" y2="74" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          {/* Breathing chest — faster and larger as stress rises. */}
          <circle
            className="stress-breathe"
            style={{ animationDuration: breatheSec }}
            cx="50"
            cy="48"
            r="6"
            fill={color}
          />
          {/* Arms slightly held out (tense), legs standing. */}
          <line x1="50" y1="38" x2="38" y2="62" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="50" y1="38" x2="62" y2="62" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="50" y1="74" x2="44" y2="106" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="50" y1="74" x2="56" y2="106" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {level}% stress avg
      </span>
    </div>
  );
}
