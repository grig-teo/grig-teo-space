import { AttachmentView } from '@/components/AttachmentView';
import { Link } from '@/i18n/navigation';
import { getProjectDetail, type Locale, type ProjectStatus } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
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

/**
 * Three-state maturity, falling back to the legacy `inDevelopment` boolean.
 * An unset flag resolves to "prototype": calling an unverified project
 * production would be a claim the page cannot support.
 */
function resolveStatus(project: { status?: ProjectStatus; inDevelopment?: boolean }): ProjectStatus {
  if (project.status) return project.status;
  return project.inDevelopment ? 'in-development' : 'prototype';
}

const STATUS_STYLE: Record<ProjectStatus, string> = {
  production: 'border-accent/50 text-accent',
  prototype: 'border-accent-2/50 text-accent-2',
  'in-development': 'border-border text-muted',
};

function StatusBadge({ status, label }: { status: ProjectStatus; label: string }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-wider ${STATUS_STYLE[status]}`}
    >
      {label}
    </span>
  );
}

function CaseSection({
  heading,
  children,
  id,
}: {
  heading: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} className="mb-3 font-mono text-xs uppercase tracking-widest text-accent">
        {heading}
      </h2>
      {children}
    </section>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;

  try {
    const project = await getProjectDetail(id, locale);
    const t = await getTranslations({ locale, namespace: 'projectsPage' });
    const description = project.description || project.overview;
    return pageMetadata({
      locale,
      path: `/projects/${id}`,
      title: `${project.title} — ${t('caseSuffix')}`,
      description,
      type: 'article',
      twitterCard: 'summary',
    });
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

  const status = resolveStatus(project);
  const statusLabel = t(
    status === 'production'
      ? 'statusProduction'
      : status === 'prototype'
        ? 'statusPrototype'
        : 'statusDevelopment',
  );

  return (
    <main className="min-h-screen">
      <section className="px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <Link
          href="/projects"
          className="mb-6 inline-block font-mono text-sm text-accent underline-offset-4 hover:underline sm:mb-8"
        >
          {t('back')}
        </Link>

        <div className="max-w-3xl">
          {project.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.image}
              alt={project.title}
              className="mb-6 aspect-video w-full rounded-lg border border-border object-cover"
              loading="lazy"
            />
          ) : null}

          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-mono text-2xl font-bold text-accent sm:text-3xl">{project.title}</h1>
            <StatusBadge status={status} label={statusLabel} />
          </div>
          {project.description ? (
            <p className="mt-3 font-sans text-base leading-relaxed text-muted">
              {project.description}
            </p>
          ) : null}

          <CaseSection heading={t('problem')} id="problem">
            <p className="font-sans text-sm leading-relaxed text-muted">{project.overview}</p>
          </CaseSection>

          {project.highlights.length > 0 ? (
            <CaseSection heading={t('build')} id="build">
              <ul className="space-y-2">
                {project.highlights.map((highlight) => (
                  <li key={highlight} className="font-sans text-sm leading-relaxed text-muted">
                    {highlight}
                  </li>
                ))}
              </ul>
            </CaseSection>
          ) : null}

          <CaseSection heading={t('contribution')} id="contribution">
            <p className="font-sans text-sm leading-relaxed text-muted">{t('contributionBody')}</p>
            <p className="mt-3 font-mono text-xs text-muted">
              {t('statusLabel')}: <span className="text-foreground">{statusLabel}</span>
            </p>
          </CaseSection>

          {project.tags.length > 0 ? (
            <CaseSection heading={t('technologies')} id="technologies">
              <ul className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </CaseSection>
          ) : null}

          {project.attachments && project.attachments.length > 0 ? (
            <div className="mt-8 flex flex-wrap items-start gap-4">
              {project.attachments.map((attachment) => (
                <AttachmentView key={attachment.url} attachment={attachment} />
              ))}
            </div>
          ) : null}

          <div className="mt-10 flex flex-wrap gap-3">
            {/* Only an absolute URL can be a demo. A relative or partial value is
                a content mistake, and rendering it produced a link to a 404 on
                this site for two locales before the data was corrected. */}
            {project.url?.startsWith('http') ? (
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded border border-accent px-4 py-2 font-mono text-sm text-accent transition-colors hover:bg-accent hover:text-background"
              >
                {t('demo')}
                <ExternalIcon />
              </a>
            ) : null}
            <Link
              href="/contact"
              className="rounded bg-accent px-4 py-2 font-mono text-sm text-background hover:opacity-90"
            >
              {t('caseCta')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
