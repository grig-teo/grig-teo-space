import { Link } from '@/i18n/navigation';
import { AttachmentView } from '@/components/AttachmentView';
import { getProjectDetail } from '@/lib/api';
import type { Locale } from '@/lib/api';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ locale: Locale; id: string }>;
};

export const revalidate = 3600;

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M7 17L17 7M17 7H7M17 7V17" />
    </svg>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;

  try {
    const project = await getProjectDetail(id, locale);
    const t = await getTranslations({ locale, namespace: 'projectsPage' });
    const ogLocale = locale === 'ru' ? 'ru_RU' : locale === 'ro' ? 'ro_RO' : 'en_US';

    return {
      title: t('title'),
      description: project.overview || project.description,
      alternates: {
        canonical: `/${locale}/projects/${id}`,
        languages: Object.fromEntries(
          (['en', 'ru', 'ro'] as Locale[]).map((alt) => [alt, `/${alt}/projects/${id}`]),
        ),
      },
      openGraph: {
        title: project.title,
        description: project.overview || project.description,
        url: `/${locale}/projects/${id}`,
        siteName: 'grig-teo',
        locale: ogLocale,
        type: 'article',
      },
    };
  } catch {
    return {};
  }
}

export default async function ProjectDetailPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'projectsPage' });

  let project;
  try {
    project = await getProjectDetail(id, locale);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <section className="px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <Link
          href="/projects"
          className="mb-6 inline-block font-mono text-sm text-accent hover:underline underline-offset-4 sm:mb-8"
        >
          {t('back')}
        </Link>

        <div className="max-w-3xl">
          {project.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.image}
              alt={project.title}
              className="mb-6 aspect-video w-full rounded-lg border border-border object-cover"
            />
          )}

          <h1 className="font-mono text-2xl font-bold sm:text-3xl">
            <span className="text-accent">{project.title}</span>
            {project.inDevelopment && (
              <span className="ml-3 inline-block rounded border border-accent-2/50 px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-wider text-accent-2">
                {t('inDevelopment')}
              </span>
            )}
          </h1>

          {project.overview && (
            <p className="mt-6 font-sans text-base leading-relaxed text-muted">{project.overview}</p>
          )}

          {project.attachments && project.attachments.length > 0 && (
            <div className="mt-8 flex flex-wrap items-start gap-4">
              {project.attachments.map((attachment) => (
                <AttachmentView key={attachment.url} attachment={attachment} />
              ))}
            </div>
          )}

          {project.highlights.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-4 font-mono text-xs uppercase tracking-wide text-accent">
                {t('highlights')}
              </h2>
              <ul className="space-y-3">
                {project.highlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="font-sans text-sm leading-relaxed text-muted"
                  >
                    <span className="text-accent">—</span> {highlight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {project.tags.length > 0 && (
            <div className="mt-8 rounded-lg border border-border bg-surface p-4 font-mono text-xs">
              <h2 className="mb-2 uppercase tracking-wide text-accent">Stack</h2>
              <p className="leading-relaxed text-muted">{project.tags.join(' · ')}</p>
            </div>
          )}

          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex w-fit items-center gap-2 rounded border border-accent px-4 py-2 font-mono text-sm text-accent transition-colors hover:bg-accent hover:text-background"
          >
            {t('visit')}
            <ExternalIcon />
          </a>
        </div>
      </section>
    </main>
  );
}
