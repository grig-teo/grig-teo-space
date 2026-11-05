'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { submitContact, type ContactSubmission } from '@/lib/api';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const FIELD =
  'w-full rounded border border-border bg-background px-3 py-2 font-sans text-sm text-foreground outline-none transition-colors focus:border-accent';
const LABEL = 'mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted';

/** Client-side mirror of the server limits, so obvious mistakes never round-trip. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ContactForm({ source = 'contact' }: { source?: string }) {
  const t = useTranslations('contact.form');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  function validate(data: { name: string; email: string; description: string }) {
    const errors: Record<string, string> = {};
    if (data.name.trim().length < 2) errors.name = t('errorName');
    if (!EMAIL_PATTERN.test(data.email.trim())) errors.email = t('errorEmail');
    if (data.description.trim().length < 20) errors.description = t('errorDescription');
    return errors;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();

    const data = {
      name: value('name'),
      email: value('email'),
      description: value('description'),
    };
    const errors = validate(data);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatus('idle');
      return;
    }

    setStatus('sending');
    setError(null);

    const payload: ContactSubmission = {
      ...data,
      company: value('company') || undefined,
      budget: value('budget') || undefined,
      timeline: value('timeline') || undefined,
      website: value('website'),
      startedAt: startedAt.current,
      source,
    };

    const result = await submitContact(payload);
    if (result.ok) {
      setStatus('sent');
      return;
    }
    setStatus('error');
    setError(result.error);
  }

  if (status === 'sent') {
    return (
      <div className="rounded-lg border border-accent/40 bg-surface p-6" role="status" aria-live="polite">
        <p className="font-mono text-sm text-accent">{t('successTitle')}</p>
        <p className="mt-2 font-sans text-sm leading-relaxed text-muted">{t('successBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Honeypot: off-screen, unfocusable, and never announced to a human. */}
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="website">website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="name">
            {t('name')}
          </label>
          <input
            id="name"
            name="name"
            required
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            className={FIELD}
          />
          {fieldErrors.name ? (
            <p id="name-error" className="mt-1 font-sans text-xs text-accent-2">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
        <div>
          <label className={LABEL} htmlFor="email">
            {t('email')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={FIELD}
          />
          {fieldErrors.email ? (
            <p id="email-error" className="mt-1 font-sans text-xs text-accent-2">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="company">
          {t('company')}
        </label>
        <input id="company" name="company" autoComplete="organization" className={FIELD} />
      </div>

      <div>
        <label className={LABEL} htmlFor="description">
          {t('description')}
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          placeholder={t('descriptionPlaceholder')}
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={fieldErrors.description ? 'description-error' : undefined}
          className={`${FIELD} resize-y`}
        />
        {fieldErrors.description ? (
          <p id="description-error" className="mt-1 font-sans text-xs text-accent-2">
            {fieldErrors.description}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="budget">
            {t('budget')}
          </label>
          <input id="budget" name="budget" placeholder={t('budgetPlaceholder')} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="timeline">
            {t('timeline')}
          </label>
          <input
            id="timeline"
            name="timeline"
            placeholder={t('timelinePlaceholder')}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded bg-accent px-5 py-2.5 font-mono text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {status === 'sending' ? t('sending') : t('submit')}
        </button>
        <p className="font-sans text-xs text-muted">{t('privacy')}</p>
      </div>

      {status === 'error' ? (
        <p className="font-sans text-sm text-accent-2" role="alert" aria-live="assertive">
          {t('errorGeneric')} <span className="font-mono text-xs">{error}</span>
        </p>
      ) : null}
    </form>
  );
}
