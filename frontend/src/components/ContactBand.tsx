import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MessengerLinks } from '@/components/MessengerLinks';
import type { Locale, Profile } from '@/lib/api';

/**
 * Closing call to action for the homepage.
 *
 * The footer already carries the CV and the social links, but a page that sells
 * work should end with the two actions it wants, not only with a contact list.
 */
export function ContactBand({
  email,
  locale,
  contact,
}: {
  email: string;
  locale: Locale;
  contact: Profile['contact'];
}) {
  const t = useTranslations('homeCta');
  const tc = useTranslations('contact');

  return (
    <section id="contact-cta" className="px-4 py-16 sm:px-6 md:px-12" aria-labelledby="contact-cta-title">
      <div className="max-w-3xl rounded-lg border border-accent/40 bg-surface p-6 sm:p-8">
        <h2 id="contact-cta-title" className="font-mono text-xl font-bold text-foreground sm:text-2xl">
          {t('title')}
        </h2>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-muted">{t('body')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/contact"
            className="rounded bg-accent px-5 py-2.5 font-mono text-sm text-background hover:opacity-90"
          >
            {tc('ctaDiscuss')}
          </Link>
          <a
            href={`mailto:${email}?subject=${encodeURIComponent('Hiring inquiry')}`}
            className="rounded border border-accent px-5 py-2.5 font-mono text-sm text-accent transition-colors hover:bg-accent hover:text-background"
          >
            {tc('ctaHire')}
          </a>
        </div>
        <MessengerLinks locale={locale} contact={contact} className="mt-4" />
      </div>
    </section>
  );
}
