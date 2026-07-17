import type { ExperienceAttachment, ExperienceAttachmentType } from '@/lib/api';

const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v', 'mkv'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'];

/** Resolves an attachment's kind: explicit `type` wins, otherwise the URL
 *  extension decides (unknown → doc/download). */
export function attachmentType(a: ExperienceAttachment): ExperienceAttachmentType {
  if (a.type) return a.type;
  const ext = a.url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  return 'doc';
}
