'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { GraphEdge, GraphEdgeRel, GraphNode, GraphNodeType, GraphPayload } from '@/lib/admin-api';

/** Base radius per node kind; technology nodes stay small so they read as texture. */
const RADIUS: Record<GraphNodeType, number> = {
  profile: 9,
  project: 8,
  experience: 8,
  blog: 7,
  company: 6,
  tech: 4,
  metric: 6,
  note: 6,
  document: 6,
  log: 5,
  repo: 7,
};

/** Rest length per edge kind — index links are structural, so they stretch further. */
const SPRING_LENGTH: Record<GraphEdgeRel, number> = {
  tagged: 62,
  uses: 54,
  works_at: 58,
  indexes: 150,
  mentions: 120,
  feeds: 70,
  hosts: 80,
};

/** Repulsion between every pair; scaled by node weight so hubs push harder. */
const REPULSION = 1400;

/** Below this the layout stops jittering and the loop idles. */
const ALPHA_FLOOR = 0.006;

type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Set while the user drags, so the layout leaves the node where it was put. */
  pinned: boolean;
};

type Palette = ReturnType<typeof readPalette>;

export type ForceGraphProps = {
  payload: GraphPayload;
  /** When set, only this node's neighbourhood is drawn (Obsidian's local graph). */
  focusId?: string | null;
  depth?: number;
  height?: number;
  hiddenTypes?: GraphNodeType[];
  selectedId?: string | null;
  onSelect?: (nodeId: string | null) => void;
  /** Renders an "open full page" affordance in the corner when provided. */
  expandHref?: string;
  className?: string;
};

/** Corner brackets that point out to enter fullscreen and in to leave it. */
function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5"
    >
      {active ? (
        <>
          <path d="M9 4v5H4" />
          <path d="M15 20v-5h5" />
          <path d="M20 9h-5V4" />
          <path d="M4 15h5v5" />
        </>
      ) : (
        <>
          <path d="M4 9V4h5" />
          <path d="M20 15v5h-5" />
          <path d="M15 4h5v5" />
          <path d="M9 20H4v-5" />
        </>
      )}
    </svg>
  );
}

/** Diagonal arrows, the conventional "expand to full page" mark. */
function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5"
    >
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

/** Theme-aware colours; the graph is the one place where hues carry meaning. */
function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  const channel = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const accent = channel('--color-accent', '13 148 136');
  const foreground = channel('--color-foreground', '22 28 38');
  const muted = channel('--color-muted', '92 104 118');
  const border = channel('--color-border', '222 224 228');
  return {
    accent: `rgb(${accent})`,
    foreground: `rgb(${foreground})`,
    muted: `rgb(${muted})`,
    border: `rgb(${border})`,
    kinds: {
      profile: `rgb(${accent})`,
      project: '#c98a3c',
      experience: '#8b7ad6',
      blog: '#c96f90',
      company: `rgb(${muted})`,
      // Technology nodes carry no label at rest, so they need enough contrast to
      // read as texture rather than disappearing into the surface.
      tech: `rgb(${muted})`,
      // Health pipeline data, in its own cooler family.
      metric: '#3f8fd0',
      note: '#b58a3c',
      document: '#6f7f96',
      log: '#9aa0a6',
      // Source repositories.
      repo: '#4f9d6a',
    } satisfies Record<GraphNodeType, string>,
  };
}

/** Nodes and edges to draw, narrowed to a neighbourhood and the type filter. */
function visibleGraph(
  payload: GraphPayload,
  focusId: string | null | undefined,
  depth: number,
  hiddenTypes: GraphNodeType[],
) {
  const hidden = new Set(hiddenTypes);
  if (!focusId) {
    const nodes = payload.nodes.filter((node) => !hidden.has(node.type));
    const ids = new Set(nodes.map((node) => node.id));
    return { nodes, edges: payload.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
  }

  // Breadth-first out from the focused node, treating edges as undirected.
  const adjacency = new Map<string, string[]>();
  for (const edge of payload.edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge.source]);
  }
  const keep = new Set([focusId]);
  let frontier = [focusId];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (!keep.has(neighbour)) {
          keep.add(neighbour);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  const nodes = payload.nodes.filter((node) => keep.has(node.id) && !hidden.has(node.type));
  const ids = new Set(nodes.map((node) => node.id));
  return { nodes, edges: payload.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
}

/** Reuses positions for surviving nodes so re-filtering does not reshuffle the view. */
function seedSimNodes(nodes: GraphNode[], previous: Map<string, SimNode>, width: number, height: number): SimNode[] {
  return nodes.map((node, index) => {
    const existing = previous.get(node.id);
    if (existing) return { ...existing, ...node };
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.32;
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      pinned: false,
    };
  });
}

/** One physics tick: pairwise repulsion, edge springs and a pull to the centre. */
function simulate(nodes: SimNode[], edges: GraphEdge[], alpha: number, width: number, height: number): void {
  // Repulsion is summed over every other node, so a 90-node graph feels far more
  // push than a 10-node one at the same spacing. Damping it slowly with size keeps
  // a big graph spread across the canvas instead of collapsing into a knot, while
  // a small local graph keeps the full strength it needs to stay readable.
  const repulsion = REPULSION * Math.min(1, 80 / Math.max(80, nodes.length));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distanceSq = Math.max(dx * dx + dy * dy, 24);
      const force = (repulsion * alpha) / distanceSq;
      const distance = Math.sqrt(distanceSq);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const rest = SPRING_LENGTH[edge.rel] ?? 70;
    const force = ((distance - rest) / distance) * 0.06 * alpha;
    const fx = dx * force;
    const fy = dy * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  for (const node of nodes) {
    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += (width / 2 - node.x) * 0.004 * alpha;
    node.vy += (height / 2 - node.y) * 0.004 * alpha;
    node.vx *= 0.82;
    node.vy *= 0.82;
    node.x = Math.max(RADIUS[node.type] + 2, Math.min(width - RADIUS[node.type] - 2, node.x + node.vx));
    node.y = Math.max(RADIUS[node.type] + 2, Math.min(height - RADIUS[node.type] - 2, node.y + node.vy));
  }
}

/** Paints the background, edges, nodes and the label of the focused/hovered node. */
function draw(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: GraphEdge[],
  palette: Palette,
  state: { hovered: string | null; selected: string | null; focusId?: string | null; labelAll: boolean; width: number; height: number },
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  ctx.clearRect(0, 0, state.width, state.height);

  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;
    const touchesFocus = state.focusId && (edge.source === state.focusId || edge.target === state.focusId);
    const touchesActive = state.selected && (edge.source === state.selected || edge.target === state.selected);
    ctx.strokeStyle = palette.border;
    ctx.globalAlpha = edge.rel === 'indexes' ? 0.35 : touchesFocus || touchesActive ? 0.9 : 0.5;
    ctx.lineWidth = touchesFocus || touchesActive ? 1.4 : 0.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const node of nodes) {
    const radius = RADIUS[node.type];
    const active = node.id === state.hovered || node.id === state.selected || node.id === state.focusId;
    ctx.fillStyle = palette.kinds[node.type];
    ctx.globalAlpha = node.type === 'tech' && !active ? 0.65 : 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, active ? radius + 1.5 : radius, 0, Math.PI * 2);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  const labelled = nodes.filter(
    (node) => state.labelAll || node.type !== 'tech' || node.id === state.hovered || node.id === state.selected,
  );
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // Greedy label placement: an inactive label that would sit on top of one
  // already drawn is dropped, which keeps dense clusters readable. The hovered,
  // selected and focused labels always draw.
  const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const node of labelled) {
    const active = node.id === state.hovered || node.id === state.selected || node.id === state.focusId;
    const text = node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;
    const halfWidth = ctx.measureText(text).width / 2;
    const box = {
      x1: node.x - halfWidth,
      y1: node.y + RADIUS[node.type] + 3,
      x2: node.x + halfWidth,
      y2: node.y + RADIUS[node.type] + 15,
    };
    if (!active && placed.some((other) => box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1)) {
      continue;
    }
    placed.push(box);
    ctx.fillStyle = active ? palette.foreground : palette.muted;
    ctx.fillText(text, node.x, node.y + RADIUS[node.type] + 3);
  }
}

export function ForceGraph({
  payload,
  focusId = null,
  depth = 1,
  height = 460,
  hiddenTypes = [],
  selectedId = null,
  onSelect,
  expandHref,
  className,
}: ForceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const graphRef = useRef(visibleGraph(payload, focusId, depth, hiddenTypes));
  const alphaRef = useRef(1);
  const paletteRef = useRef<Palette | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
  const dragRef = useRef<string | null>(null);
  const labelAllRef = useRef(Boolean(focusId));
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [fullscreen, setFullscreen] = useState(false);
  // Whether the browser itself reports this wrapper as the fullscreen element.
  // Tracked separately because the native API can be left by keyboard, and the
  // layout must follow what the browser is actually doing, not what was asked.
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  // Mirrored in a ref so the toggle never reads a stale value.
  const fullscreenRef = useRef(false);

  /** The wrapper is expanded when either the overlay or the native API is on. */
  const expanded = fullscreen || nativeFullscreen;

  const exitFullscreen = useCallback(() => {
    fullscreenRef.current = false;
    setFullscreen(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  /**
   * Fullscreen is a CSS overlay first and the native Fullscreen API second: the
   * overlay fills the viewport on its own, so a browser that refuses the API
   * (a sandboxed iframe, for instance) still gets a usable full-screen graph,
   * while the API additionally hides the browser chrome where it is allowed.
   */
  const toggleFullscreen = useCallback(() => {
    const next = !fullscreenRef.current;
    fullscreenRef.current = next;
    setFullscreen(next);
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (next) {
      void wrap.requestFullscreen?.().catch(() => undefined);
    } else if (document.fullscreenElement === wrap) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  // Escape closes the overlay and leaves native fullscreen, so the two never
  // disagree about whether the graph is expanded.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded, exitFullscreen]);

  // Leaving fullscreen by keyboard (Esc/F11) must not strand the overlay.
  useEffect(() => {
    const wrap = wrapRef.current;
    const onFullscreenChange = () => {
      const native = Boolean(wrap) && document.fullscreenElement === wrap;
      setNativeFullscreen(native);
      if (!native) {
        fullscreenRef.current = false;
        setFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const hiddenKey = [...hiddenTypes].sort().join(',');
  const graph = useMemo(
    () => visibleGraph(payload, focusId, depth, hiddenTypes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payload, focusId, depth, hiddenKey],
  );

  useEffect(() => {
    graphRef.current = graph;
    labelAllRef.current = Boolean(focusId);
    const previous = new Map(simRef.current.map((node) => [node.id, node]));
    // Seed from the wrapper, not the canvas: the canvas has no layout width until
    // the resize effect below runs, and seeding at width 0 stacks every node.
    const width = wrapRef.current?.clientWidth || 800;
    simRef.current = seedSimNodes(graph.nodes, previous, width, height);
    alphaRef.current = 1;
  }, [graph, focusId, height]);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;

    /** Fullscreen fills whatever the viewport gives the wrapper. */
    const frameHeight = () => (expanded ? Math.max(wrap.clientHeight, 160) : height);

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      const canvasHeight = frameHeight();
      canvas.width = width * ratio;
      canvas.height = canvasHeight * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${canvasHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paletteRef.current = readPalette();
      alphaRef.current = Math.max(alphaRef.current, 0.35);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const tick = () => {
      const width = wrap.clientWidth;
      const currentHeight = frameHeight();
      const palette = paletteRef.current ?? (paletteRef.current = readPalette());
      if (alphaRef.current > ALPHA_FLOOR) {
        simulate(simRef.current, graphRef.current.edges, alphaRef.current, width, currentHeight);
        alphaRef.current *= 0.992;
      }
      draw(ctx, simRef.current, graphRef.current.edges, palette, {
        hovered: hoveredRef.current,
        selected: selectedRef.current,
        focusId,
        labelAll: labelAllRef.current,
        width,
        height: currentHeight,
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [height, focusId, expanded]);

  /** Nearest node under the pointer, within its own radius plus a small margin. */
  const nodeAt = (event: React.PointerEvent<HTMLCanvasElement>): SimNode | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: SimNode | null = null;
    let bestDistance = Infinity;
    for (const node of simRef.current) {
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance < RADIUS[node.type] + 6 && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  };

  return (
    <div
      ref={wrapRef}
      className={
        expanded ? `fixed inset-0 z-50 bg-background ${className ?? ''}` : `relative ${className ?? ''}`
      }
    >
      {expanded ? (
        <p className="pointer-events-none absolute left-4 top-4 z-10 rounded border border-border bg-surface/85 px-2 py-1 font-mono text-xs text-muted backdrop-blur">
          {graph.nodes.length} nodes · {graph.edges.length} edges · Esc to exit
        </p>
      ) : null}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={expanded ? 'Exit full screen' : 'Open the graph full screen'}
          aria-pressed={expanded}
          title={expanded ? 'Exit full screen (Esc)' : 'Open full screen'}
          className="rounded border border-border bg-surface/85 p-1.5 text-muted backdrop-blur transition-colors hover:border-accent hover:text-accent"
        >
          <FullscreenIcon active={expanded} />
        </button>
        {expandHref ? (
          <Link
            href={expandHref}
            aria-label="Open the full graph page"
            title="Open the full graph page"
            className="rounded border border-border bg-surface/85 p-1.5 text-muted backdrop-blur transition-colors hover:border-accent hover:text-accent"
          >
            <ExpandIcon />
          </Link>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        className={`block w-full cursor-grab touch-none bg-surface ${expanded ? '' : 'rounded-lg border border-border'}`}
        onPointerDown={(event) => {
          const node = nodeAt(event);
          if (!node) {
            onSelectRef.current?.(null);
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = node.id;
          node.pinned = true;
          alphaRef.current = Math.max(alphaRef.current, 0.3);
          onSelectRef.current?.(node.id);
        }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const dragged = dragRef.current;
          if (dragged) {
            const node = simRef.current.find((item) => item.id === dragged);
            if (node) {
              node.x = event.clientX - rect.left;
              node.y = event.clientY - rect.top;
              alphaRef.current = Math.max(alphaRef.current, 0.25);
            }
            return;
          }
          const hovered = nodeAt(event);
          hoveredRef.current = hovered?.id ?? null;
          event.currentTarget.style.cursor = hovered ? 'pointer' : 'grab';
        }}
        onPointerUp={(event) => {
          const dragged = dragRef.current;
          if (dragged) {
            const node = simRef.current.find((item) => item.id === dragged);
            if (node) node.pinned = false;
          }
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
    </div>
  );
}
