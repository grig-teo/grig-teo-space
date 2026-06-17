'use client';

import { useEffect, useRef, useState } from 'react';

const TRACK_ID = '2Cy7HGFW734CPfWSzj0jnt';
const TRACK_DURATION_MS = 298_000;

function embedSrc(): string {
  return `https://open.spotify.com/embed/track/${TRACK_ID}?utm_source=generator&autoplay=1`;
}

export function RomanianSpotifyPlayer({ locale }: { locale: string }) {
  const [session, setSession] = useState(0);
  const retriedAutoplayRef = useRef(false);

  useEffect(() => {
    if (locale !== 'ro') {
      return;
    }

    const retryAutoplay = () => {
      if (retriedAutoplayRef.current) {
        return;
      }
      retriedAutoplayRef.current = true;
      setSession((value) => value + 1);
    };

    const events: Array<keyof DocumentEventMap> = ['click', 'touchstart', 'keydown'];
    for (const event of events) {
      document.addEventListener(event, retryAutoplay, { once: true, passive: true });
    }

    const loopTimer = window.setInterval(() => {
      setSession((value) => value + 1);
    }, TRACK_DURATION_MS);

    return () => {
      for (const event of events) {
        document.removeEventListener(event, retryAutoplay);
      }
      window.clearInterval(loopTimer);
    };
  }, [locale]);

  if (locale !== 'ro') {
    return null;
  }

  return (
    <iframe
      key={session}
      title="Hora Subterana — Tibi Pin"
      src={embedSrc()}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="eager"
      className="pointer-events-none fixed h-0 w-0 border-0 opacity-0"
      aria-hidden
    />
  );
}
