/**
 * Server-side renderer for stored BlockNote documents → plain HTML.
 *
 * Used by the public article page so the body is part of the served HTML
 * (SEO) without mounting the client-side BlockNote editor, which crashes
 * during SSR. Supports the block types the admin editor can produce; unknown
 * block types degrade to rendering their children/inline content.
 */

type InlineStyles = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
};

type InlineContent =
  | { type: 'text'; text: string; styles?: InlineStyles }
  | { type: 'link'; href: string; content?: InlineContent[]; styles?: InlineStyles };

type TableContent = {
  type: 'tableContent';
  rows: { cells: (InlineContent[] | undefined)[] }[];
};

type Block = {
  type: string;
  props?: Record<string, unknown>;
  content?: InlineContent[] | TableContent;
  children?: Block[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInline(content: InlineContent[] | undefined): string {
  if (!content) {
    return '';
  }
  return content
    .map((inline) => {
      if (inline.type === 'link') {
        const inner = renderInline(inline.content) || escapeHtml(inline.href);
        return `<a href="${escapeHtml(inline.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
      }
      let text = escapeHtml(inline.text);
      const styles = inline.styles ?? {};
      if (styles.code) text = `<code>${text}</code>`;
      if (styles.bold) text = `<strong>${text}</strong>`;
      if (styles.italic) text = `<em>${text}</em>`;
      if (styles.underline) text = `<u>${text}</u>`;
      if (styles.strike) text = `<s>${text}</s>`;
      return text;
    })
    .join('');
}

function renderTable(content: TableContent): string {
  const rows = content.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => `<td>${renderInline(cell)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

function renderChildren(block: Block): string {
  return renderBlocks(block.children ?? []);
}

/** Renders one block. List items are emitted as bare `<li>` — the grouping
 *  into `<ul>`/`<ol>` happens in `renderBlocks`, which also attaches nested
 *  children inside the item. */
function renderBlock(block: Block): string {
  const inline = Array.isArray(block.content)
    ? renderInline(block.content as InlineContent[])
    : '';
  const props = block.props ?? {};

  switch (block.type) {
    case 'paragraph':
      return inline ? `<p>${inline}</p>` : '';
    case 'heading': {
      const level = Math.min(Math.max(Number(props.level) || 2, 2), 4);
      return `<h${level}>${inline}</h${level}>`;
    }
    case 'bulletListItem':
    case 'toggleListItem':
      return `<li>${inline}${renderChildren(block)}</li>`;
    case 'numberedListItem':
      return `<li>${inline}${renderChildren(block)}</li>`;
    case 'checkListItem': {
      const mark = props.checked ? '☑' : '☐';
      return `<li>${mark} ${inline}${renderChildren(block)}</li>`;
    }
    case 'codeBlock':
      return `<pre><code>${escapeHtml(
        (block.content as InlineContent[] | undefined)
          ?.map((c) => (c.type === 'text' ? c.text : ''))
          .join('') ?? '',
      )}</code></pre>`;
    case 'quote':
      return `<blockquote>${inline}</blockquote>`;
    case 'image': {
      const src = escapeHtml(String(props.url ?? ''));
      const alt = escapeHtml(String(props.caption ?? props.name ?? ''));
      return src ? `<img src="${src}" alt="${alt}" />` : '';
    }
    case 'video': {
      const src = escapeHtml(String(props.url ?? ''));
      return src ? `<video src="${src}" controls playsinline></video>` : '';
    }
    case 'audio': {
      const src = escapeHtml(String(props.url ?? ''));
      return src ? `<audio src="${src}" controls></audio>` : '';
    }
    case 'file': {
      const src = escapeHtml(String(props.url ?? ''));
      const name = escapeHtml(String(props.name ?? 'Download'));
      return src ? `<a href="${src}" target="_blank" rel="noopener noreferrer">${name}</a>` : '';
    }
    case 'table':
      return block.content && !Array.isArray(block.content)
        ? renderTable(block.content as TableContent)
        : '';
    default:
      return inline ? `<p>${inline}</p>` : renderChildren(block);
  }
}

function isListItem(block: Block): boolean {
  return [
    'bulletListItem',
    'toggleListItem',
    'numberedListItem',
    'checkListItem',
  ].includes(block.type);
}

function renderBlocks(blocks: Block[]): string {
  let html = '';
  let listOpen: 'ul' | 'ol' | null = null;

  for (const block of blocks) {
    const tag = block.type === 'numberedListItem' ? 'ol' : 'ul';
    if (isListItem(block)) {
      if (listOpen !== tag) {
        if (listOpen) html += `</${listOpen}>`;
        html += `<${tag}>`;
        listOpen = tag;
      }
    } else if (listOpen) {
      html += `</${listOpen}>`;
      listOpen = null;
    }
    html += renderBlock(block);
  }
  if (listOpen) html += `</${listOpen}>`;
  return html;
}

function parseBlocks(raw: string): Block[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? (parsed as Block[]) : [];
  } catch {
    // Plain-text bodies (pre-BlockNote posts) become a single paragraph.
    return [{ type: 'paragraph', content: [{ type: 'text', text: trimmed }] }];
  }
}

export function renderBlockNoteHtml(raw: string): string {
  return renderBlocks(parseBlocks(raw));
}
