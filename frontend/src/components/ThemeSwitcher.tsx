'use client';

import { useEffect, useState } from 'react';

type ThemePreference = 'system' | 'light' | 'dark';
type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

function applyTheme(preference: ThemePreference): EffectiveTheme {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective: EffectiveTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }

  return effective;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2.2M19.8 12H22M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 14.5A9 9 0 1 1 9.5 3 7.2 7.2 0 0 0 21 14.5z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4.5" width="17" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}

export function ThemeSwitcher() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>('light');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const initial: ThemePreference =
      saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    setPreference(initial);
    setEffectiveTheme(applyTheme(initial));

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? 'system') === 'system') {
        setEffectiveTheme(applyTheme('system'));
      }
    };
    media.addEventListener('change', handleSystemChange);
    return () => media.removeEventListener('change', handleSystemChange);
  }, []);

  const selectTheme = (next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
    setEffectiveTheme(applyTheme(next));
  };

  const buttonClass = (mode: ThemePreference) =>
    `inline-flex items-center justify-center p-1.5 transition-colors ${
      preference === mode ? 'bg-accent/20 text-accent' : 'text-muted hover:text-accent'
    }`;

  return (
    <div className="inline-flex items-center border border-border/60 bg-background/90" aria-label="Theme switcher">
      <button type="button" onClick={() => selectTheme('light')} className={buttonClass('light')} aria-label="Light theme">
        <SunIcon />
      </button>
      <button type="button" onClick={() => selectTheme('dark')} className={buttonClass('dark')} aria-label="Dark theme">
        <MoonIcon />
      </button>
      <button type="button" onClick={() => selectTheme('system')} className={buttonClass('system')} aria-label="System theme">
        <SystemIcon />
      </button>
      <span className="px-1.5 text-[10px] uppercase tracking-wide text-muted">{effectiveTheme}</span>
    </div>
  );
}
