'use client';

import { useEffect, useState } from 'react';
import { ForceGraph } from '@/components/admin/ForceGraph';
import { adminGetGraph, type GraphPayload } from '@/lib/admin-api';

/** One fetch shared by every card on the page, and kept for the session. */
let cached: GraphPayload | null = null;
let inflight: Promise<GraphPayload> | null = null;

function loadGraph(): Promise<GraphPayload> {
  if (cached) return Promise.resolve(cached);
  inflight ??= adminGetGraph().then((payload) => {
    cached = payload;
    return payload;
  });
  return inflight;
}

/**
 * The 1-hop neighbourhood of the item being edited, so its links to
 * technologies, companies and other content are visible while writing it.
 */
export function LocalGraphCard({ focusId, title = 'Connections' }: { focusId: string | null; title?: string }) {
  const [payload, setPayload] = useState<GraphPayload | null>(cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!focusId || payload) return;
    let cancelled = false;
    loadGraph()
      .then((result) => {
        if (!cancelled) setPayload(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [focusId, payload]);

  // A new item has no derived node until it is saved, and a failed fetch should
  // never block editing.
  if (!focusId || failed) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 font-mono text-sm text-foreground">{title}</h3>
      {payload ? (
        <ForceGraph
          payload={payload}
          focusId={focusId}
          depth={1}
          height={240}
          selectedId={focusId}
          expandHref="/admin/dashboard/graph"
        />
      ) : (
        <p className="font-mono text-xs text-muted">Loading graph…</p>
      )}
    </section>
  );
}
