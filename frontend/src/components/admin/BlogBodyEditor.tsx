'use client';

import '@blocknote/core/fonts/inter.css';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { useEffect, useMemo } from 'react';
import { adminUploadMedia } from '@/lib/admin-api';
import { parseBlockNoteContent } from '@/lib/blocknote-content';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BlogBodyEditor({ value, onChange }: Props) {
  const initialContent = useMemo(() => parseBlockNoteContent(value), [value]);

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
    <div className="mt-1 border border-border/60 bg-background admin-blocknote">
      <BlockNoteView editor={editor} theme="light" />
    </div>
  );
}
