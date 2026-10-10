'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ForceGraph } from '@/components/admin/ForceGraph';
import {
  adminGetGraph,
  adminVerify,
  type GraphNodeType,
  type GraphPayload,
} from '@/lib/admin-api';

const NODE_TYPES: GraphNodeType[] = ['profile', 'project', 'experience', 'blog', 'company', 'tech'];

const TYPE_LABEL: Record<GraphNodeType, string> = {
  profile: 'Profile',
  project: 'Projects',
  experience: 'Experience',
  blog: 'Blog',
  company: 'Companies',
  tech: 'Technologies',
};

/** Keeps matching nodes plus their direct neighbours, so a hit keeps its context. */
function filterByQuery(payload: GraphPayload, query: string): GraphPayload {
  const needle = query.trim().toLowerCase();
  if (!needle) return payload;
  const matches = new Set(
    payload.nodes
      .filter((node) => node.label.toLowerCase().includes(needle) || node.type.includes(needle))
      .map((node) => node.id),
  );
  const keep = new Set(matches);
  for (const edge of payload.edges) {
    if (matches.has(edge.source)) keep.add(edge.target);
    if (matches.has(edge.target)) keep.add(edge.source);
  }
  const nodes = payload.nodes.filter((node) => keep.has(node.id));
  const ids = new Set(nodes.map((node) => node.id));
  return { ...payload, nodes, edges: payload.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 font-mono text-sm text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function NodeLink({ id, label, onSelect }: { id: string; label: string; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="font-mono text-xs text-muted transition-colors hover:text-accent"
    >
      {label}
    </button>
  );
}

/** Details of the selected node with its neighbours grouped by relationship. */
function Inspector({
  payload,
  selectedId,
  onSelect,
  onFocus,
  focused,
}: {
  payload: GraphPayload | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFocus: () => void;
  focused: boolean;
}) {
  if (!payload || !selectedId) {
    return (
      <Panel title="Node">
        <p className="font-mono text-xs text-muted">
          Click a node to inspect it. Double-click focus is not needed — use “Focus” to switch the
          canvas to that node’s neighbourhood.
        </p>
      </Panel>
    );
  }
  const node = payload.nodes.find((item) => item.id === selectedId);
  if (!node) return null;
  const labelFor = (id: string) => payload.nodes.find((item) => item.id === id)?.label ?? id;

  const outgoing = payload.edges.filter((edge) => edge.source === node.id);
  const incoming = payload.edges.filter((edge) => edge.target === node.id);
  const groups = new Map<string, string[]>();
  for (const edge of [...outgoing, ...incoming]) {
    const other = edge.source === node.id ? edge.target : edge.source;
    groups.set(edge.rel, [...(groups.get(edge.rel) ?? []), other]);
  }

  return (
    <Panel title="Node">
      <p className="font-mono text-sm text-foreground">{node.label}</p>
      <p className="mt-1 font-mono text-xs text-muted">{node.type}</p>
      {node.sublabel ? <p className="mt-1 font-mono text-xs text-muted">{node.sublabel}</p> : null}
      <p className="mt-1 font-mono text-xs text-muted">degree {node.degree}</p>
      {node.aliases?.length ? (
        <p className="mt-1 font-mono text-xs text-muted">also written: {node.aliases.join(', ')}</p>
      ) : null}

      <button
        type="button"
        onClick={onFocus}
        className="mt-3 rounded border border-border px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
      >
        {focused ? 'Back to global graph' : 'Focus this node'}
      </button>
      {selectedId !== null ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mt-3 ml-2 rounded px-3 py-1 font-mono text-xs text-muted transition-colors hover:text-foreground"
        >
          Clear
        </button>
      ) : null}

      <div className="mt-4 space-y-3">
        {[...groups.entries()].map(([rel, ids]) => (
          <div key={rel}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {rel.replace('_', ' ')} ({ids.length})
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {[...new Set(ids)].slice(0, 14).map((id) => (
                <NodeLink key={id} id={id} label={labelFor(id)} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Orphans, folded labels, hubs and proposed links — the graph's maintenance view. */
function Hygiene({ payload, onSelect }: { payload: GraphPayload; onSelect: (id: string) => void }) {
  const { orphans, duplicates, hubs, suggestions } = payload.stats;
  const labelFor = (id: string) => payload.nodes.find((item) => item.id === id)?.label ?? id;
  const clean = orphans.length === 0 && duplicates.length === 0 && suggestions.length === 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title={`Disconnected content (${orphans.length})`}>
        {orphans.length === 0 ? (
          <p className="font-mono text-xs text-muted">
            {clean ? 'Nothing to clean up.' : 'Every content item links to something.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {orphans.map((node) => (
              <li key={node.id} className="font-mono text-xs text-muted">
                <NodeLink id={node.id} label={node.label} onSelect={onSelect} />
                <span className="ml-2 text-[10px]">{node.type}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Labels folded together (${duplicates.length})`}>
        {duplicates.length === 0 ? (
          <p className="font-mono text-xs text-muted">No duplicate technology labels.</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs text-muted">
            {duplicates.map((entry) => (
              <li key={entry.canonical}>
                <span className="text-foreground">{entry.canonical}</span> ← {entry.aliases.join(', ')}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Hubs (${hubs.length})`}>
        <ul className="space-y-1">
          {hubs.map((hub) => (
            <li key={hub.id} className="font-mono text-xs text-muted">
              <NodeLink id={hub.id} label={hub.label} onSelect={onSelect} />
              <span className="ml-2 text-[10px]">degree {hub.degree}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={`Suggested links (${suggestions.length})`}>
        {suggestions.length === 0 ? (
          <p className="font-mono text-xs text-muted">No unlinked mentions found.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((entry) => (
              <li key={`${entry.source}-${entry.target}`} className="font-mono text-xs text-muted">
                <NodeLink id={entry.source} label={labelFor(entry.source)} onSelect={onSelect} />
                <span className="mx-1">↔</span>
                <NodeLink id={entry.target} label={labelFor(entry.target)} onSelect={onSelect} />
                <p className="text-[10px] text-muted/80">shared: {entry.shared.join(', ')}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default function GraphPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<GraphNodeType[]>(['tech', 'company']);
  const [showIndexEdges, setShowIndexEdges] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await adminGetGraph());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    adminVerify().then((ok) => {
      if (!ok) {
        router.replace('/admin');
        return;
      }
      setAuthed(true);
      void load();
    });
  }, [router, load]);

  const display = useMemo(() => {
    if (!payload) return null;
    const filtered = filterByQuery(payload, query);
    if (showIndexEdges) return filtered;
    return { ...filtered, edges: filtered.edges.filter((edge) => edge.rel !== 'indexes') };
  }, [payload, query, showIndexEdges]);

  /** Counts for what the canvas actually draws, after the type filter. */
  const counts = useMemo(() => {
    if (!display) return { nodes: 0, edges: 0 };
    const ids = new Set(display.nodes.filter((node) => !hiddenTypes.includes(node.type)).map((node) => node.id));
    return {
      nodes: ids.size,
      edges: display.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).length,
    };
  }, [display, hiddenTypes]);

  const toggleType = (type: GraphNodeType) => {
    setHiddenTypes((prev) => (prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]));
  };

  if (!authed) {
    return <p className="p-8 font-mono text-sm text-muted">Checking access…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg text-foreground">Content graph</h1>
        {payload ? (
          <span className="font-mono text-xs text-muted">
            {counts.nodes} nodes · {counts.edges} edges
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded border border-border px-3 py-1 font-mono text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="filter nodes…"
          className="w-48 rounded border border-border bg-background px-3 py-1 font-mono text-xs text-foreground placeholder:text-muted outline-none focus:border-accent/70"
        />
        {NODE_TYPES.map((type) => {
          const on = !hiddenTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
                on ? 'border-accent text-accent' : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {TYPE_LABEL[type]}
              {payload ? ` ${payload.stats.byType[type] ?? 0}` : ''}
            </button>
          );
        })}
        <label className="flex items-center gap-2 font-mono text-xs text-muted">
          <input
            type="checkbox"
            checked={showIndexEdges}
            onChange={(event) => setShowIndexEdges(event.target.checked)}
            className="accent-accent"
          />
          profile index links
        </label>
        {focusId ? (
          <button
            type="button"
            onClick={() => setFocusId(null)}
            className="rounded border border-accent px-3 py-1 font-mono text-xs text-accent"
          >
            ← global graph
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-4 font-mono text-xs text-red-400">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div>
          {display && display.nodes.length > 0 ? (
            <ForceGraph
              payload={display}
              focusId={focusId}
              depth={1}
              height={focusId ? 320 : 520}
              hiddenTypes={hiddenTypes}
              selectedId={selected}
              onSelect={setSelected}
            />
          ) : (
            <p className="rounded-lg border border-border bg-surface p-6 font-mono text-xs text-muted">
              {loading ? 'Loading graph…' : 'No nodes match the current filters.'}
            </p>
          )}
        </div>
        <Inspector
          payload={payload}
          selectedId={selected}
          onSelect={setSelected}
          focused={Boolean(focusId)}
          onFocus={() => setFocusId(focusId ? null : selected)}
        />
      </div>

      <div className="mt-6">
        {payload ? <Hygiene payload={payload} onSelect={setSelected} /> : null}
      </div>
    </div>
  );
}
