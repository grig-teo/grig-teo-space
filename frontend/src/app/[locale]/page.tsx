import { Hero } from '@/components/Hero';
import type { HeroStats } from '@/components/Hero';
import { BlogPreview } from '@/components/Blog';
import { ProjectsPreview } from '@/components/Projects';
import { Experience } from '@/components/Experience';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { getBlogPosts, getExperience, getProfile, getProjects } from '@/lib/api';
import type { BlogPost, ExperienceItem, Locale, Project } from '@/lib/api';

type Props = {
  params: Promise<{ locale: Locale }>;
};

/**
 * Builds the hero stats strip from portfolio data. `years` is the current
 * year minus the earliest start year parsed from experience periods
 * (formats like "2018 — 2021" or "2026 — Present").
 */
function computeHeroStats(
  experience: ExperienceItem[],
  projects: Project[],
  blogPosts: BlogPost[],
): HeroStats {
  const currentYear = new Date().getFullYear();
  const startYears = experience
    .map((item) => Number(item.period.match(/\d{4}/)?.[0]))
    .filter((year) => Number.isFinite(year) && year > 0);
  const earliest = startYears.length > 0 ? Math.min(...startYears) : currentYear;

  return {
    years: currentYear - earliest,
    roles: experience.length,
    products: projects.length,
    articles: blogPosts.length,
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;

  const [profile, blogPosts, projects, experience] = await Promise.all([
    getProfile(locale),
    getBlogPosts(locale),
    getProjects(locale),
    getExperience(locale),
  ]);

  const stats = computeHeroStats(experience, projects, blogPosts);

  return (
    <main className="min-h-screen">
      <JsonLd profile={profile} locale={locale} />
      <Hero
        profile={{ name: profile.name, title: profile.title, location: profile.location }}
        stats={stats}
      />
      <Reveal>
        <ProjectsPreview projects={projects} />
      </Reveal>
      <Reveal>
        <BlogPreview posts={blogPosts} locale={locale} />
      </Reveal>
      <Reveal>
        <Experience items={experience} />
      </Reveal>
    </main>
  );
}
