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

const CX = 50;
const CY = 62;
const ARC_R = 34;
const ARC_C = 2 * Math.PI * ARC_R;
const TICK_COUNT = 12;

/**
 * Stress visualized as a pressure gauge: an arc that fills to exactly the
 * public stress average (stroke-dasharray technique), a dashed ring that
 * spins faster as stress rises, tick marks that light up one by one, and a
 * core pulsing quicker at high pressure. Color ramps teal → amber → red.
 * Pure CSS/SVG, frozen under prefers-reduced-motion (see globals.css).
 */
export function StressScene({ stress }: Props) {
  const level = Math.min(Math.max(Math.round(stress), 0), 100);
  const color = stressColor(level);

  const arcLen = (ARC_C * level) / 100;
  const spinSec = `${(24 - (level / 100) * 20).toFixed(2)}s`;
  const pulseSec = `${(2 - (level / 100) * 1.5).toFixed(2)}s`;
  const litTicks = Math.round((level / 100) * TICK_COUNT);

  return (
    <div className="flex flex-col items-center gap-1" aria-hidden="true">
      <svg width="110" height="140" viewBox="0 0 100 140">
        {/* Dashed outer ring — spins faster with the level. */}
        <circle
          className="gauge-spin"
          style={{ animationDuration: spinSec }}
          cx={CX}
          cy={CY}
          r="44"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 7"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* Gauge track. */}
        <circle
          cx={CX}
          cy={CY}
          r={ARC_R}
          fill="none"
          stroke="rgb(var(--color-border))"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Filled arc — length is exactly `level`% of the circumference. */}
        <circle
          cx={CX}
          cy={CY}
          r={ARC_R}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${arcLen.toFixed(1)} ${ARC_C.toFixed(1)}`}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
        {/* Tick marks — lit count follows the level. */}
        {Array.from({ length: TICK_COUNT }, (_, i) => {
          const angle = (i / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
          const lit = i < litTicks;
          return (
            <line
              key={i}
              x1={CX + Math.cos(angle) * 27}
              y1={CY + Math.sin(angle) * 27}
              x2={CX + Math.cos(angle) * 23}
              y2={CY + Math.sin(angle) * 23}
              stroke={lit ? color : 'rgb(var(--color-border))'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}
        {/* Pulsing pressure core. */}
        <circle
          className="stress-core"
          style={{ animationDuration: pulseSec } as CSSProperties}
          cx={CX}
          cy={CY}
          r="7"
          fill={color}
        />
      </svg>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {level}% stress avg
      </span>
    </div>
  );
}
