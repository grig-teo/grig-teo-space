import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AppModule } from './app.module';

/**
 * Maps body-parser failures (a SyntaxError with `type: entity.parse.failed`)
 * to a generic 400. The default error message echoes bytes from the request
 * body, which reflects potentially sensitive input back to the caller.
 */
@Catch(SyntaxError)
class MalformedJsonFilter implements ExceptionFilter {
  catch(exception: SyntaxError, host: ArgumentsHost) {
    const parseError = exception as SyntaxError & { type?: string };
    if (parseError.type !== 'entity.parse.failed') {
      throw exception;
    }
    const res = host.switchToHttp().getResponse<Response>();
    res
      .status(400)
      .json({ statusCode: 400, message: 'Malformed JSON body', error: 'Bad Request' });
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Don't disclose the framework version banner (nginx also strips it).
  app.disable('x-powered-by');
  app.useGlobalFilters(new MalformedJsonFilter());
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
