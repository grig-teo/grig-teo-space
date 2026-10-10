import { Injectable, Logger } from '@nestjs/common';
import type { ExperienceItem, Profile, Project } from '../types';
import type { GraphCommit, GraphEdge, GraphNode } from './graph.types';

/** Where a repository lives. */
type HostKind = 'github' | 'gitverse';

type RepoSummary = {
  host: HostKind;
  owner: string;
  name: string;
  isPrivate: boolean;
  language: string | null;
  pushedAt: string | null;
  url: string;
};

type RepoGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** How many recent commits to keep per repository for the inspector. */
const COMMIT_LIMIT = 8;

/** Repositories and commits change slowly and cost network calls, so the whole
 *  repo graph is cached; GitHub also rate-limits by the hour. */
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** Per-request timeout for the two hosting APIs. */
const REQUEST_TIMEOUT_MS = 12_000;

/** Shortest company-name prefix that may claim a repository. */
const MIN_PREFIX_MATCH = 4;

type HostConfig = {
  host: HostKind;
  /** Argument name on the profile contact block. */
  tokenEnv: string;
  /** Accept header the host requires. */
  accept: string;
};

const HOSTS: HostConfig[] = [
  { host: 'github', tokenEnv: 'GITHUB_TOKEN', accept: 'application/vnd.github+json' },
  {
    host: 'gitverse',
    tokenEnv: 'GITVERSE_TOKEN',
    accept: 'application/vnd.gitverse.object+json;version=1',
  },
];

/** Strips separators and case so `Touchstone` matches project id `touchstone`. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Last path segment of a profile URL: "https://github.com/grig-teo" → "grig-teo". */
function ownerFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const segment = url.trim().replace(/\/+$/, '').split('/').filter(Boolean).pop();
  return segment || null;
}

function cacheTtlMs(): number {
  const configured = Number(process.env.REPO_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CACHE_TTL_MS;
}

/** Normalises one commit from either host — the payloads are GitHub-shaped. */
function toCommit(raw: unknown, fallbackUrl: string): GraphCommit | null {
  const entry = raw as {
    sha?: string;
    html_url?: string;
    commit?: { message?: string; author?: { name?: string; date?: string } };
  };
  const sha = entry?.sha;
  const date = entry?.commit?.author?.date;
  if (!sha || !date) return null;
  const firstLine = (entry.commit?.message ?? '').split('\n')[0].trim();
  return {
    sha: sha.slice(0, 8),
    message: firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine,
    author: entry.commit?.author?.name ?? 'unknown',
    date,
    url: entry.html_url ?? fallbackUrl,
  };
}

/**
 * Repositories and their recent commits, as graph nodes.
 *
 * Commits are not nodes: a repo has thousands and they would swamp the layout.
 * They ride along on the repository node so the inspector can list them with
 * their exact timestamps.
 */
@Injectable()
export class RepoGraphService {
  private readonly logger = new Logger(RepoGraphService.name);
  private cache: { at: number; value: RepoGraph } | null = null;

  async build(sources: { profile: Profile; projects: Project[]; experience: ExperienceItem[] }): Promise<RepoGraph> {
    const cached = this.cache;
    if (cached && Date.now() - cached.at < cacheTtlMs()) {
      return cached.value;
    }
    try {
      const value = await this.fetchAll(sources);
      this.cache = { at: Date.now(), value };
      return value;
    } catch (error) {
      this.logger.warn(`Repository graph unavailable: ${String(error)}`);
      // Serve the previous snapshot rather than dropping the nodes entirely.
      return cached?.value ?? { nodes: [], edges: [] };
    }
  }

  private async fetchAll(sources: {
    profile: Profile;
    projects: Project[];
    experience: ExperienceItem[];
  }): Promise<RepoGraph> {
    const owners: Record<HostKind, string | null> = {
      github: ownerFromUrl(sources.profile.contact.github),
      gitverse: ownerFromUrl(sources.profile.contact.gitverse),
    };

    const perHost = await Promise.all(
      HOSTS.map(async (config) => {
        const owner = owners[config.host];
        const token = process.env[config.tokenEnv]?.trim();
        if (!owner || !token) {
          // GitVerse rejects anonymous reads outright; GitHub would work but at
          // 60 requests an hour, which this fetch pattern would exhaust.
          this.logger.warn(`Skipping ${config.host}: no owner or ${config.tokenEnv} set`);
          return [];
        }
        return this.fetchHost(config, owner, token);
      }),
    );

    const repos = perHost.flat();
    // Commits are fetched per repository, so they all go out at once: awaiting
    // them in a loop made a cold load take eight seconds instead of one.
    const nodes = await Promise.all(repos.map((repo) => this.toNode(repo, sources)));

    const edges: GraphEdge[] = [];
    for (const repo of repos) {
      const target = matchTarget(repo, sources);
      if (target) {
        edges.push({ source: repoNodeId(repo), target, rel: 'hosts' });
      }
    }
    return { nodes, edges };
  }

  /** Repositories for one host, each with its most recent commits. */
  private async fetchHost(config: HostConfig, owner: string, token: string): Promise<RepoSummary[]> {
    const base = config.host === 'github' ? 'https://api.github.com' : 'https://api.gitverse.ru';
    // GitHub's /user/repos also lists repos the account merely collaborates on;
    // affiliation=owner keeps it to the account's own repositories.
    const query = config.host === 'github' ? '?per_page=100&affiliation=owner&sort=pushed' : '?per_page=100';
    const repos = await this.request<Array<Record<string, unknown>>>(config, token, `${base}/user/repos${query}`);
    if (!Array.isArray(repos)) return [];
    return repos.map((repo) => ({
      host: config.host,
      owner: String(repo.owner && (repo.owner as { login?: string }).login ? (repo.owner as { login: string }).login : owner),
      name: String(repo.name ?? ''),
      isPrivate: Boolean(repo.private),
      language: (repo.language as string | null) ?? null,
      pushedAt: (repo.pushed_at as string | null) ?? null,
      url: String(repo.html_url ?? ''),
    }));
  }

  private async request<T>(config: HostConfig, token: string, url: string): Promise<T | null> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: config.accept },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`${config.host} responded ${response.status} for ${url}`);
    }
    return (await response.json()) as T;
  }

  /** Repository node, enriched with its recent commits. */
  private async toNode(
    repo: RepoSummary,
    sources: { projects: Project[]; experience: ExperienceItem[] },
  ): Promise<GraphNode> {
    const config = HOSTS.find((entry) => entry.host === repo.host)!;
    const token = process.env[config.tokenEnv]?.trim() ?? '';
    const commits = await this.commits(config, token, repo);
    const pushed = repo.pushedAt ? new Date(repo.pushedAt).toISOString().slice(0, 10) : 'unknown';
    return {
      id: repoNodeId(repo),
      type: 'repo',
      label: repo.name,
      sublabel: `${repo.host}${repo.isPrivate ? ' (private)' : ''} · ${repo.language ?? 'unknown'} · pushed ${pushed}`,
      degree: 0,
      url: repo.url,
      commits,
    };
  }

  private async commits(config: HostConfig, token: string, repo: RepoSummary): Promise<GraphCommit[]> {
    try {
      const base = config.host === 'github' ? 'https://api.github.com' : 'https://api.gitverse.ru';
      const raw = await this.request<unknown[]>(
        config,
        token,
        `${base}/repos/${repo.owner}/${repo.name}/commits?per_page=${COMMIT_LIMIT}`,
      );
      if (!Array.isArray(raw)) return [];
      return raw
        .map((entry) => toCommit(entry, repo.url))
        .filter((commit): commit is GraphCommit => commit !== null);
    } catch (error) {
      // A repo we cannot read (empty, or renamed) must not fail the whole graph.
      this.logger.warn(`No commits for ${repo.host}/${repo.name}: ${String(error)}`);
      return [];
    }
  }
}

function repoNodeId(repo: RepoSummary): string {
  return `repo:${repo.host}:${repo.owner}/${repo.name}`.toLowerCase();
}

/**
 * Which content node a repository belongs to.
 *
 * A repository name matching a project id wins, which covers the repos named
 * after their product (`lemniscate`, `grig-teo-space`, private `Touchstone`).
 * Otherwise the repository is attributed to a role when it is named after that
 * role's company — the five `GlavUpDK-*` repos are that role's products.
 */
function matchTarget(
  repo: RepoSummary,
  sources: { projects: Project[]; experience: ExperienceItem[] },
): string | null {
  const name = normalize(repo.name);
  const project = sources.projects.find(
    (item) => normalize(item.id) === name || normalize(item.title?.en ?? '') === name,
  );
  if (project) {
    return `project:${project.id}`;
  }

  let best: { id: string; length: number } | null = null;
  for (const item of sources.experience) {
    const company = normalize(item.company?.en ?? '');
    if (company.length < MIN_PREFIX_MATCH || !name.startsWith(company)) continue;
    if (!best || company.length > best.length) {
      best = { id: item.id, length: company.length };
    }
  }
  return best ? `experience:${best.id}` : null;
}
