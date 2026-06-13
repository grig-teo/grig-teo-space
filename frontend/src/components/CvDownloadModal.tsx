'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getCvUrl, type Locale } from '@/lib/api';

const locales: { id: Locale; labelKey: 'english' | 'russian' | 'romanian' }[] = [
  { id: 'en', labelKey: 'english' },
  { id: 'ru', labelKey: 'russian' },
  { id: 'ro', labelKey: 'romanian' },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CvDownloadModal({ open, onClose }: Props) {
  const t = useTranslations('footer');
  const siteLocale = useLocale() as Locale;
  const [selected, setSelected] = useState<Locale>(siteLocale);

  useEffect(() => {
    if (open) {
      setSelected(siteLocale);
    }
  }, [open, siteLocale]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleDownload() {
    const url = getCvUrl(selected);
    const link = document.createElement('a');
    link.href = url;
    link.download = `grigore_teodoru_cv_${selected}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md border border-border/60 bg-background p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-modal-title"
      >
        <h2 id="cv-modal-title" className="text-lg font-semibold">
          {t('cvModalTitle')}
        </h2>
        <p className="mt-2 text-sm text-muted">{t('cvModalDescription')}</p>

        <fieldset className="mt-6 space-y-2">
          <legend className="sr-only">{t('cvLanguage')}</legend>
          {locales.map(({ id, labelKey }) => (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-3 border px-3 py-2 text-sm transition-colors ${
                selected === id
                  ? 'border-accent text-accent'
                  : 'border-border/60 text-muted hover:border-accent/40'
              }`}
            >
              <input
                type="radio"
                name="cv-locale"
                value={id}
                checked={selected === id}
                onChange={() => setSelected(id)}
                className="accent-accent"
              />
              {t(labelKey)}
            </label>
          ))}
        </fieldset>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="border border-accent/60 px-4 py-2 text-sm text-accent hover:bg-accent/10"
          >
            {t('cvConfirm')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-border/60 px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            {t('cvCancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
