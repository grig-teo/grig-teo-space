import type { Profile } from '@/lib/api';

export function Hero({ profile }: { profile: Profile }) {
  return (
    <section id="about" className="flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-24 md:py-32">
      <h1 className="max-w-full break-words text-3xl font-bold tracking-tight sm:text-5xl md:text-7xl">
        {profile.name}
      </h1>
      <p className="mt-4 max-w-2xl text-sm text-muted sm:mt-6 md:text-base">{profile.title}</p>
    </section>
  );
}
