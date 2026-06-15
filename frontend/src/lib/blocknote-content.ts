import type { PartialBlock } from '@blocknote/core';

export function parseBlockNoteContent(raw: string): PartialBlock[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as PartialBlock[];
    }
  } catch {
    return [
      {
        type: 'paragraph',
        content: trimmed,
      },
    ];
  }

  return undefined;
}

export function isBlockNoteJson(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}
