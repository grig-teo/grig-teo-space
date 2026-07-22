import { Hero } from '@/components/Hero';
import type { HeroStats } from '@/components/Hero';
import { BlogPreview } from '@/components/Blog';
import { HeroScene } from '@/components/HeroScene';
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

/** Sums the step readings recorded on the current UTC day. */
function sumTodaySteps(series: { recordedAt: string; value: number }[]): number {
  const today = new Date().toISOString().slice(0, 10);
  const total = series
    .filter((point) => point.recordedAt.slice(0, 10) === today)
    .reduce((sum, point) => sum + point.value, 0);
  return Math.round(total);
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
  const avgStress = health?.metrics.find((m) => m.metric === 'stress')?.summary.avg;
  const stress =
    avgStress != null ? Math.min(Math.max(Math.round(avgStress), 0), 100) : undefined;
  const stepsMetric = health?.metrics.find((m) => m.metric === 'steps');
  // Map the steps average to a plausible stride cadence (0.9–2.2 strides/s).
  const avgSteps = stepsMetric?.summary.avg;
  const cadence = avgSteps ? Math.min(Math.max(avgSteps * 0.06, 0.9), 2.2) : undefined;
  // Today's step total: sum the series points recorded on the current UTC day.
  const stepsToday = stepsMetric ? sumTodaySteps(stepsMetric.series) : undefined;

  return (
    <main className="min-h-screen">
      <JsonLd profile={profile} locale={locale} />
      <Hero
        profile={{ name: profile.name, title: profile.title, location: profile.location }}
        stats={stats}
        bpm={avgBpm ? Math.round(avgBpm) : undefined}
        cadence={cadence}
        stepsToday={stepsToday}
        stress={stress}
      />
      <div className="flex justify-center py-4">
        <HeroScene />
      </div>
      <Reveal>
        <Experience items={experience} />
      </Reveal>
      <Reveal>
        <ProjectsPreview projects={projects} />
      </Reveal>
      <Reveal>
        <BlogPreview posts={blogPosts} locale={locale} />
      </Reveal>
    </main>
  );
}
