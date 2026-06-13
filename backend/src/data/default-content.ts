import { experienceItems } from '../experience.data';
import type { ExperienceItem, Profile, Project } from '../types';

export function getDefaultProfile(): Profile {
  return {
    name: {
      en: 'Gregory Theodor',
      ru: 'Григорий Федоров',
      ro: 'Grigore Teodoru',
    },
    title: {
      en: 'Full-Stack Developer',
      ru: 'Full-Stack разработчик',
      ro: 'Dezvoltator Full-Stack',
    },
    location: {
      en: 'Moldova',
      ru: 'Молдова',
      ro: 'Moldova',
    },
    contact: {
      email: 'grigore.teodoru97@gmail.com',
      github: 'https://github.com/grig-teo',
      linkedin: 'https://www.linkedin.com/in/grigore-teodoru-228103287/',
      phone: {
        en: '',
        ru: '+79091589886',
        ro: '',
      },
    },
  };
}

export function getDefaultProjects(): Project[] {
  return [
    {
      id: 'debate-room',
      title: {
        en: 'Debate Room',
        ru: 'Debate Room',
        ro: 'Debate Room',
      },
      description: {
        en: 'Cross-platform live debate platform for iOS, Android, and web with real-time audio/video.',
        ru: 'Кроссплатформенная платформа для онлайн-дебатов на iOS, Android и web с аудио/видео в реальном времени.',
        ro: 'Platformă cross-platform pentru dezbateri live pe iOS, Android și web, cu audio/video în timp real.',
      },
      overview: {
        en: 'Debate Room is a cross-platform live debate platform built with native SwiftUI (iOS) and Jetpack Compose (Android) clients, a Next.js web app, and a Dockerized TypeScript backend with realtime signaling, recording, and AI pipelines.',
        ru: 'Debate Room — кроссплатформенная платформа для онлайн-дебатов с нативными клиентами SwiftUI (iOS) и Jetpack Compose (Android), Next.js web-приложением и Dockerized TypeScript backend с realtime-сигналингом, записью и AI-пайплайнами.',
        ro: 'Debate Room este o platformă cross-platform pentru dezbateri live, cu clienți nativi SwiftUI (iOS) și Jetpack Compose (Android), aplicație web Next.js și backend TypeScript containerizat cu semnalizare realtime, înregistrare și pipeline-uri AI.',
      },
      highlights: {
        en: [
          'Native iOS app in SwiftUI with WebRTC, SMS auth, Google Sign-In, and push notifications.',
          'Native Android app in Jetpack Compose with the same auth, profile, and debate flows.',
          'Dockerized backend: REST API, Socket.IO + mediasoup signaling, recording worker, AI worker.',
          'Realtime debate mechanics: timed turns, moderation, blind mode, chat, polls, and on-site debates.',
          'Server-side recording with mediasoup, FFmpeg, and object storage uploads.',
          'AI/NLP pipeline: Whisper transcription, summaries, Ollama topic generation, and AI moderator.',
          'Next.js marketing site, admin dashboard, OpenAPI docs, and observability tooling.',
        ],
        ru: [
          'Нативное iOS-приложение на SwiftUI с WebRTC, SMS-авторизацией, Google Sign-In и push-уведомлениями.',
          'Нативное Android-приложение на Jetpack Compose с теми же auth, профилем и debate-потоками.',
          'Dockerized backend: REST API, Socket.IO + mediasoup signaling, recording worker, AI worker.',
          'Realtime-механики дебатов: таймеры, модерация, blind mode, чат, опросы и on-site debates.',
          'Серверная запись через mediasoup, FFmpeg и загрузку в object storage.',
          'AI/NLP pipeline: Whisper-транскрипция, summaries, Ollama topic generation и AI moderator.',
          'Next.js маркетинговый сайт, admin dashboard, OpenAPI docs и observability tooling.',
        ],
        ro: [
          'Aplicație nativă iOS în SwiftUI cu WebRTC, autentificare SMS, Google Sign-In și notificări push.',
          'Aplicație nativă Android în Jetpack Compose cu aceleași fluxuri auth, profil și dezbateri.',
          'Backend containerizat: REST API, semnalizare Socket.IO + mediasoup, worker înregistrare, worker AI.',
          'Mecanici realtime: runde cronometrate, moderare, blind mode, chat, sondaje și dezbateri on-site.',
          'Înregistrare server-side cu mediasoup, FFmpeg și upload în object storage.',
          'Pipeline AI/NLP: transcriere Whisper, rezumate, generare topicuri Ollama și moderator AI.',
          'Site marketing Next.js, dashboard admin, documentație OpenAPI și tooling observability.',
        ],
      },
      url: 'https://github.com/grig-teo',
      tags: [
        'Swift',
        'Kotlin',
        'TypeScript',
        'Express',
        'Socket.IO',
        'mediasoup',
        'WebRTC',
        'FFmpeg',
        'Docker',
        'MongoDB',
      ],
      inDevelopment: true,
    },
    {
      id: 'vecin2vecin',
      title: {
        en: 'Vecin2Vecin',
        ru: 'Vecin2Vecin',
        ro: 'Vecin2Vecin',
      },
      description: {
        en: 'Hyperlocal P2P grocery delivery marketplace with phone auth, payments, maps, and courier flows.',
        ru: 'Гиперлокальный P2P маркетплейс доставки продуктов с SMS-авторизацией, платежами, картами и курьерскими потоками.',
        ro: 'Marketplace hiperlocal P2P pentru livrare de produse, cu autentificare telefonică, plăți, hărți și fluxuri curier.',
      },
      overview: {
        en: 'Vecin2Vecin is a neighbor-to-neighbor grocery delivery marketplace where customers order groceries and nearby couriers fulfill deliveries inside a defined service area.',
        ru: 'Vecin2Vecin — маркетплейс доставки продуктов «сосед-соседу», где клиенты заказывают продукты, а курьеры выполняют доставку в заданной зоне.',
        ro: 'Vecin2Vecin este un marketplace de livrare vecin-cu-vecin, unde clienții comandă produse alimentare, iar curierii din apropiere livrează în zona deservită.',
      },
      highlights: {
        en: [
          'End-to-end product: landing page, phone/SMS auth, onboarding, catalog, basket, checkout, and tracking.',
          'Courier flows: take order, in-app chat, push notifications, and account settings.',
          'Multi-provider payments with card and cash checkout, webhooks, and Stripe Connect payouts.',
          'Maps and geo: delivery area picker, address editor, geocoding, and region-aware tiles.',
          'NestJS REST API with JWT auth, MongoDB, order batching, MinIO uploads, and 3-locale UI.',
          'Production deployment on VPS with Docker Compose, HTTPS, custom domain, and SMS integration.',
        ],
        ru: [
          'End-to-end продукт: landing, SMS-авторизация, onboarding, каталог, корзина, checkout и трекинг.',
          'Курьерские потоки: take order, in-app chat, push-уведомления и настройки аккаунта.',
          'Мульти-провайдерные платежи: карта и наличные, webhooks и Stripe Connect payouts.',
          'Карты и geo: выбор зоны доставки, редактор адреса, geocoding и region-aware tiles.',
          'NestJS REST API с JWT auth, MongoDB, order batching, MinIO uploads и UI на 3 языках.',
          'Production deploy на VPS с Docker Compose, HTTPS, custom domain и SMS-интеграцией.',
        ],
        ro: [
          'Produs end-to-end: landing, autentificare SMS, onboarding, catalog, coș, checkout și tracking.',
          'Fluxuri curier: preluare comandă, chat in-app, notificări push și setări cont.',
          'Plăți multi-provider: card și cash, webhooks și plăți Stripe Connect.',
          'Hărți și geo: selector zonă livrare, editor adresă, geocoding și tile-uri region-aware.',
          'REST API NestJS cu JWT auth, MongoDB, order batching, upload MinIO și UI în 3 limbi.',
          'Deploy production pe VPS cu Docker Compose, HTTPS, domeniu custom și integrare SMS.',
        ],
      },
      url: 'https://vecin2vecin.ro/',
      tags: ['Next.js', 'NestJS', 'MongoDB', 'Stripe', 'Docker', 'Leaflet'],
      inDevelopment: true,
    },
  ];
}

export function getDefaultExperience(): ExperienceItem[] {
  return experienceItems;
}
