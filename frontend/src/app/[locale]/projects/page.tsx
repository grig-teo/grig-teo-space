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
      <section className="px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-accent hover:underline underline-offset-4 sm:mb-8"
        >
          {t('back')}
        </Link>
        <h1 className="mb-3 text-2xl font-bold sm:text-3xl">{t('heading')}</h1>
        <p className="mb-8 max-w-2xl text-sm text-muted sm:mb-12">{t('description')}</p>
        <div className="grid auto-rows-fr gap-6 sm:gap-8 lg:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className="h-full">
              <ProjectCard project={project} detailed />
            </div>
          ))}
        </div>
      </section>
      <Footer profile={profile} />
    </main>
  );
}
