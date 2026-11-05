import { ContactForm } from '@/components/ContactForm';
import { ProfileLinks } from '@/components/ProfileLinks';
import { getProfile } from '@/lib/api';
import type { Locale } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return pageMetadata({
    locale,
    path: '/contact',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  const profile = await getProfile(locale);
  const hireSubject = encodeURIComponent(t('hireSubject'));
  const hireHref = `mailto:${profile.contact.email}?subject=${hireSubject}`;

  return (
    <main className="min-h-screen">
      <section className="px-4 py-12 sm:px-6 sm:py-16 md:px-12">
        <div className="mx-auto max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{t('eyebrow')}</p>
          <h1 className="mt-3 font-mono text-3xl font-bold leading-tight sm:text-4xl">
            {t('heading')}
          </h1>
          <p className="mt-4 max-w-2xl font-sans text-base leading-relaxed text-muted">
            {t('lead')}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#inquiry"
              className="rounded bg-accent px-5 py-2.5 font-mono text-sm text-background transition-opacity hover:opacity-90"
            >
              {t('ctaDiscuss')}
            </a>
            <a
              href={hireHref}
              className="rounded border border-accent px-5 py-2.5 font-mono text-sm text-accent transition-colors hover:bg-accent hover:text-background"
            >
              {t('ctaHire')}
            </a>
          </div>

          <div id="inquiry" className="mt-12 scroll-mt-24 rounded-lg border border-border bg-surface p-6 sm:p-8">
            <h2 className="font-mono text-sm uppercase tracking-wide text-accent">
              {t('formHeading')}
            </h2>
            <p className="mt-2 mb-6 font-sans text-sm leading-relaxed text-muted">{t('formLead')}</p>
            <ContactForm />
          </div>

          <div className="mt-10 border-t border-border pt-8">
            <h2 className="font-mono text-sm uppercase tracking-wide text-muted">{t('directHeading')}</h2>
            <p className="mt-2 font-sans text-sm leading-relaxed text-muted">{t('directBody')}</p>
            <div className="mt-4">
              <ProfileLinks contact={profile.contact} emailLabel={t('emailLabel')} locale={locale} />
            </div>
            <p className="mt-6 font-sans text-xs leading-relaxed text-muted">{t('responseNote')}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
