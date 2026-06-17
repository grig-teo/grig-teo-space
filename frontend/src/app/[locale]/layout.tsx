import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AssistantChatWidget } from '@/components/AssistantChatWidget';
import { routing } from '@/i18n/routing';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const ogLocale = locale === 'ru' ? 'ru_RU' : locale === 'ro' ? 'ro_RO' : 'en_US';

  return {
    metadataBase: new URL('https://grig-teo.space'),
    title: t('title'),
    description: t('description'),
    keywords: t('keywords'),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: '/en',
        ru: '/ru',
        ro: '/ro',
        'x-default': '/en',
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `/${locale}`,
      siteName: 'grig-teo',
      locale: ogLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: t('title'),
      description: t('description'),
    },
    robots: {
      index: true,
      follow: true,
    },
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      ],
      apple: '/apple-touch-icon.png',
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'en' | 'ru' | 'ro')) {
    notFound();
  }

  const messages = await getMessages();
  const themeInitScript = `(function(){try{var k='theme-preference';var p=localStorage.getItem(k)||'system';if(p==='light'||p==='dark'){document.documentElement.setAttribute('data-theme',p);}else{document.documentElement.removeAttribute('data-theme');}}catch(e){}})();`;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <NextIntlClientProvider messages={messages}>
          {children}
          <AssistantChatWidget locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
