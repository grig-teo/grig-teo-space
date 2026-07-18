import { Hero } from '@/components/Hero';
import type { HeroStats } from '@/components/Hero';
import { BlogPreview } from '@/components/Blog';
import { ProjectsPreview } from '@/components/Projects';
import { Experience } from '@/components/Experience';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { getBlogPosts, getExperience, getProfile, getProjects, getPublicHealth } from '@/lib/api';
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

  const [profile, blogPosts, projects, experience, health] = await Promise.all([
    getProfile(locale),
    getBlogPosts(locale),
    getProjects(locale),
    getExperience(locale),
    getPublicHealth(),
  ]);

  const stats = computeHeroStats(experience, projects, blogPosts);
  const avgBpm = health?.metrics.find((m) => m.metric === 'heart_rate')?.summary.avg;
  const avgSteps = health?.metrics.find((m) => m.metric === 'steps')?.summary.avg;
  // Map the steps average to a plausible stride cadence (0.9–2.2 strides/s).
  const cadence = avgSteps ? Math.min(Math.max(avgSteps * 0.06, 0.9), 2.2) : undefined;

  return (
    <main className="min-h-screen">
      <JsonLd profile={profile} locale={locale} />
      <Hero
        profile={{ name: profile.name, title: profile.title, location: profile.location }}
        stats={stats}
        bpm={avgBpm ? Math.round(avgBpm) : undefined}
        cadence={cadence}
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
