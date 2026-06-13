'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Project } from '@/lib/api';

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

export function ProjectCard({
  project,
  detailed = false,
}: {
  project: Project;
  detailed?: boolean;
}) {
  const t = useTranslations('projectsPage');

  const card = (
    <article
      className={`flex flex-col border border-border p-6 transition-colors ${
        detailed ? '' : 'group hover:border-accent'
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <h3 className={`font-semibold text-foreground ${detailed ? 'text-xl' : ''}`}>
          {project.title}
        </h3>
        {!detailed && (
          <span className="text-accent opacity-70 transition-opacity group-hover:opacity-100">
            <ExternalIcon />
          </span>
        )}
      </div>

      <p className="mb-4 text-sm leading-relaxed text-muted">
        {detailed ? project.overview : project.description}
      </p>

      {detailed && project.highlights.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-3 text-xs uppercase tracking-wide text-accent">
            {t('highlights')}
          </h4>
          <ul className="space-y-2">
            {project.highlights.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-muted">
                <span className="text-accent">—</span> {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span key={tag} className="border border-border px-2 py-0.5 text-xs text-muted">
            {tag}
          </span>
        ))}
      </div>

      {detailed && (
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 text-sm text-accent hover:underline underline-offset-4"
        >
          {t('visit')}
          <ExternalIcon />
        </a>
      )}
    </article>
  );

  if (detailed) {
    return card;
  }

  return (
    <a
      href={project.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      {card}
    </a>
  );
}

export function ProjectsPreview({ projects }: { projects: Project[] }) {
  const t = useTranslations('sections');

  return (
    <section id="projects" className="px-6 py-16 md:px-12">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-lg text-foreground">{t('projects')}</h2>
        <Link
          href="/projects"
          className="text-sm text-accent transition-opacity hover:underline underline-offset-4"
        >
          {t('viewAll')}
        </Link>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
