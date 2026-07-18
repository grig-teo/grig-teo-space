'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';

const baseLinks = [
  { key: 'about', href: '/#about' },
  { key: 'blog', href: '/#blog' },
  { key: 'projects', href: '/#projects' },
  { key: 'experience', href: '/#experience' },
  { key: 'health', href: '/#health' },
  { key: 'contact', href: '/#contact' },
] as const;

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </>
      )}
    </svg>
  );
}

export function Header({ showBlog = true, showHealth = false }: { showBlog?: boolean; showHealth?: boolean }) {
  const t = useTranslations('nav');
  const tHero = useTranslations('hero');
  const [menuOpen, setMenuOpen] = useState(false);
  const links = baseLinks.filter((link) => {
    if (link.key === 'blog' && !showBlog) return false;
    if (link.key === 'health' && !showHealth) return false;
    return true;
  });

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 md:px-12">
        <Link
          href="/#about"
          onClick={closeMenu}
          className="flex min-w-0 items-center gap-2 font-mono text-sm text-muted transition-colors hover:text-accent"
        >
          <span className="truncate">{tHero('prompt')}</span>
          <span className="inline-block h-4 w-2 shrink-0 bg-accent cursor-blink" />
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          <nav className="hidden items-center gap-4 md:flex lg:gap-6">
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className="font-mono text-sm text-muted transition-colors hover:text-accent"
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>
          <LanguageSwitcher />
          <ThemeSwitcher />
          <button
            type="button"
            className="inline-flex items-center justify-center p-1 text-muted transition-colors hover:text-accent md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-border bg-surface px-4 py-4 sm:px-6 md:hidden">
          <div className="flex flex-col gap-4">
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                onClick={closeMenu}
                className="font-mono text-sm text-muted transition-colors hover:text-accent"
              >
                {t(link.key)}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
