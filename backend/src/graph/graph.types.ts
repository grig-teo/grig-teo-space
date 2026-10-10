/** Node kinds the content graph can contain. */
export type GraphNodeType = 'profile' | 'project' | 'experience' | 'blog' | 'company' | 'tech';

/** How two nodes are connected. */
export type GraphEdgeRel =
  /** A project carries this technology in its `tags`. */
  | 'tagged'
  /** A role lists this technology in its `stack`. */
  | 'uses'
  /** A role was held at this company. */
  | 'works_at'
  /** The profile is the index that points at a piece of content. */
  | 'indexes'
  /** One item's prose names another item (derived, not authored). */
  | 'mentions';

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  /** Secondary line: role for an experience, tag count for a project, etc. */
  sublabel?: string;
  /** Number of edges touching this node. */
  degree: number;
  /** Other spellings folded into this node (e.g. "Next.js 14"). */
  aliases?: string[];
  inDevelopment?: boolean;
};

export type GraphEdge = {
  source: string;
  target: string;
  rel: GraphEdgeRel;
};

/** A likely-but-missing connection between two disconnected content nodes. */
export type GraphSuggestion = {
  source: string;
  target: string;
  /** Distinctive terms the two items have in common. */
  shared: string[];
};

export type GraphStats = {
  byType: Record<GraphNodeType, number>;
  byRel: Record<GraphEdgeRel, number>;
  /** Content nodes with no edges, which usually means an unauthored link. */
  orphans: Array<{ id: string; label: string; type: GraphNodeType }>;
  /** Labels folded together because they name the same thing. */
  duplicates: Array<{ canonical: string; aliases: string[] }>;
  /** Highest-degree nodes; ubiquitous tags collapse a force layout. */
  hubs: Array<{ id: string; label: string; degree: number }>;
  suggestions: GraphSuggestion[];
};

export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  generatedAt: string;
};
