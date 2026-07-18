import type { CSSProperties } from 'react';

type Props = {
  /** Public stress average, 0–100. */
  stress: number;
};

/** Cloud fill: bright slate (calm) → dark storm gray (max stress). */
function cloudColor(level: number): string {
  const calm = [148, 163, 184];
  const storm = [51, 65, 85];
  const t = level / 100;
  const rgb = calm.map((channel, i) => Math.round(channel + (storm[i] - channel) * t));
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

const RAIN_COLOR = 'rgb(96 165 250)';
const BOLT_COLOR = 'rgb(var(--color-accent-2))';
/** Fixed drop slots across the cloud's underside; more slots activate as
 *  the stress level rises. */
const DROP_SLOTS = [30, 39, 48, 57, 66, 75];

/**
 * Stress visualized as weather: a cloud that darkens from bright slate to
 * storm gray, gathers rain (drop count, speed and opacity rise), starts
 * shaking, and above ~60% fires lightning. Every parameter is derived
 * continuously from the public stress average (0–100). Pure CSS/SVG,
 * frozen under prefers-reduced-motion (see globals.css).
 */
export function StressScene({ stress }: Props) {
  const level = Math.min(Math.max(Math.round(stress), 0), 100);

  const dropCount = Math.round((level / 100) * DROP_SLOTS.length);
  const rainSec = `${(1.6 - (level / 100) * 1).toFixed(2)}s`;
  const rainOpacity = (0.35 + (level / 100) * 0.55).toFixed(2);
  const trembleAmp = `${((level / 100) * 2).toFixed(2)}px`;
  const trembleSec = `${(1.6 - (level / 100) * 1.4).toFixed(2)}s`;
  const boltSec = `${(3.2 - (level / 100) * 2).toFixed(2)}s`;

  return (
    <div className="flex flex-col items-center gap-1" aria-hidden="true">
      <svg width="110" height="150" viewBox="0 0 100 140">
        <g className="cloud-bob" style={{ animationDuration: `${(6 - (level / 100) * 2.5).toFixed(2)}s` }}>
          <g
            className="stress-tremble"
            style={{ '--tremble-amp': trembleAmp, animationDuration: trembleSec } as CSSProperties}
          >
            {/* Cloud body: three puffs + base. */}
            <g fill={cloudColor(level)}>
              <circle cx="35" cy="52" r="13" />
              <circle cx="51" cy="42" r="16" />
              <circle cx="66" cy="52" r="13" />
              <rect x="28" y="50" width="45" height="14" rx="7" />
            </g>
            {/* Lightning — only once the storm is real (~60%+). */}
            {level >= 60 ? (
              <polygon
                className="stress-bolt"
                style={{ animationDuration: boltSec }}
                points="53,66 45,88 51,88 47,108 61,84 54,84 59,66"
                fill={BOLT_COLOR}
              />
            ) : null}
            {/* Rain: active slots fall continuously, staggered. */}
            <g stroke={RAIN_COLOR} strokeWidth="2" strokeLinecap="round">
              {DROP_SLOTS.slice(0, dropCount).map((x, i) => (
                <line
                  key={x}
                  className="rain-drop"
                  style={
                    {
                      '--rain-opacity': rainOpacity,
                      animationDuration: rainSec,
                      animationDelay: `-${(i * 0.35).toFixed(2)}s`,
                    } as CSSProperties
                  }
                  x1={x}
                  y1="74"
                  x2={x - 2}
                  y2="82"
                />
              ))}
            </g>
          </g>
        </g>
      </svg>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {level}% stress avg
      </span>
    </div>
  );
}
