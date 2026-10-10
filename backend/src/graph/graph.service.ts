import { Injectable } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import { HealthGraphService } from './health-graph.service';
import { RepoGraphService } from './repo-graph.service';
import type { BlogPost, ExperienceItem, Locale, Profile, Project } from '../types';
import type {
  GraphEdge,
  GraphEdgeRel,
  GraphNode,
  GraphNodeType,
  GraphPayload,
  GraphStats,
  GraphSuggestion,
} from './graph.types';

/** Content is authored per locale; the graph is locale-agnostic, so match on
 *  every locale's prose to avoid missing a mention only the RU text carries. */
const GRAPH_LOCALES: Locale[] = ['en', 'ru', 'ro'];

/** Technology labels shorter than this are skipped when scanning prose, because
 *  two- and three-letter tokens ("S3", "EAS") match far too much unrelated text. */
const MIN_MENTION_LABEL = 3;

/** Minimum shared distinctive terms before two disconnected items are proposed. */
const SUGGESTION_MIN_SHARED = 2;

/** A term used by more items than this is too common to imply a relationship. */
const MAX_TERM_DOCUMENTS = 3;

/** Node kinds whose own prose is scanned for mentions of other nodes. */
const PROSE_TYPES: GraphNodeType[] = ['profile', 'project', 'experience', 'blog'];

/** Node kinds contributed by the health pipeline. */
const HEALTH_TYPES: GraphNodeType[] = ['metric', 'note', 'document', 'log'];

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'along', 'among', 'another', 'because', 'before',
  'being', 'between', 'built', 'could', 'during', 'every', 'first', 'found', 'further',
  'generated', 'other', 'over', 'should', 'since', 'still', 'their', 'there', 'these',
  'thing', 'those', 'through', 'under', 'using', 'where', 'which', 'while', 'within',
  'without', 'would', 'works', 'server', 'system', 'built', 'makes', 'builds',
]);

type TechEntry = { label: string; raw: string };

type TechIndex = {
  /** Canonical label per lowercased raw spelling. */
  canonicalOf: Map<string, string>;
  /** Other spellings folded into each canonical label. */
  aliasesOf: Map<string, string[]>;
  labels: string[];
};

/** Strips a trailing version/qualifier so "Next.js 15" can fold into "Next.js". */
function versionBase(label: string): string {
  return label.replace(/\s+v?\d+(\.\d+)*$/i, '').trim();
}

/**
 * Folds spellings that name the same technology into one node.
 *
 * A qualifier is only removed when the bare form is itself already in the
 * vocabulary, so "Material 3" stays intact while "Next.js 14" and "Next.js 15"
 * both collapse into the existing "Next.js".
 */
function buildTechIndex(entries: TechEntry[]): TechIndex {
  const spellings = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.label.toLowerCase();
    const existing = spellings.get(key);
    // Prefer the shortest spelling seen for a given key ("Express" over "Express.js").
    if (!existing || entry.label.length < existing.length) {
      spellings.set(key, entry.label);
    }
  }

  const canonicalOf = new Map<string, string>();
  const aliasesOf = new Map<string, string[]>();
  for (const [key, spelling] of spellings) {
    const base = versionBase(spelling).toLowerCase();
    const canonical = base !== key && spellings.has(base) ? spellings.get(base)! : spelling;
    canonicalOf.set(key, canonical);
    if (canonical === spelling) {
      continue;
    }
    aliasesOf.set(canonical, [...(aliasesOf.get(canonical) ?? []), spelling]);
  }

  return { canonicalOf, aliasesOf, labels: [...new Set(canonicalOf.values())] };
}

/** Splits the free-text `stack` field into individual technology labels. */
function splitStack(raw: string): string[] {
  return raw
    .split(/[·,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Every technology label a project or role contributes, before folding. */
function collectTechEntries(projects: Project[], experience: ExperienceItem[]): TechEntry[] {
  const entries: TechEntry[] = [];
  for (const project of projects) {
    for (const tag of project.tags ?? []) {
      if (tag.trim()) entries.push({ label: tag.trim(), raw: tag.trim() });
    }
  }
  for (const item of experience) {
    const raw = localized(item.stack);
    for (const label of splitStack(raw)) {
      entries.push({ label, raw: label });
    }
  }
  return entries;
}

/** English value of a localized field, falling back to any locale present. */
function localized(value?: Record<Locale, string>): string {
  if (!value) return '';
  return value.en ?? value.ru ?? value.ro ?? '';
}



/** Flattens a BlockNote document into plain text for mention scanning. */
function blockNoteText(raw: string): string {
  try {
    const blocks = JSON.parse(raw) as Array<{
      content?: Array<{ text?: string }> | string;
      children?: unknown[];
    }>;
    const lines: string[] = [];
    const walk = (list: Array<{ content?: Array<{ text?: string }> | string; children?: unknown[] }>) => {
      for (const block of list) {
        if (Array.isArray(block.content)) {
          lines.push(block.content.map((part) => part.text ?? '').join(''));
        } else if (typeof block.content === 'string') {
          lines.push(block.content);
        }
        if (Array.isArray(block.children)) {
          walk(block.children as typeof list);
        }
      }
    };
    walk(blocks);
    return lines.join(' \n ');
  } catch {
    // A body saved as plain markdown/tests stays usable as-is.
    return raw;
  }
}

/** The prose a node carries, used for derived mention edges. */
function proseOf(node: GraphNode, sources: GraphSources, locales: Locale[] = GRAPH_LOCALES): string {
  const [, rawId] = node.id.split(':');
  if (node.type === 'project') {
    const project = sources.projects.find((item) => item.id === rawId);
    if (!project) return '';
    return joinLocales(
      [project.title, project.description, project.overview],
      [project.highlights],
      locales,
    );
  }
  if (node.type === 'experience') {
    const item = sources.experience.find((entry) => entry.id === rawId);
    if (!item) return '';
    return joinLocales(
      [item.company, item.role, item.summary, item.description],
      [item.highlights],
      locales,
    );
  }
  if (node.type === 'blog') {
    const post = sources.blog.find((entry) => entry.id === rawId);
    if (!post) return '';
    return joinLocales([post.title, post.excerpt], [], locales) +
      (locales.includes('en') ? ` \n ${blockNoteText(localized(post.body))}` : '');
  }
  if (node.type === 'profile') {
    return joinLocales([sources.profile.name, sources.profile.title], [], locales) +
      ` \n ${joinLocales([sources.profile.about], [], locales)}`;
  }
  return '';
}

/** Joins the requested locales' values of several localized fields. */
function joinLocales(
  strings: Array<Record<Locale, string> | undefined>,
  lists: Array<Record<Locale, string[]> | undefined>,
  locales: Locale[],
): string {
  const parts: string[] = [];
  for (const locale of locales) {
    for (const value of strings) {
      if (value?.[locale]) parts.push(value[locale]);
    }
    for (const list of lists) {
      parts.push(...(list?.[locale] ?? []));
    }
  }
  return parts.join(' \n ');
}

type GraphSources = {
  profile: Profile;
  projects: Project[];
  experience: ExperienceItem[];
  blog: BlogPost[];
};

/** True when `label` appears in `haystack` as a whole word. */
function mentionsText(haystack: string, label: string): boolean {
  if (label.length < MIN_MENTION_LABEL) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(haystack);
}

@Injectable()
export class GraphService {
  constructor(
    private readonly content: ContentService,
    private readonly healthGraph: HealthGraphService,
    private readonly repoGraph: RepoGraphService,
  ) {}

  /** Builds the whole graph from the stored site content and health data. */
  async build(): Promise<GraphPayload> {
    const [profile, projects, experience, blog] = await Promise.all([
      this.content.getProfile(),
      this.content.getProjects(),
      this.content.getExperience(),
      this.content.getBlogPosts(),
    ]);
    const sources: GraphSources = { profile, projects, experience, blog };
    const tech = buildTechIndex(collectTechEntries(projects, experience));
    const [health, repos] = await Promise.all([
      this.healthGraph.build(),
      this.repoGraph.build({ profile, projects, experience }),
    ]);

    const nodes = [...contentNodes(sources), ...techNodes(tech), ...health.nodes, ...repos.nodes];
    const authored = [
      ...structuredEdges(sources, tech),
      ...indexEdges(sources),
      ...health.edges,
      ...repos.edges,
    ];
    const edges = dedupeEdges([...authored, ...mentionEdges(nodes, sources, authored)]);
    const withDegrees = applyDegrees(nodes, edges);

    return {
      nodes: withDegrees,
      edges,
      stats: collectStats(withDegrees, edges, tech, sources),
      generatedAt: new Date().toISOString(),
    };
  }
}

/** One node per project, role, blog post, company and the profile itself. */
function contentNodes(sources: GraphSources): GraphNode[] {
  const nodes: GraphNode[] = [
    {
      id: 'profile',
      type: 'profile',
      label: localized(sources.profile.name) || 'Profile',
      sublabel: localized(sources.profile.title),
      degree: 0,
    },
  ];

  for (const project of sources.projects) {
    nodes.push({
      id: `project:${project.id}`,
      type: 'project',
      label: localized(project.title) || project.id,
      sublabel: `${project.tags?.length ?? 0} tags`,
      degree: 0,
      inDevelopment: project.inDevelopment,
    });
  }

  for (const item of sources.experience) {
    nodes.push({
      id: `experience:${item.id}`,
      type: 'experience',
      label: localized(item.company) || item.id,
      sublabel: `${localized(item.role)} · ${localized(item.period)}`,
      degree: 0,
    });
  }

  for (const post of sources.blog) {
    nodes.push({
      id: `blog:${post.id}`,
      type: 'blog',
      label: localized(post.title) || post.id,
      degree: 0,
    });
  }

  // Companies are contributed once per role; collapse the repeats.
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

/** One node per folded technology label. */
function techNodes(tech: TechIndex): GraphNode[] {
  return tech.labels.map((label) => ({
    id: `tech:${label.toLowerCase()}`,
    type: 'tech' as GraphNodeType,
    label,
    degree: 0,
    aliases: tech.aliasesOf.get(label),
  }));
}

function techId(label: string, tech: TechIndex): string {
  const canonical = tech.canonicalOf.get(label.toLowerCase()) ?? label;
  return `tech:${canonical.toLowerCase()}`;
}

/**
 * Edges the content states outright: tags and stack.
 *
 * Employers are not separate nodes: a role already carries its company as its
 * label, and every company currently has exactly one role, so a company node
 * only duplicated its role's label without adding structure.
 */
function structuredEdges(sources: GraphSources, tech: TechIndex): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const project of sources.projects) {
    for (const tag of project.tags ?? []) {
      if (tag.trim()) {
        edges.push({ source: `project:${project.id}`, target: techId(tag, tech), rel: 'tagged' });
      }
    }
  }
  for (const item of sources.experience) {
    for (const label of splitStack(localized(item.stack))) {
      edges.push({ source: `experience:${item.id}`, target: techId(label, tech), rel: 'uses' });
    }
  }
  return edges;
}

/** The profile acts as the index note pointing at every piece of content. */
function indexEdges(sources: GraphSources): GraphEdge[] {
  const targets = [
    ...sources.projects.map((item) => `project:${item.id}`),
    ...sources.experience.map((item) => `experience:${item.id}`),
    ...sources.blog.map((item) => `blog:${item.id}`),
  ];
  return targets.map((target) => ({ source: 'profile', target, rel: 'indexes' as GraphEdgeRel }));
}

/**
 * Edges derived from one item's prose naming another (Obsidian's implicit
 * links). Pairs already joined by an authored edge are skipped: a mention of a
 * technology the item already lists as a tag would otherwise draw a second,
 * parallel edge for the same relationship.
 */
function mentionEdges(nodes: GraphNode[], sources: GraphSources, authored: GraphEdge[]): GraphEdge[] {
  const content = nodes.filter((node) => PROSE_TYPES.includes(node.type));
  // Health nodes are excluded as targets: their labels are generic ("Heart
  // rate"), and their `feeds` edge already states how they relate.
  const candidates = nodes.filter(
    (node) => node.type !== 'profile' && !HEALTH_TYPES.includes(node.type),
  );
  const connected = new Set(authored.flatMap((edge) => [`${edge.source}|${edge.target}`, `${edge.target}|${edge.source}`]));
  const edges: GraphEdge[] = [];

  for (const source of content) {
    const text = proseOf(source, sources);
    if (!text) continue;
    for (const target of candidates) {
      const pair = `${source.id}|${target.id}`;
      if (target.id === source.id || connected.has(pair)) continue;
      if (mentionsText(text, target.label)) {
        edges.push({ source: source.id, target: target.id, rel: 'mentions' });
        connected.add(pair);
      }
    }
  }
  return edges;
}

/** Drops duplicate and self-referential edges, keeping one per pair and kind. */
function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const result: GraphEdge[] = [];
  for (const edge of edges) {
    if (!edge.source || !edge.target || edge.source === edge.target) continue;
    const key = `${edge.source}->${edge.target}:${edge.rel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
  }
  return result;
}

function applyDegrees(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return nodes.map((node) => ({ ...node, degree: degree.get(node.id) ?? 0 }));
}

/** Distinctive lowercase terms, used to propose links between disconnected items. */
function distinctiveTerms(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}+#./-]{5,}/gu) ?? [];
  // Sentence-ending punctuation rides along in the token charset above.
  const trimmed = words
    .map((word) => word.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((word) => word.length >= 5 && !STOPWORDS.has(word));
  return new Set(trimmed);
}

/**
 * Proposes connections for content nodes that ended up disconnected.
 *
 * Only rare terms count: a word shared by half the portfolio ("platform",
 * "deploy") says nothing about two items being related, so terms are filtered
 * by how many items use them. Suggestions read the English prose only, because
 * mixing locales pairs unrelated translations of the same word.
 */
function suggestLinks(nodes: GraphNode[], edges: GraphEdge[], sources: GraphSources): GraphSuggestion[] {
  const contentTypes: GraphNodeType[] = ['project', 'experience', 'blog'];
  const content = nodes.filter((node) => contentTypes.includes(node.type));
  const neighbours = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.rel === 'indexes') continue;
    neighbours.set(edge.source, (neighbours.get(edge.source) ?? new Set()).add(edge.target));
    neighbours.set(edge.target, (neighbours.get(edge.target) ?? new Set()).add(edge.source));
  }

  const terms = new Map(content.map((node) => [node.id, distinctiveTerms(proseOf(node, sources, ['en']))]));
  const frequency = new Map<string, number>();
  for (const words of terms.values()) {
    for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  const suggestions: GraphSuggestion[] = [];
  for (let i = 0; i < content.length; i += 1) {
    for (let j = i + 1; j < content.length; j += 1) {
      const a = content[i];
      const b = content[j];
      if (neighbours.get(a.id)?.has(b.id)) continue;
      const shared = [...(terms.get(a.id) ?? [])]
        .filter((term) => terms.get(b.id)?.has(term))
        .filter((term) => (frequency.get(term) ?? 0) <= MAX_TERM_DOCUMENTS)
        .sort((x, y) => (frequency.get(x) ?? 0) - (frequency.get(y) ?? 0));
      if (shared.length >= SUGGESTION_MIN_SHARED) {
        suggestions.push({ source: a.id, target: b.id, shared: shared.slice(0, 6) });
      }
    }
  }
  return suggestions.sort((x, y) => y.shared.length - x.shared.length).slice(0, 12);
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/** Totals, orphans, folded labels, hubs and proposed links for the UI panels. */
function collectStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
  tech: TechIndex,
  sources: GraphSources,
): GraphStats {
  const byType = countBy(nodes.map((node) => node.type)) as Record<GraphNodeType, number>;
  const byRel = countBy(edges.map((edge) => edge.rel)) as Record<GraphEdgeRel, number>;
  // Repositories count as content: a repo with no project or role is worth
  // surfacing, since it means code that nothing on the site points at.
  const contentTypes: GraphNodeType[] = ['project', 'experience', 'blog', 'repo'];

  const duplicates = [...tech.aliasesOf.entries()].map(([canonical, aliases]) => ({
    canonical,
    aliases,
  }));

  return {
    byType,
    byRel,
    // Index edges are structural, so a node is only an orphan when nothing else
    // links it — otherwise every content node would look connected via profile.
    orphans: nodes
      .filter((node) => contentTypes.includes(node.type))
      .filter((node) => !edges.some((edge) => edge.rel !== 'indexes' && (edge.source === node.id || edge.target === node.id)))
      .map((node) => ({ id: node.id, label: node.label, type: node.type })),
    duplicates,
    hubs: nodes
      .filter((node) => node.degree >= 5)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 8)
      .map((node) => ({ id: node.id, label: node.label, degree: node.degree })),
    suggestions: suggestLinks(nodes, edges, sources),
  };
}
