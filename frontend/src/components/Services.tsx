import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export type ServiceItem = {
  id: string;
  title: string;
  summary: string;
  problems: string[];
  audience: string[];
  deliverables: string[];
  outcomes: string[];
};

/** Reads the translated service list. Kept in one place so both the page and
 *  the homepage preview render the same data. */
function useServices(): ServiceItem[] {
  const t = useTranslations('servicesPage');
  return t.raw('items') as ServiceItem[];
}

function BulletGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-accent">{label}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="font-sans text-sm leading-relaxed text-muted">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceBlock({ service, index }: { service: ServiceItem; index: number }) {
  const t = useTranslations('servicesPage');

  return (
    <article
      id={service.id}
      className="scroll-mt-24 rounded-lg border border-border bg-surface p-6 sm:p-8"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-xl font-bold text-foreground sm:text-2xl">{service.title}</h2>
        <span className="font-mono text-xs text-muted" aria-hidden>
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-muted">{service.summary}</p>
      <div className="mt-6 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
        <BulletGroup label={t('problemsLabel')} items={service.problems} />
        <BulletGroup label={t('audienceLabel')} items={service.audience} />
        <BulletGroup label={t('deliverablesLabel')} items={service.deliverables} />
        <BulletGroup label={t('outcomesLabel')} items={service.outcomes} />
      </div>
    </article>
  );
}

/** Full service list, used by the /services page. */
export function ServicesList() {
  const services = useServices();
  return (
    <div className="space-y-8">
      {services.map((service, index) => (
        <ServiceBlock key={service.id} service={service} index={index} />
      ))}
    </div>
  );
}

/** Compact four-card summary for the homepage. */
export function ServicesPreview() {
  const t = useTranslations('servicesPage');
  const services = useServices();

  return (
    <section id="services" className="px-4 py-16 sm:px-6 md:px-12">
      <div className="max-w-5xl">
        <h2 className="font-mono text-xs uppercase tracking-widest text-accent">{t('eyebrow')}</h2>
        <p className="mt-3 font-mono text-2xl font-bold text-foreground sm:text-3xl">
          {t('previewHeading')}
        </p>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-muted">
          {t('previewLead')}
        </p>

        <div className="mt-8 grid auto-rows-fr gap-4 sm:grid-cols-2">
          {services.map((service) => (
            <Link
              key={service.id}
              href={`/services#${service.id}`}
              className="group flex h-full flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent"
            >
              <span className="font-mono text-sm font-bold text-foreground group-hover:text-accent">
                {service.title}
              </span>
              <span className="mt-2 font-sans text-sm leading-relaxed text-muted">
                {service.summary}
              </span>
            </Link>
          ))}
        </div>

        <Link
          href="/services"
          className="mt-6 inline-block font-mono text-sm text-accent underline-offset-4 hover:underline"
        >
          {t('previewLink')} →
        </Link>
      </div>
    </section>
  );
}
