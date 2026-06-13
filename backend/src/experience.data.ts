import type { ExperienceItem } from './types';

export const experienceItems: ExperienceItem[] = [
  {
    id: 'vecin2vecin',
    period: {
      en: '2025 — Present',
      ru: '2025 — н.в.',
      ro: '2025 — Prezent',
    },
    role: {
      en: 'Founder / Full-Stack Developer',
      ru: 'Основатель / Full-Stack разработчик',
      ro: 'Fondator / Dezvoltator Full-Stack',
    },
    company: 'Vecin2Vecin',
    companyUrl: 'https://vecin2vecin.ro/',
    description: {
      en: 'Built end-to-end hyperlocal grocery delivery platform: auth, catalog, checkout, courier flows, payments, maps, and Docker deployment on VPS.',
      ru: 'Создал платформу гиперлокальной доставки продуктов: авторизация, каталог, checkout, курьерские потоки, платежи, карты и Docker-деплой на VPS.',
      ro: 'Am construit platformă hiperlocală de livrare: autentificare, catalog, checkout, fluxuri curier, plăți, hărți și deploy Docker pe VPS.',
    },
    summary: {
      en: 'Built and launched a neighbor-to-neighbor grocery delivery platform — a P2P marketplace where customers order groceries and nearby couriers fulfill deliveries within a defined service area.',
      ru: 'Создал и запустил платформу доставки продуктов «сосед-соседу» — P2P маркетплейс, где клиенты заказывают продукты, а курьеры выполняют доставку в заданной зоне.',
      ro: 'Am construit și lansat o platformă de livrare vecin-cu-vecin — marketplace P2P unde clienții comandă produse, iar curierii livrează în zona deservită.',
    },
    highlights: {
      en: [
        'End-to-end product — landing page, phone/SMS auth, onboarding (address, ID verification, selfie), product catalog, basket & checkout, order tracking, courier take-order flow, in-app chat, push notifications, and account settings.',
        'Payments — multi-provider architecture with card and cash checkout, webhooks/callbacks, courier payout card binding, and payment status on orders; Stripe for international payouts where applicable.',
        'Maps & geo — delivery area picker, address editor, order maps with region-aware tile providers, geocoding integration, and geo-based currency / visitor country detection.',
        'Backend API — NestJS REST API with JWT auth, MongoDB, order batching, courier payouts, basket, regional product catalog, MinIO for file uploads.',
        'Localization — multi-language UI (3 locales) and legal/compliance information on the landing page.',
        'Production deployment — Docker Compose on VPS, custom domain with HTTPS, env/secrets management, deploy scripts, third-party SMS provider integration.',
        'Reliability & UX fixes — payment fulfillment race conditions, acquiring API edge cases, delivery address CRUD, and empty-state improvements.',
      ],
      ru: [
        'End-to-end продукт — landing, SMS-авторизация, onboarding (адрес, ID, selfie), каталог, корзина и checkout, трекинг заказа, take-order для курьера, in-app chat, push-уведомления и настройки аккаунта.',
        'Платежи — multi-provider архитектура с оплатой картой и наличными, webhooks/callbacks, привязка карты для выплат курьерам и статус оплаты заказа; Stripe для международных выплат.',
        'Карты и geo — выбор зоны доставки, редактор адреса, карты заказов с region-aware tiles, geocoding и определение валюты/страны посетителя.',
        'Backend API — NestJS REST API с JWT auth, MongoDB, order batching, выплаты курьерам, корзина, региональный каталог, MinIO для загрузок.',
        'Локализация — UI на 3 языках и legal/compliance информация на landing page.',
        'Production deploy — Docker Compose на VPS, custom domain с HTTPS, env/secrets, deploy scripts и интеграция SMS-провайдера.',
        'Reliability & UX — race conditions при оплате, edge cases acquiring API, CRUD адресов доставки и улучшения empty states.',
      ],
      ro: [
        'Produs end-to-end — landing, autentificare SMS, onboarding (adresă, ID, selfie), catalog, coș și checkout, tracking comandă, flux take-order curier, chat in-app, notificări push și setări cont.',
        'Plăți — arhitectură multi-provider cu card și cash, webhooks/callbacks, legare card payout curier și status plată; Stripe pentru plăți internaționale.',
        'Hărți și geo — selector zonă livrare, editor adresă, hărți comandă cu tile-uri region-aware, geocoding și detectare valută/țară vizitator.',
        'Backend API — REST API NestJS cu JWT auth, MongoDB, order batching, plăți curier, coș, catalog regional, MinIO pentru upload-uri.',
        'Localizare — UI în 3 limbi și informații legal/compliance pe landing page.',
        'Deploy production — Docker Compose pe VPS, domeniu custom cu HTTPS, env/secrets, scripturi deploy și integrare SMS.',
        'Fiabilitate & UX — race conditions la plată, edge cases acquiring API, CRUD adrese livrare și îmbunătățiri empty states.',
      ],
    },
    stack: {
      en: 'Next.js 15, React, TypeScript, Tailwind CSS, NestJS 11, MongoDB, Docker, Leaflet, payment gateway REST APIs, Stripe Connect, WebSockets, Linux VPS',
      ru: 'Next.js 15, React, TypeScript, Tailwind CSS, NestJS 11, MongoDB, Docker, Leaflet, payment gateway REST APIs, Stripe Connect, WebSockets, Linux VPS',
      ro: 'Next.js 15, React, TypeScript, Tailwind CSS, NestJS 11, MongoDB, Docker, Leaflet, payment gateway REST APIs, Stripe Connect, WebSockets, Linux VPS',
    },
  },
  {
    id: 'debate-zone',
    period: {
      en: '2023 — Present',
      ru: '2023 — н.в.',
      ro: '2023 — Prezent',
    },
    role: {
      en: 'Founder / Full-Stack Developer',
      ru: 'Основатель / Full-Stack разработчик',
      ro: 'Fondator / Dezvoltator Full-Stack',
    },
    company: 'Debate Zone',
    description: {
      en: 'Native iOS/Android apps, Dockerized Node.js backend with mediasoup, AI/NLP pipeline, and Next.js marketing site with admin dashboard.',
      ru: 'Нативные iOS/Android приложения, Dockerized Node.js backend с mediasoup, AI/NLP pipeline и Next.js маркетинговый сайт с админкой.',
      ro: 'Aplicații native iOS/Android, backend Node.js containerizat cu mediasoup, pipeline AI/NLP și site marketing Next.js cu dashboard admin.',
    },
    summary: {
      en: 'Debate Room — cross-platform live debate platform (iOS, Android, web) for hosting and joining audio/video debates.',
      ru: 'Debate Room — кроссплатформенная платформа для live-дебатов (iOS, Android, web) с аудио/видео в реальном времени.',
      ro: 'Debate Room — platformă cross-platform pentru dezbateri live (iOS, Android, web) cu audio/video în timp real.',
    },
    highlights: {
      en: [
        'Built native iOS (SwiftUI + WebRTC) and Android (Jetpack Compose) apps with phone SMS and Google Sign-In, profile management, political preference mapping, push notifications, and in-app legal views.',
        'Architected a Dockerized Node.js/TypeScript backend with separate services: REST API, Socket.IO + mediasoup realtime signaling, recording worker, and AI worker — backed by MongoDB, Redis, MinIO, and an nginx gateway.',
        'Implemented real-time debate mechanics: parliamentary timed turns/rounds, speaking-order enforcement, live moderation, blind debate mode, async chat, polls, on-site debates with map/location, invites/notifications, teams, and organizations.',
        'Built a server-side recording pipeline: mediasoup track capture, FFmpeg merge/finalize, retryable jobs, per-participant and room-combined outputs uploaded to object storage.',
        'Added an AI/NLP pipeline: Whisper transcription, transcript summaries, highlight extraction, Ollama topic generation, AI room moderator, and political-preference scoring from debate content.',
        'Shipped a Next.js marketing site with localization, admin dashboard, OpenAPI/Swagger docs, centralized logging with correlation IDs, Prometheus metrics, and backup/restore tooling.',
      ],
      ru: [
        'Нативные iOS (SwiftUI + WebRTC) и Android (Jetpack Compose) приложения с SMS и Google Sign-In, профилем, political preference mapping, push-уведомлениями и legal views.',
        'Dockerized Node.js/TypeScript backend: REST API, Socket.IO + mediasoup signaling, recording worker, AI worker — MongoDB, Redis, MinIO, nginx gateway.',
        'Realtime-механики дебатов: таймеры/раунды, порядок выступлений, модерация, blind mode, async chat, опросы, on-site debates, invites, teams и organizations.',
        'Серверная запись: mediasoup track capture, FFmpeg merge/finalize, retryable jobs, outputs per-participant и room-combined в object storage.',
        'AI/NLP pipeline: Whisper-транскрипция, summaries, highlight extraction, Ollama topic generation, AI moderator и political-preference scoring.',
        'Next.js marketing site с локализацией, admin dashboard, OpenAPI/Swagger, centralized logging, Prometheus metrics и backup/restore tooling.',
      ],
      ro: [
        'Aplicații native iOS (SwiftUI + WebRTC) și Android (Jetpack Compose) cu SMS și Google Sign-In, profil, political preference mapping, notificări push și legal views.',
        'Backend Node.js/TypeScript containerizat: REST API, semnalizare Socket.IO + mediasoup, worker înregistrare, worker AI — MongoDB, Redis, MinIO, gateway nginx.',
        'Mecanici realtime: runde cronometrate, ordine vorbire, moderare, blind mode, chat async, sondaje, dezbateri on-site, invites, teams și organizations.',
        'Pipeline înregistrare server-side: captură track mediasoup, FFmpeg merge/finalize, job-uri retryable, output per participant și combinat în object storage.',
        'Pipeline AI/NLP: transcriere Whisper, rezumate, highlight extraction, generare topicuri Ollama, moderator AI și political-preference scoring.',
        'Site marketing Next.js cu localizare, dashboard admin, OpenAPI/Swagger, logging centralizat, metrici Prometheus și tooling backup/restore.',
      ],
    },
    stack: {
      en: 'TypeScript, Swift, Kotlin, Express, Socket.IO, mediasoup, FFmpeg, Whisper, Ollama, Docker, Twilio, Google OAuth, FCM',
      ru: 'TypeScript, Swift, Kotlin, Express, Socket.IO, mediasoup, FFmpeg, Whisper, Ollama, Docker, Twilio, Google OAuth, FCM',
      ro: 'TypeScript, Swift, Kotlin, Express, Socket.IO, mediasoup, FFmpeg, Whisper, Ollama, Docker, Twilio, Google OAuth, FCM',
    },
  },
  {
    id: 'feelit',
    period: {
      en: '2022 — 2023',
      ru: '2022 — 2023',
      ro: '2022 — 2023',
    },
    role: {
      en: 'Back End Developer',
      ru: 'Back End разработчик',
      ro: 'Dezvoltator Back End',
    },
    company: 'FeelIT',
    companyUrl: 'https://feel-it-services.com/',
    description: {
      en: 'Node.js/Express backend with OpenAI integrations for transcription and emotional detection; React frontend features.',
      ru: 'Node.js/Express backend с OpenAI: транскрипция и emotional detection; фичи на React frontend.',
      ro: 'Backend Node.js/Express cu OpenAI pentru transcriere și detectare emoțională; funcționalități React frontend.',
    },
    summary: {
      en: 'Back-end development on an emotional-intelligence platform — Node.js and Express.js services with AI integrations for speech transcription and emotional analysis, plus React frontend work.',
      ru: 'Back-end разработка на платформе emotional intelligence — сервисы на Node.js и Express.js с AI-интеграциями для транскрипции речи и emotional analysis, плюс работа с React frontend.',
      ro: 'Dezvoltare back-end pe o platformă de inteligență emoțională — servicii Node.js și Express.js cu integrări AI pentru transcriere vocală și analiză emoțională, plus lucru pe frontend React.',
    },
    highlights: {
      en: [
        'Built and maintained Node.js / Express.js REST APIs for core product features.',
        'Integrated OpenAI and related AI services for speech transcription and emotional detection on the backend.',
        'Worked with React on frontend features and API integration.',
        'Maintained legacy code, fixed bugs, performed code reviews, and participated in task planning and estimation.',
      ],
      ru: [
        'Разработка и поддержка REST API на Node.js / Express.js для ключевых фич продукта.',
        'Интеграция OpenAI и других AI-сервисов: транскрипция речи и emotional detection на backend.',
        'Работа с React: frontend-фичи и интеграция с API.',
        'Поддержка legacy-кода, исправление багов, code review, планирование и оценка задач.',
      ],
      ro: [
        'Construire și mentenanță REST API Node.js / Express.js pentru funcționalități cheie ale produsului.',
        'Integrare OpenAI și servicii AI conexe: transcriere vocală și detectare emoțională pe backend.',
        'Lucru cu React: funcționalități frontend și integrare API.',
        'Mentenanță cod legacy, bug fixing, code review, planificare și estimare task-uri.',
      ],
    },
    stack: {
      en: 'Node.js, Express.js, OpenAI, speech transcription, emotional detection, React, REST APIs',
      ru: 'Node.js, Express.js, OpenAI, speech transcription, emotional detection, React, REST APIs',
      ro: 'Node.js, Express.js, OpenAI, transcriere vocală, detectare emoțională, React, REST APIs',
    },
  },
  {
    id: 'amdaris',
    period: {
      en: '2021 — 2022',
      ru: '2021 — 2022',
      ro: '2021 — 2022',
    },
    role: {
      en: 'Back End Developer',
      ru: 'Back End разработчик',
      ro: 'Dezvoltator Back End',
    },
    company: 'Amdaris',
    companyUrl: 'https://amdaris.com/',
    description: {
      en: 'Microservices with Java/Spring Boot and Node.js — REST & GraphQL APIs, Kafka, SQL and MongoDB; Azure deployment on an internal project.',
      ru: 'Микросервисы на Java/Spring Boot и Node.js — REST и GraphQL API, Kafka, SQL и MongoDB; деплой на Azure во внутреннем проекте.',
      ro: 'Microservicii Java/Spring Boot și Node.js — API REST și GraphQL, Kafka, SQL și MongoDB; deploy Azure într-un proiect intern.',
    },
    summary: {
      en: 'Back-end development in a microservices environment — Java/Spring Boot and Node.js services with REST and GraphQL APIs, Kafka event streaming, SQL and MongoDB data stores, plus Azure deployment on an internal project.',
      ru: 'Back-end разработка в микросервисной архитектуре — сервисы на Java/Spring Boot и Node.js с REST и GraphQL API, Kafka, SQL и MongoDB, плюс деплой на Azure во внутреннем проекте.',
      ro: 'Dezvoltare back-end într-o arhitectură microservicii — servicii Java/Spring Boot și Node.js cu API REST și GraphQL, Kafka, SQL și MongoDB, plus deploy Azure într-un proiect intern.',
    },
    highlights: {
      en: [
        'Built and maintained microservices with Java, Spring Boot, and Node.js.',
        'Designed and implemented REST and GraphQL APIs for internal product features.',
        'Integrated Kafka for asynchronous messaging and event-driven communication between services.',
        'Worked with SQL and MongoDB across service boundaries in a microservices architecture.',
        'Feature development, legacy maintenance, code reviews, task estimation, and Azure deployment.',
      ],
      ru: [
        'Разработка и поддержка микросервисов на Java, Spring Boot и Node.js.',
        'Проектирование и реализация REST и GraphQL API для внутренних фич продукта.',
        'Интеграция Kafka для асинхронного обмена сообщениями и event-driven коммуникации между сервисами.',
        'Работа с SQL и MongoDB в микросервисной архитектуре.',
        'Разработка фич, поддержка legacy, code review, оценка задач и деплой на Azure.',
      ],
      ro: [
        'Construire și mentenanță microservicii cu Java, Spring Boot și Node.js.',
        'Proiectare și implementare API REST și GraphQL pentru funcționalități interne.',
        'Integrare Kafka pentru mesagerie asincronă și comunicare event-driven între servicii.',
        'Lucru cu SQL și MongoDB într-o arhitectură microservicii.',
        'Dezvoltare funcționalități, mentenanță legacy, code review, estimare task-uri și deploy Azure.',
      ],
    },
    stack: {
      en: 'Java, Spring Boot, Node.js, Kafka, GraphQL, REST API, microservices, SQL, MongoDB, Azure',
      ru: 'Java, Spring Boot, Node.js, Kafka, GraphQL, REST API, microservices, SQL, MongoDB, Azure',
      ro: 'Java, Spring Boot, Node.js, Kafka, GraphQL, REST API, microservicii, SQL, MongoDB, Azure',
    },
  },
  {
    id: 'crossinx',
    period: {
      en: '2018 — 2021',
      ru: '2018 — 2021',
      ro: '2018 — 2021',
    },
    role: {
      en: 'Back End & Android Developer',
      ru: 'Back End & Android разработчик',
      ro: 'Dezvoltator Back End & Android',
    },
    company: 'Crossinx GmbH',
    companyUrl: 'https://crossinx.com/',
    description: {
      en: 'Java/Spring Boot microservices on the backend; Android app with OpenCV document detection and Kotlin multiplatform library.',
      ru: 'Java/Spring Boot микросервисы на backend; Android-приложение с OpenCV document detection и Kotlin multiplatform библиотекой.',
      ro: 'Microservicii Java/Spring Boot pe backend; aplicație Android cu detectare documente OpenCV și bibliotecă Kotlin multiplatform.',
    },
    summary: {
      en: 'Back-end and Android development for a business web platform — Java/Spring Boot microservices on the server side and an Android client with OpenCV-based document detection, plus a Kotlin multiplatform library shared with iOS.',
      ru: 'Back-end и Android-разработка для business web-платформы — Java/Spring Boot микросервисы на сервере и Android-клиент с OpenCV document detection, плюс Kotlin multiplatform библиотека для iOS.',
      ro: 'Dezvoltare back-end și Android pentru o platformă web business — microservicii Java/Spring Boot pe server și client Android cu detectare documente OpenCV, plus bibliotecă Kotlin multiplatform pentru iOS.',
    },
    highlights: {
      en: [
        'Developed and maintained server-side business logic with Java, Hibernate ORM, and Oracle database.',
        'Refactored a monolithic backend into a microservices architecture with Java and Spring Boot.',
        'Built Android features in Java, including OpenCV-based document detection and scanning flows.',
        'Created a Kotlin multiplatform library to share core logic between Android and iOS.',
      ],
      ru: [
        'Разработка и поддержка серверной бизнес-логики на Java, Hibernate ORM и Oracle DB.',
        'Рефакторинг монолита в микросервисную архитектуру на Java и Spring Boot.',
        'Android-фичи на Java, включая OpenCV document detection и scanning flows.',
        'Kotlin multiplatform библиотека для переиспользования логики между Android и iOS.',
      ],
      ro: [
        'Dezvoltare și mentenanță logică business server-side cu Java, Hibernate ORM și Oracle DB.',
        'Refactorizarea unui backend monolitic în arhitectură microservicii cu Java și Spring Boot.',
        'Funcționalități Android în Java, inclusiv detectare documente OpenCV și fluxuri de scanare.',
        'Bibliotecă Kotlin multiplatform pentru partajarea logicii între Android și iOS.',
      ],
    },
    stack: {
      en: 'Java, Kotlin, Spring Boot, Android, OpenCV, Hibernate, Oracle',
      ru: 'Java, Kotlin, Spring Boot, Android, OpenCV, Hibernate, Oracle',
      ro: 'Java, Kotlin, Spring Boot, Android, OpenCV, Hibernate, Oracle',
    },
  },
];

export const experienceIds = experienceItems.map((item) => item.id);
