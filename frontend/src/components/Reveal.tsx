'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const classes = `reveal${visible ? ' reveal-visible' : ''}${className ? ` ${className}` : ''}`;

  return (
    <div ref={ref} className={classes}>
      {children}
    </div>
  );
}
