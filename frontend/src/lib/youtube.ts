const YOUTUBE_HOSTS = new Set(['youtu.be', 'www.youtube.com', 'youtube.com', 'm.youtube.com']);

export function extractYoutubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!YOUTUBE_HOSTS.has(parsed.hostname)) {
      return null;
    }

    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id || null;
    }

    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }

    const embedMatch = parsed.pathname.match(/^\/embed\/([^/?]+)/);
    if (embedMatch) {
      return embedMatch[1];
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shortsMatch) {
      return shortsMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

function blockText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const text = (item as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .join('')
    .trim();
}

export function extractYoutubeVideoIdsFromBlockNote(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) {
    const id = extractYoutubeVideoId(trimmed);
    return id ? [id] : [];
  }

  try {
    const blocks = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(blocks)) {
      return [];
    }

    const ids: string[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      const type = (block as { type?: unknown }).type;
      if (type !== 'paragraph') {
        continue;
      }
      const text = blockText((block as { content?: unknown }).content);
      const id = extractYoutubeVideoId(text);
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export function stripYoutubeUrlBlocksFromBlockNote(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) {
    return raw;
  }

  try {
    const blocks = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(blocks)) {
      return raw;
    }

    const filtered = blocks.filter((block) => {
      if (!block || typeof block !== 'object') {
        return true;
      }
      const type = (block as { type?: unknown }).type;
      if (type !== 'paragraph') {
        return true;
      }
      const text = blockText((block as { content?: unknown }).content);
      return !extractYoutubeVideoId(text);
    });

    return JSON.stringify(filtered);
  } catch {
    return raw;
  }
}
