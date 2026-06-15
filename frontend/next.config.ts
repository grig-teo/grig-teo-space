import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@blocknote/core', '@blocknote/react', '@blocknote/mantine', '@mantine/core', '@mantine/hooks'],
  async rewrites() {
    const backend = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
