import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // The body parser is registered manually (below) instead of via Nest's
  // built-in one so JSON parse failures can be answered with a generic 400:
  // parser errors are thrown in middleware, which exception filters never
  // see, and the default handler echoes bytes from the request body.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // Don't disclose the framework version banner (nginx also strips it).
  app.disable('x-powered-by');
  // Capture the raw body while parsing — HMAC webhook verification
  // (/api/webhooks/lemniscate) needs the exact bytes, pre-parse.
  app.use(
    json({
      // Blog bodies are BlockNote JSON in three locales; a full content
      // save easily exceeds Express's 100 kB default.
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true }));
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if ((err as { type?: string })?.type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ statusCode: 400, message: 'Malformed JSON body', error: 'Bad Request' });
      return;
    }
    next(err);
  });
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
