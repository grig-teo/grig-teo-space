import { ImageResponse } from 'next/og';

export const alt = 'Gregory Theodor — AI & Full-Stack Software Engineer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Default site-wide social card. Pages without their own opengraph-image
 *  inherit this one (blog articles override it with a per-post card). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          backgroundColor: '#0a0d12',
          color: '#e2e8f0',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontSize: 28, color: '#2dd4bf', marginBottom: 24 }}>
          grig-teo.space
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
          Gregory Theodor
        </div>
        <div style={{ fontSize: 36, color: '#2dd4bf', marginTop: 20 }}>
          AI &amp; Full-Stack Software Engineer
        </div>
        <div style={{ fontSize: 26, color: '#7d8a9b', marginTop: 18 }}>
          Products from idea to production
        </div>
      </div>
    ),
    size,
  );
}
