import { Experience } from '@/components/Experience';
import { JsonLd } from '@/components/JsonLd';
import { Link } from '@/i18n/navigation';
import { getExperience, getProfile, type Locale } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: Locale }> };

type Principle = { title: string; body: string };
type StackGroup = { title: string; items: string[] };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return pageMetadata({
    locale,
    path: '/about',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  const [profile, experience] = await Promise.all([getProfile(locale), getExperience(locale)]);

  const story = t.raw('story') as string[];
  const principles = t.raw('principles') as Principle[];
  const stack = t.raw('stack') as StackGroup[];

  return (
    <main className="min-h-screen">
      <JsonLd profile={profile} locale={locale} />

      <section className="px-4 py-12 sm:px-6 sm:py-16 md:px-12" aria-labelledby="about-heading">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{t('eyebrow')}</p>
          <h1
            id="about-heading"
            className="mt-3 font-mono text-3xl font-bold leading-tight sm:text-4xl"
          >
            {t('heading')}
          </h1>
          <p className="mt-5 font-sans text-base leading-relaxed text-muted">{t('lead')}</p>

          <h2 className="mt-12 font-mono text-sm uppercase tracking-wide text-accent">
            {t('storyHeading')}
          </h2>
          <div className="mt-4 space-y-4">
            {story.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="font-sans text-base leading-relaxed text-muted">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 md:px-12" aria-labelledby="principles-heading">
        <div className="max-w-5xl">
          <h2
            id="principles-heading"
            className="font-mono text-sm uppercase tracking-wide text-accent"
          >
            {t('principlesHeading')}
          </h2>
          <div className="mt-5 grid auto-rows-fr gap-4 sm:grid-cols-2">
            {principles.map((principle) => (
              <article
                key={principle.title}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h3 className="font-mono text-sm font-bold text-foreground">{principle.title}</h3>
                <p className="mt-2 font-sans text-sm leading-relaxed text-muted">{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 md:px-12" aria-labelledby="stack-heading">
        <div className="max-w-5xl">
          <h2 id="stack-heading" className="font-mono text-sm uppercase tracking-wide text-accent">
            {t('stackHeading')}
          </h2>
          <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-muted">
            {t('stackLead')}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {stack.map((group) => (
              <div key={group.title} className="rounded-lg border border-border p-5">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted">
                  {group.title}
                </h3>
                <ul className="mt-3 space-y-1.5">
                  {group.items.map((item) => (
                    <li key={item} className="font-sans text-sm leading-relaxed text-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 md:px-12" aria-labelledby="experience-heading">
        <div className="max-w-5xl">
          <h2
            id="experience-heading"
            className="mb-6 font-mono text-sm uppercase tracking-wide text-accent"
          >
            {t('experienceHeading')}
          </h2>
          <Experience items={experience} embedded />
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 md:px-12">
        <div className="max-w-3xl rounded-lg border border-accent/40 bg-surface p-6 sm:p-8">
          <h2 className="font-mono text-lg font-bold text-foreground">{t('ctaTitle')}</h2>
          <p className="mt-2 font-sans text-sm leading-relaxed text-muted">{t('ctaBody')}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="rounded bg-accent px-5 py-2.5 font-mono text-sm text-background hover:opacity-90"
            >
              {t('ctaButton')}
            </Link>
            <a
              href={`/api/cv?locale=${locale}`}
              className="rounded border border-border px-5 py-2.5 font-mono text-sm text-muted hover:border-accent hover:text-accent"
            >
              {t('cvButton')}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
