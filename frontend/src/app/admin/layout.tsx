import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  // Without this, relative og:image URLs fall back to http://localhost:3000.
  metadataBase: new URL('https://grig-teo.space'),
  title: 'Admin — grig-teo.space',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
