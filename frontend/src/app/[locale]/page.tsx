import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { ProjectsPreview } from '@/components/Projects';
import { Experience } from '@/components/Experience';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { getExperience, getProfile, getProjects } from '@/lib/api';
import type { Locale } from '@/lib/api';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;

  const [profile, projects, experience] = await Promise.all([
    getProfile(locale),
    getProjects(locale),
    getExperience(locale),
  ]);

  return (
    <main className="min-h-screen">
      <JsonLd profile={profile} locale={locale} />
      <Header />
      <Hero profile={profile} />
      <ProjectsPreview projects={projects} />
      <Experience items={experience} />
      <Footer profile={profile} />
    </main>
  );
}
