import type { Locale, Profile } from './api';

export type MessengerKind = 'telegram' | 'max' | 'whatsapp';

/**
 * Turns whatever was typed in the admin form into a usable link.
 *
 * The admin fields accept a bare handle ("grig_teo"), a phone number, or a full
 * URL, because asking a person to remember which of those a form wants is how
 * fields end up empty. Nothing here guesses a handle: an empty value returns
 * null and the icon is simply not rendered.
 */
export function messengerUrl(kind: MessengerKind, value?: string): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const handle = raw.replace(/^@/, '');
  if (kind === 'whatsapp') {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 6 ? `https://wa.me/${digits}` : null;
  }
  if (kind === 'telegram') return `https://t.me/${handle}`;
  return `https://max.ru/${handle}`;
}

export type MessengerLink = { kind: MessengerKind; url: string; label: string };

/**
 * Which messengers a locale shows.
 *
 * MAX is the Russian messenger, so the Russian site offers it instead of
 * Telegram. If MAX is not configured yet the Russian site falls back to
 * Telegram rather than showing nothing, and WhatsApp is offered everywhere.
 */
export function messengersFor(
  locale: Locale | string,
  contact: Profile['contact'],
): MessengerLink[] {
  const telegram = messengerUrl('telegram', contact.telegram);
  const max = messengerUrl('max', contact.max);
  const whatsapp = messengerUrl('whatsapp', contact.whatsapp);

  const links: MessengerLink[] = [];
  if (locale === 'ru') {
    if (max) links.push({ kind: 'max', url: max, label: 'MAX' });
    else if (telegram) links.push({ kind: 'telegram', url: telegram, label: 'Telegram' });
  } else if (telegram) {
    links.push({ kind: 'telegram', url: telegram, label: 'Telegram' });
  }
  if (whatsapp) links.push({ kind: 'whatsapp', url: whatsapp, label: 'WhatsApp' });
  return links;
}
