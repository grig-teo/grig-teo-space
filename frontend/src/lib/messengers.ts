import type { Locale, Profile } from './api';

export type MessengerKind = 'telegram' | 'max' | 'whatsapp';

/** Hosts people type without a scheme, e.g. "t.me/grig_teo". */
const HOST_PREFIXES: Record<MessengerKind, RegExp> = {
  telegram: /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\//i,
  max: /^(?:https?:\/\/)?(?:www\.)?max\.ru\//i,
  whatsapp: /^(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?/i,
};

/**
 * Turns whatever was typed in the admin form into a usable link.
 *
 * Accepts a full URL, a host without a scheme ("t.me/grig_teo"), a phone number
 * or a bare handle ("grig_teo"), because the field should not require the
 * visitor to remember which of those it wants. An empty value returns null and
 * the icon is simply not rendered: nothing here invents a handle.
 */
export function messengerUrl(kind: MessengerKind, value?: string): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  // "t.me/name" and friends: keep the URL, just give it a scheme.
  if (HOST_PREFIXES[kind].test(raw)) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
    return withScheme;
  }
  if (/^https?:\/\//i.test(raw)) return raw;

  if (kind === 'whatsapp') {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 6 ? `https://wa.me/${digits}` : null;
  }

  const handle = raw.replace(/^@/, '');
  if (!handle) return null;
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
