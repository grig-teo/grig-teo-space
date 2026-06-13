import type { Profile } from '@/lib/api';

export function Hero({ profile }: { profile: Profile }) {
  return (
    <section id="about" className="flex flex-col items-center justify-center px-6 py-24 text-center md:py-32">
      <h1 className="text-5xl font-bold tracking-tight md:text-7xl">{profile.name}</h1>
      <p className="mt-6 max-w-2xl text-sm text-muted md:text-base">{profile.title}</p>
    </section>
  );
}
