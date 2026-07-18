'use client';

import '@blocknote/core/fonts/inter.css';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { useEffect, useMemo, useState } from 'react';
import { adminUploadMedia } from '@/lib/admin-api';
import { parseBlockNoteContent } from '@/lib/blocknote-content';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

/** Effective site theme (explicit `data-theme` choice, else system). The
 *  editor must follow it — a hardcoded dark theme makes code blocks render
 *  dark-on-dark (invisible) when the site is in light mode. */
function useSiteTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const pref = root.getAttribute('data-theme');
      setTheme(pref === 'light' || pref === 'dark' ? pref : media.matches ? 'dark' : 'light');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);

  return theme;
}

export function BlogBodyEditor({ value, onChange }: Props) {
  const initialContent = useMemo(() => parseBlockNoteContent(value), [value]);
  const theme = useSiteTheme();

  const editor = useCreateBlockNote({
    initialContent,
    uploadFile: adminUploadMedia,
  });

  useEffect(() => {
    return editor.onChange(() => {
      onChange(JSON.stringify(editor.document));
    });
  }, [editor, onChange]);

  return (
    <div className="admin-blocknote mt-1 min-h-[32rem] rounded border border-border bg-surface font-sans normal-case tracking-normal">
      <BlockNoteView editor={editor} theme={theme} />
    </div>
  );
}
