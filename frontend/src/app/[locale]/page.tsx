import { Hero } from '@/components/Hero';
import { BlogPreview } from '@/components/Blog';
import { ProjectsPreview } from '@/components/Projects';
import { Experience } from '@/components/Experience';
import { JsonLd } from '@/components/JsonLd';
import { getBlogPosts, getExperience, getProfile, getProjects } from '@/lib/api';
import type { Locale } from '@/lib/api';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;

  const [profile, blogPosts, projects, experience] = await Promise.all([
    getProfile(locale),
    getBlogPosts(locale),
    getProjects(locale),
    getExperience(locale),
  ]);

  return (
    <main className="min-h-screen">
      <JsonLd profile={profile} locale={locale} />
      <Hero profile={profile} />
      <BlogPreview posts={blogPosts} locale={locale} />
      <ProjectsPreview projects={projects} />
      <Experience items={experience} />
    </main>
  );
}
