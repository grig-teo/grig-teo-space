'use client';

import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './LanguageSwitcher';

const links = [
  { key: 'about', href: '#about' },
  { key: 'projects', href: '#projects' },
  { key: 'experience', href: '#experience' },
  { key: 'contact', href: '#contact' },
] as const;

export function Header() {
  const t = useTranslations('nav');
  const tHero = useTranslations('hero');

  return (
    <header className="flex items-center justify-between px-6 py-6 md:px-12">
      <a href="#about" className="flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors">
        <span>{tHero('prompt')}</span>
        <span className="inline-block h-4 w-2 bg-accent cursor-blink" />
      </a>
      <nav className="flex items-center gap-6">
        {links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            className="text-sm text-accent hover:underline underline-offset-4"
          >
            {t(link.key)}
          </a>
        ))}
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
