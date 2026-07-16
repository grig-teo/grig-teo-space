'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Profile } from '@/lib/api';
import { CvDownloadModal } from '@/components/CvDownloadModal';

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 114.126 0 2.063 2.063 0 01-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export function Footer({ contact }: { contact: Profile['contact'] }) {
  const t = useTranslations('footer');
  const [cvModalOpen, setCvModalOpen] = useState(false);

  return (
    <>
      <footer id="contact" className="flex w-full flex-col items-center justify-between gap-6 border-t border-border px-4 py-8 sm:px-6 sm:py-10 md:flex-row md:px-12">
        <button
          type="button"
          onClick={() => setCvModalOpen(true)}
          className="inline-flex items-center gap-2 rounded border border-accent px-5 py-2.5 font-mono text-sm text-accent transition-colors hover:bg-accent hover:text-background"
        >
          <DownloadIcon />
          {t('downloadCv')}
        </button>
        <div className="flex items-center gap-6 text-muted">
          <a
            href={contact.github}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-accent"
            aria-label="GitHub"
          >
            <GitHubIcon />
          </a>
          <a
            href={contact.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-accent"
            aria-label="LinkedIn"
          >
            <LinkedInIcon />
          </a>
          <a
            href={`mailto:${contact.email}`}
            className="transition-colors hover:text-accent"
            aria-label="Email"
          >
            <MailIcon />
          </a>
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="transition-colors hover:text-accent"
              aria-label={t('phone')}
              title={contact.phone}
            >
              <PhoneIcon />
            </a>
          )}
        </div>
      </footer>
      <CvDownloadModal open={cvModalOpen} onClose={() => setCvModalOpen(false)} />
    </>
  );
}
