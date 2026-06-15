'use client';

import '@blocknote/core/fonts/inter.css';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { useMemo } from 'react';
import { parseBlockNoteContent } from '@/lib/blocknote-content';

export function BlogBodyViewer({ body }: { body: string }) {
  const initialContent = useMemo(() => parseBlockNoteContent(body), [body]);

  const editor = useCreateBlockNote({
    initialContent,
  });

  return (
    <div className="blog-body-viewer">
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
  );
}