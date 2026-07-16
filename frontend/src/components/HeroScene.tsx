'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';

const INNER_STACK = ['Swift', 'Kotlin', 'Java'];
const OUTER_STACK = ['TypeScript', 'Next.js', 'NestJS', 'FastAPI', 'PostgreSQL'];

const DOMAIN_BADGES = [
  { label: 'BLE', positionClass: 'left-2 top-6', floatClass: 'orbit-float-1' },
  { label: 'WebRTC', positionClass: 'right-0 top-20', floatClass: 'orbit-float-2' },
  { label: 'Stripe', positionClass: 'bottom-16 left-0', floatClass: 'orbit-float-3' },
  { label: 'OpenCV', positionClass: 'bottom-6 right-2', floatClass: 'orbit-float-4' },
];

type RingVariant = 'inner' | 'outer';

function OrbitChip({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:text-accent">
      {label}
    </span>
  );
}

function OrbitSatellite({
  variant,
  label,
  angle,
  radius,
}: {
  variant: RingVariant;
  label: string;
  angle: number;
  radius: number;
}) {
  const placement = `translate(-50%, -50%) rotate(${angle}deg) translateX(${radius}px) rotate(${-angle}deg)`;

  return (
    <div className="absolute left-1/2 top-1/2" style={{ transform: placement }}>
      <div className={`orbit-counter-${variant}`}>
        <div className="orbit-billboard">
          <OrbitChip label={label} />
        </div>
      </div>
    </div>
  );
}

function OrbitRing({ variant, labels }: { variant: RingVariant; labels: string[] }) {
  const radius = variant === 'inner' ? 110 : 170;

  return (
    <div className={`orbit-ring orbit-ring-${variant}`}>
      <div className="absolute inset-0 rounded-full border border-border/60" />
      <div className={`orbit-spin-${variant} absolute inset-0`}>
        {labels.map((label, index) => (
          <OrbitSatellite
            key={label}
            variant={variant}
            label={label}
            angle={(360 / labels.length) * index}
            radius={radius}
          />
        ))}
      </div>
    </div>
  );
}

function CoreChip() {
  return (
    <div className="orbit-core absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-accent/50 bg-surface">
      <span className="font-mono text-lg text-accent">&gt;_</span>
    </div>
  );
}

function FloatBadge({ label, positionClass, floatClass }: (typeof DOMAIN_BADGES)[number]) {
  return (
    <span
      className={`${positionClass} ${floatClass} pointer-events-none absolute select-none font-mono text-[10px] uppercase tracking-wider text-accent-2`}
    >
      {label}
    </span>
  );
}

function useSceneParallax() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [enabled, setEnabled] = useState(false);
  const target = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnabled(!coarse && !reduced);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const schedule = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setTilt(target.current);
    });
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    target.current = {
      x: ((event.clientY - rect.top) / rect.height - 0.5) * -12,
      y: ((event.clientX - rect.left) / rect.width - 0.5) * 12,
    };
    schedule();
  };

  const onMouseLeave = () => {
    target.current = { x: 0, y: 0 };
    schedule();
  };

  return { tilt, onMouseMove, onMouseLeave };
}

/**
 * Decorative CSS-3D orbit scene for the landing hero: a pulsing core chip,
 * two counter-rotating rings carrying stack chips (mobile inner, web/platform
 * outer — labels stay readable via a counter-spin billboard) and free-floating
 * domain badges. The scene tilts subtly with the mouse (rAF-throttled ±6deg),
 * disabled on touch pointers and under prefers-reduced-motion.
 */
export function HeroScene() {
  const { tilt, onMouseMove, onMouseLeave } = useSceneParallax();

  return (
    <div
      className="relative mx-auto size-[380px] [perspective:900px]"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      aria-hidden="true"
    >
      <div
        className="orbit-scene"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <CoreChip />
        <OrbitRing variant="inner" labels={INNER_STACK} />
        <OrbitRing variant="outer" labels={OUTER_STACK} />
      </div>
      {DOMAIN_BADGES.map((badge) => (
        <FloatBadge key={badge.label} {...badge} />
      ))}
    </div>
  );
}
