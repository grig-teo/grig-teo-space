'use client';

import { useEffect, useRef, type MouseEvent } from 'react';

type OrbitSpec = {
  labels: string[];
  radius: number;
  durationSec: number;
  direction: 1 | -1;
};

const ORBITS: OrbitSpec[] = [
  { labels: ['Swift', 'Kotlin', 'Java'], radius: 104, durationSec: 18, direction: 1 },
  {
    labels: ['TypeScript', 'Next.js', 'NestJS', 'FastAPI', 'PostgreSQL'],
    radius: 166,
    durationSec: 30,
    direction: -1,
  },
];

const DOMAIN_BADGES = [
  { label: 'BLE', positionClass: 'left-2 top-6', floatClass: 'orbit-float-1' },
  { label: 'WebRTC', positionClass: 'right-0 top-20', floatClass: 'orbit-float-2' },
  { label: 'Stripe', positionClass: 'bottom-16 left-0', floatClass: 'orbit-float-3' },
  { label: 'OpenCV', positionClass: 'bottom-6 right-2', floatClass: 'orbit-float-4' },
];

/** Vertical squash of the orbit plane — fakes the isometric 3D tilt. */
const SQUASH = 0.42;
const SIZE = 380;
const CENTER = SIZE / 2;

type ChipRef = { orbit: OrbitSpec; index: number; baseAngle: number };

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

/** Sets each chip once at its base angle (reduced-motion / first paint). */
function placeStatic(chips: Map<HTMLSpanElement, ChipRef>): void {
  chips.forEach((ref, el) => placeChip(el, ref.orbit, ref.baseAngle));
}

function useOrbitChips() {
  const chips = useRef(new Map<HTMLSpanElement, ChipRef>());

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      placeStatic(chips.current);
      return;
    }
    return startOrbitLoop(chips.current);
  }, []);

  const register = (ref: ChipRef) => (el: HTMLSpanElement | null) => {
    if (el) chips.current.set(el, ref);
    else chips.current.forEach((_, key) => chips.current.delete(key));
  };

  return { register };
}

function useSceneParallax() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (coarse || reduced) return;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const setTilt = (x: number, y: number) => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (ref.current) ref.current.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
    });
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTilt(
      ((event.clientY - rect.top) / rect.height - 0.5) * -10,
      ((event.clientX - rect.left) / rect.width - 0.5) * 10,
    );
  };

  const onMouseLeave = () => setTilt(0, 0);

  return { ref, onMouseMove, onMouseLeave };
}

function RingEllipses() {
  return (
    <svg className="absolute inset-0 size-full" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      {ORBITS.map((orbit) => (
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

function OrbitChips({ register }: { register: ReturnType<typeof useOrbitChips>['register'] }) {
  return (
    <>
      {ORBITS.flatMap((orbit) =>
        orbit.labels.map((label, index) => (
          <span
            key={label}
            ref={register({
              orbit,
              index,
              baseAngle: (index / orbit.labels.length) * Math.PI * 2,
            })}
            className="absolute left-1/2 top-1/2 font-mono text-xs tracking-wide text-accent [text-shadow:0_0_10px_rgb(var(--color-background))]"
          >
            {label}
          </span>
        )),
      )}
    </>
  );
}

/**
 * Decorative pseudo-3D orbit scene for the landing hero: a pulsing core chip,
 * stack labels riding two elliptical orbits (mobile inner, web/platform outer)
 * with depth-based scale/opacity, and floating domain badges. Positioned by a
 * rAF loop (no CSS 3D transforms — avoids preserve-3d paint bugs); static
 * under prefers-reduced-motion; subtle mouse parallax on fine pointers.
 */
export function HeroScene() {
  const { register } = useOrbitChips();
  const parallax = useSceneParallax();

  return (
    <div
      className="relative mx-auto size-[380px]"
      onMouseMove={parallax.onMouseMove}
      onMouseLeave={parallax.onMouseLeave}
      aria-hidden="true"
    >
      <div ref={parallax.ref} className="absolute inset-0 transition-transform duration-200 ease-out">
        <RingEllipses />
        <div className="orbit-core absolute left-1/2 top-1/2 z-[2] flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-accent/50 bg-surface">
          <span className="font-mono text-lg text-accent">&gt;_</span>
        </div>
        <OrbitChips register={register} />
      </div>
      {DOMAIN_BADGES.map((badge) => (
        <span
          key={badge.label}
          className={`${badge.positionClass} ${badge.floatClass} pointer-events-none absolute select-none font-mono text-[10px] uppercase tracking-wider text-accent-2`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
