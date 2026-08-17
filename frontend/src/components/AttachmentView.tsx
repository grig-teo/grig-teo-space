import type { ExperienceAttachment } from '@/lib/api';
import { attachmentType } from '@/lib/attachments';

/** Small muted caption shown under video/image attachments. */
function AttachmentCaption({ title }: { title: string }) {
  return (
    <figcaption className="mt-2 text-center font-mono text-xs text-muted">{title}</figcaption>
  );
}

/** Renders one attachment: inline video, inline image, or a download chip
 *  for documents. Shared by experience and project detail pages. */
export function AttachmentView({ attachment }: { attachment: ExperienceAttachment }) {
  const kind = attachmentType(attachment);

  if (kind === 'video') {
    // GIF-like: autoplays muted on repeat, no controls or buttons.
    return (
      <figure>
        <video
          src={attachment.url}
          className="max-h-[70vh] w-auto max-w-full rounded-lg border border-border bg-surface"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
        {attachment.title && <AttachmentCaption title={attachment.title} />}
      </figure>
    );
  }

  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <figure>
        <img
          src={attachment.url}
          alt={attachment.title ?? ''}
          className="max-h-[70vh] w-auto max-w-full rounded-lg border border-border bg-surface"
        />
        {attachment.title && <AttachmentCaption title={attachment.title} />}
      </figure>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 font-mono text-xs text-accent transition-colors hover:underline underline-offset-4"
    >
      ↓ {attachment.title ?? attachment.url.split('/').pop()}
    </a>
  );
}
