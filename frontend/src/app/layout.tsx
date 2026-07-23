import type { Metadata } from 'next';

export const metadata: Metadata = {
  // Absolute base for og:image and friends — without it Next falls back to
  // http://localhost:3000 in social metadata.
  metadataBase: new URL('https://grig-teo.space'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
