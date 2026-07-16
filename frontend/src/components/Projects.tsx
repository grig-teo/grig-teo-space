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

function HighlightsList({ items, label }: { items: string[]; label: string }) {
  return (
    <div className="mb-6">
      <h4 className="mb-3 font-mono text-xs uppercase tracking-wide text-accent">{label}</h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="font-sans text-sm leading-relaxed text-muted">
            <span className="text-accent">—</span> {item}
          </li>
        ))}
      </ul>
    </div>
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
      className={`flex h-full flex-col rounded-lg border border-border bg-surface p-6 glow-card ${
        detailed ? 'min-h-0 sm:min-h-[420px]' : 'min-h-0 sm:min-h-[260px] group'
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h3 className={`font-mono font-semibold text-foreground ${detailed ? 'text-xl' : ''}`}>
            {project.title}
          </h3>
          {project.inDevelopment && (
            <span className="inline-block rounded border border-accent-2/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-2">
              {t('inDevelopment')}
            </span>
          )}
        </div>
        {!detailed && (
          <span className="shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100">
            <ExternalIcon />
          </span>
        )}
      </div>

      <p
        className={`mb-4 flex-1 font-sans text-sm leading-relaxed text-muted ${
          detailed ? '' : 'line-clamp-4'
        }`}
      >
        {detailed ? project.overview : project.description}
      </p>

      {detailed && project.highlights.length > 0 && (
        <HighlightsList items={project.highlights} label={t('highlights')} />
      )}

      <p className="mt-auto pt-2 font-mono text-xs text-muted/80">{project.tags.join(' · ')}</p>

      {detailed && (
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex w-fit items-center gap-2 rounded border border-accent px-4 py-2 font-mono text-sm text-accent transition-colors hover:bg-accent hover:text-background"
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
      className="group block h-full"
    >
      {card}
    </a>
  );
}

export function ProjectsPreview({ projects }: { projects: Project[] }) {
  const t = useTranslations('sections');

  return (
    <section id="projects" className="px-4 py-12 sm:px-6 sm:py-16 md:px-12">
      <div className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-mono text-sm text-muted">
          <span className="text-accent">##</span> {t('projects')}
        </h2>
        <Link
          href="/projects"
          className="font-mono text-sm text-accent transition-opacity hover:underline underline-offset-4"
        >
          {t('viewAll')}
        </Link>
      </div>
      <div className="grid auto-rows-fr gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
