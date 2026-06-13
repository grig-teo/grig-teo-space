import type { Profile } from '@/lib/api';

type Props = {
  profile: Profile;
  locale: string;
};

const alternateNames: Record<string, string[]> = {
  en: ['Grigore Teodoru', 'Gregory Theodor'],
  ru: ['Grigore Teodoru', 'Gregory Theodor', 'Григорий Федоров'],
  ro: ['Gregory Theodor', 'Grigore Teodoru'],
};

export function JsonLd({ profile, locale }: Props) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    alternateName: alternateNames[locale] ?? alternateNames.en,
    jobTitle: profile.title,
    url: `https://grig-teo.space/${locale}`,
    email: profile.contact.email,
    sameAs: [profile.contact.github, profile.contact.linkedin],
    knowsAbout: [
      'Full-stack development',
      'Remote software development',
      'Freelance software development',
      'TypeScript',
      'NestJS',
      'Next.js',
      'WebRTC',
      'Real-time applications',
      'iOS development',
      'Android development',
      'Mobile application development',
      'Marketplace development',
      'Payment integration',
      'Docker',
      'MongoDB',
    ],
    homeLocation: {
      '@type': 'Place',
      name: profile.location,
    },
    ...(profile.contact.phone ? { telephone: profile.contact.phone } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
