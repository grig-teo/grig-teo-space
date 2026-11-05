import { useTranslations } from 'next-intl';
import type { Locale, Profile } from '@/lib/api';
import { messengersFor } from '@/lib/messengers';

/**
 * "or message me on Telegram / WhatsApp" beside the primary call to action.
 *
 * The footer icons are easy to miss and a visitor who would rather chat than
 * fill a form should not have to hunt for one. Renders nothing when no
 * messenger is configured.
 */
export function MessengerLinks({
  locale,
  contact,
  className = '',
}: {
  locale: Locale;
  contact: Profile['contact'];
  className?: string;
}) {
  const t = useTranslations('contact');
  const messengers = messengersFor(locale, contact);
  if (messengers.length === 0) return null;

  return (
    <p className={`font-sans text-sm text-muted ${className}`}>
      {t('orMessage')}{' '}
      {messengers.map((messenger, index) => (
        <span key={messenger.kind}>
          {index > 0 ? <span className="text-border"> · </span> : null}
          <a
            href={messenger.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent underline-offset-4 hover:underline"
          >
            {messenger.label}
          </a>
        </span>
      ))}
    </p>
  );
}
