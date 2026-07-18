'use client';

import { useEffect, useRef } from 'react';
import type { PublicHealthMetric, PublicHealthPayload } from '@/lib/api';

/** Vertical squash of the orbit plane — same isometric fake as HeroScene. */
const SQUASH = 0.42;
const SIZE = 440;
const CENTER = SIZE / 2;

type OrbitSpec = {
  chips: string[];
  radius: number;
  durationSec: number;
  direction: 1 | -1;
};

type ChipRef = { orbit: OrbitSpec; index: number; baseAngle: number };

function formatChip(metric: PublicHealthMetric): string {
  const digits = metric.metric === 'sleep_duration_h' || metric.metric === 'distance_km' ? 1 : 0;
  const value = metric.summary.avg !== null ? metric.summary.avg.toFixed(digits) : '—';
  return `${metric.label} ${value}${metric.unit ? ` ${metric.unit}` : ''}`;
}

/** The heart core beats at the visitor-visible average heart rate; falls
 *  back to a neutral 72 BPM when heart rate isn't among the shared metrics. */
function averageBpm(metrics: PublicHealthMetric[]): number {
  const avg = metrics.find((m) => m.metric === 'heart_rate')?.summary.avg;
  return avg && avg > 30 && avg < 220 ? Math.round(avg) : 72;
}

function buildOrbits(chips: string[]): OrbitSpec[] {
  const half = Math.ceil(chips.length / 2);
  const orbits: OrbitSpec[] = [
    { chips: chips.slice(0, half), radius: 128, durationSec: 24, direction: 1 },
    { chips: chips.slice(half), radius: 190, durationSec: 38, direction: -1 },
  ];
  return orbits.filter((orbit) => orbit.chips.length > 0);
}

/** Computes one chip's pseudo-3D placement: elliptical path, nearer chips
 *  (bottom of the ellipse) render larger, brighter and above the core. */
function placeChip(el: HTMLSpanElement, orbit: OrbitSpec, angle: number): void {
  const depth = Math.sin(angle);
  const x = Math.cos(angle) * orbit.radius;
  const y = depth * orbit.radius * SQUASH;
  const near = (depth + 1) / 2;
  el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${0.78 + near * 0.3})`;
  el.style.opacity = String(0.45 + near * 0.55);
  el.style.zIndex = depth >= 0 ? '3' : '1';
}

/** rAF loop advancing every chip along its orbit; returns a stop function. */
function startOrbitLoop(chips: Map<HTMLSpanElement, ChipRef>): () => void {
  let frame = 0;
  const startedAt = performance.now();
  const tick = (now: number) => {
    const elapsed = (now - startedAt) / 1000;
    chips.forEach((ref, el) => {
      const angle = ref.baseAngle + (elapsed / ref.orbit.durationSec) * Math.PI * 2 * ref.orbit.direction;
      placeChip(el, ref.orbit, angle);
    });
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function useOrbitChips() {
  const chips = useRef(new Map<HTMLSpanElement, ChipRef>());

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      chips.current.forEach((ref, el) => placeChip(el, ref.orbit, ref.baseAngle));
      return;
    }
    return startOrbitLoop(chips.current);
  }, []);

  const register = (ref: ChipRef) => (el: HTMLSpanElement | null) => {
    if (el) chips.current.set(el, ref);
  };

  return { register };
}

function RingEllipses({ orbits }: { orbits: OrbitSpec[] }) {
  return (
    <svg className="absolute inset-0 size-full" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      {orbits.map((orbit) => (
        <ellipse
          key={orbit.radius}
          cx={CENTER}
          cy={CENTER}
          rx={orbit.radius}
          ry={orbit.radius * SQUASH}
          fill="none"
          stroke="rgb(var(--color-border) / 0.6)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/** ECG trace under the heart core; the sweep loops at twice the beat rate. */
function EcgLine({ sweepSec }: { sweepSec: string }) {
  return (
    <svg width="220" height="44" viewBox="0 0 220 44" aria-hidden>
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
 * Data-driven pseudo-3D backdrop for the landing health section: a heart
 * core beating at the owner's real average BPM over an ECG trace, with the
 * publicly shared metrics (label + current average) riding two elliptical
 * orbits. Same rendering approach as HeroScene (rAF, no CSS 3D); static
 * under prefers-reduced-motion.
 */
export function HealthScene({ payload }: { payload: PublicHealthPayload }) {
  const { register } = useOrbitChips();
  const orbits = buildOrbits(payload.metrics.map(formatChip));
  const bpm = averageBpm(payload.metrics);
  const beatSec = `${(60 / bpm).toFixed(2)}s`;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 hidden items-center opacity-40 lg:flex"
      aria-hidden="true"
    >
      <div className="relative size-[440px]">
        <RingEllipses orbits={orbits} />
        <div className="absolute left-1/2 top-1/2 z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
          <span
            className="health-heartbeat font-mono text-3xl text-accent"
            style={{ animationDuration: beatSec }}
          >
            ♥
          </span>
          <EcgLine sweepSec={`${((60 / bpm) * 2).toFixed(2)}s`} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {bpm} bpm avg
          </span>
        </div>
        {orbits.flatMap((orbit) =>
          orbit.chips.map((chip, index) => (
            <span
              key={chip}
              ref={register({
                orbit,
                index,
                baseAngle: (index / orbit.chips.length) * Math.PI * 2,
              })}
              className="absolute left-1/2 top-1/2 whitespace-nowrap font-mono text-xs tracking-wide text-accent [text-shadow:0_0_10px_rgb(var(--color-background))]"
            >
              {chip}
            </span>
          )),
        )}
      </div>
    </div>
  );
}
