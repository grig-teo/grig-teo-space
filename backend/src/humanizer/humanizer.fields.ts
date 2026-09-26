import type {
  ExperienceItem,
  Locale,
  LocalizedList,
  LocalizedString,
  Profile,
  Project,
} from '../types';

/** One prose field queued for rewriting, addressed by a stable key. */
export type TextTask = {
  key: string;
  locale: Locale;
  text: string;
};

/** Rewritten text keyed by the task key it belongs to. */
export type Rewrites = Map<string, string>;

export const HUMANIZER_LOCALES: Locale[] = ['en', 'ru', 'ro'];

/** Keep one request small enough to stay well inside the model context. */
const MAX_TASKS_PER_REQUEST = 8;
const MAX_CHARS_PER_REQUEST = 5000;

/**
 * Below this a string is a label rather than prose. Rewriting labels such as
 * a job title or a company name only risks damaging data, so they are skipped.
 */
const MIN_PROSE_WORDS = 5;

/** True when a value is long enough to be prose worth rewriting. */
export function isProse(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return value.trim().split(/\s+/).length >= MIN_PROSE_WORDS;
}

function addLocalized(
  tasks: TextTask[],
  keyBase: string,
  next: LocalizedString | undefined,
  prev: LocalizedString | undefined,
): void {
  if (!next) {
    return;
  }
  for (const locale of HUMANIZER_LOCALES) {
    const text = next[locale];
    if (!isProse(text) || prev?.[locale] === text) {
      continue;
    }
    tasks.push({ key: `${keyBase}.${locale}`, locale, text });
  }
}

function addList(
  tasks: TextTask[],
  keyBase: string,
  next: LocalizedList | undefined,
  prev: LocalizedList | undefined,
): void {
  if (!next) {
    return;
  }
  for (const locale of HUMANIZER_LOCALES) {
    (next[locale] ?? []).forEach((text, index) => {
      if (!isProse(text) || prev?.[locale]?.[index] === text) {
        return;
      }
      tasks.push({ key: `${keyBase}.${locale}.${index}`, locale, text });
    });
  }
}

/**
 * Collects the prose fields of a profile. Fields whose text matches the stored
 * version are skipped so that re-saving does not rewrite the same text twice.
 */
export function collectProfileTasks(next: Profile, prev: Profile | null): TextTask[] {
  const tasks: TextTask[] = [];
  addLocalized(tasks, 'profile.about', next.about, prev?.about);
  return tasks;
}

/** Collects the prose fields of every experience entry. */
export function collectExperienceTasks(
  next: ExperienceItem[],
  prev: ExperienceItem[] | null,
): TextTask[] {
  const tasks: TextTask[] = [];
  const before = new Map((prev ?? []).map((item) => [item.id, item]));
  next.forEach((item, index) => {
    const base = `experience.${index}`;
    const previous = before.get(item.id);
    addLocalized(tasks, `${base}.summary`, item.summary, previous?.summary);
    addLocalized(tasks, `${base}.description`, item.description, previous?.description);
    addList(tasks, `${base}.highlights`, item.highlights, previous?.highlights);
  });
  return tasks;
}

/** Collects the prose fields of every project. */
export function collectProjectTasks(next: Project[], prev: Project[] | null): TextTask[] {
  const tasks: TextTask[] = [];
  const before = new Map((prev ?? []).map((item) => [item.id, item]));
  next.forEach((item, index) => {
    const base = `projects.${index}`;
    const previous = before.get(item.id);
    addLocalized(tasks, `${base}.overview`, item.overview, previous?.overview);
    addLocalized(tasks, `${base}.description`, item.description, previous?.description);
    addList(tasks, `${base}.highlights`, item.highlights, previous?.highlights);
  });
  return tasks;
}

/** Splits tasks into request-sized batches without reordering them. */
export function chunkTasks(tasks: TextTask[]): TextTask[][] {
  const chunks: TextTask[][] = [];
  let current: TextTask[] = [];
  let chars = 0;

  for (const task of tasks) {
    const isFull =
      current.length >= MAX_TASKS_PER_REQUEST || chars + task.text.length > MAX_CHARS_PER_REQUEST;
    if (current.length > 0 && isFull) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(task);
    chars += task.text.length;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function applyLocalized(
  next: LocalizedString,
  keyBase: string,
  rewrites: Rewrites,
): LocalizedString {
  const out = { ...next };
  let changed = false;
  for (const locale of HUMANIZER_LOCALES) {
    const value = rewrites.get(`${keyBase}.${locale}`);
    if (value !== undefined && value !== out[locale]) {
      out[locale] = value;
      changed = true;
    }
  }
  return changed ? out : next;
}

function applyList(next: LocalizedList, keyBase: string, rewrites: Rewrites): LocalizedList {
  const out: LocalizedList = { ...next };
  let changed = false;
  for (const locale of HUMANIZER_LOCALES) {
    const items = next[locale] ?? [];
    const updated = items.map(
      (text, index) => rewrites.get(`${keyBase}.${locale}.${index}`) ?? text,
    );
    if (updated.some((text, index) => text !== items[index])) {
      out[locale] = updated;
      changed = true;
    }
  }
  return changed ? out : next;
}

/** Returns a copy of the profile with any rewritten fields substituted in. */
export function applyProfileRewrites(next: Profile, rewrites: Rewrites): Profile {
  const about = applyLocalized(next.about, 'profile.about', rewrites);
  return about === next.about ? next : { ...next, about };
}

/** Returns a copy of the experience list with any rewritten fields substituted in. */
export function applyExperienceRewrites(
  items: ExperienceItem[],
  rewrites: Rewrites,
): ExperienceItem[] {
  if (rewrites.size === 0) {
    return items;
  }
  return items.map((item, index) => {
    const base = `experience.${index}`;
    const updated: ExperienceItem = {
      ...item,
      description: applyLocalized(item.description, `${base}.description`, rewrites),
      highlights: applyList(item.highlights, `${base}.highlights`, rewrites),
    };
    if (item.summary) {
      updated.summary = applyLocalized(item.summary, `${base}.summary`, rewrites);
    }
    return updated;
  });
}

/** Returns a copy of the project list with any rewritten fields substituted in. */
export function applyProjectRewrites(items: Project[], rewrites: Rewrites): Project[] {
  if (rewrites.size === 0) {
    return items;
  }
  return items.map((item, index) => {
    const base = `projects.${index}`;
    return {
      ...item,
      overview: applyLocalized(item.overview, `${base}.overview`, rewrites),
      description: applyLocalized(item.description, `${base}.description`, rewrites),
      highlights: applyList(item.highlights, `${base}.highlights`, rewrites),
    };
  });
}
