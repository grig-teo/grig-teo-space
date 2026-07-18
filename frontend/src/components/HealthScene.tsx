type Props = {
  bpm: number;
};

/** ECG trace under the heart; the sweep loops at twice the beat rate. */
function EcgLine({ sweepSec }: { sweepSec: string }) {
  return (
    <svg width="180" height="36" viewBox="0 0 220 44" aria-hidden>
      <path
        className="ecg-path"
        style={{ animationDuration: sweepSec }}
        d="M0 26 H28 L34 26 L40 10 L48 40 L56 16 L62 26 H116 L122 26 L128 10 L136 40 L144 16 L150 26 H220"
        fill="none"
        stroke="rgb(var(--color-accent))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="340"
      />
    </svg>
  );
}

/**
 * Beating-heart vignette for the landing hero: a heart pulsing at the
 * owner's real average BPM over an ECG trace, with the BPM average as the
 * only (static) label. Pure CSS animation — the durations are set inline
 * from the data; frozen under prefers-reduced-motion (see globals.css).
 */
export function HealthScene({ bpm }: Props) {
  const beatSec = (60 / bpm).toFixed(2);

  return (
    <div id="health" className="flex flex-col items-center gap-1" aria-hidden="true">
      <span
        className="health-heartbeat font-mono text-3xl text-accent"
        style={{ animationDuration: `${beatSec}s` }}
      >
        ♥
      </span>
      <EcgLine sweepSec={`${(Number(beatSec) * 2).toFixed(2)}s`} />
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {bpm} bpm avg
      </span>
    </div>
  );
}
