import { Header } from '@/components/Header';
import { ProjectCard } from '@/components/Projects';
import { Footer } from '@/components/Footer';
import { Link } from '@/i18n/navigation';
import { getProfile, getProjects } from '@/lib/api';
import type { Locale } from '@/lib/api';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'projectsPage' });
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function ProjectsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'projectsPage' });

  const [profile, projects] = await Promise.all([
    getProfile(locale),
    getProjects(locale),
  ]);

  return (
    <main className="min-h-screen">
      <Header />
      <section className="px-6 py-12 md:px-12">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-accent hover:underline underline-offset-4"
        >
          {t('back')}
        </Link>
        <h1 className="mb-3 text-3xl font-bold">{t('heading')}</h1>
        <p className="mb-12 max-w-2xl text-sm text-muted">{t('description')}</p>
        <div className="grid gap-8 lg:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} detailed />
          ))}
        </div>
      </section>
      <Footer profile={profile} />
    </main>
  );
}
