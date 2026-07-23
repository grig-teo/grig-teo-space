import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Trust the proxy chain (nginx → backend) so `req.ip` / `@Ip()` resolves to
  // the real client address from X-Forwarded-For / X-Real-IP instead of the
  // Docker bridge IP. Needed for per-IP rate limiting on the AI chat.
  app.set('trust proxy', 1);
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    // Credentials are only needed for the admin session cookie on cross-origin
    // dev calls (:3000 → :3001). In prod the dashboard is same-origin via
    // nginx, so don't emit Access-Control-Allow-Credentials there.
    credentials: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').includes('localhost'),
  });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
