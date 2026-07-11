import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as Minio from 'minio';
import { extname } from 'path';

export type PrivateUploadResult = { key: string; size: number };

export type RangedStream = {
  stream: NodeJS.ReadableStream;
  statusCode: number;
  headers: Record<string, string>;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  /** Separate bucket for personal media (photos/videos) — NOT public-read. */
  private readonly privateBucket: string;
  private ready = false;
  private privateReady = false;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'minio';
    const [host, portFromHost] = endpoint.split(':');
    const port = Number(process.env.MINIO_PORT ?? portFromHost ?? '9000');

    this.bucket = process.env.MINIO_BUCKET ?? 'grig-teo-media';
    this.publicUrl = (process.env.MINIO_PUBLIC_URL ?? `http://localhost:${port}/${this.bucket}`).replace(
      /\/$/,
      '',
    );
    this.privateBucket = process.env.MINIO_PRIVATE_BUCKET ?? 'grig-teo-media-private';

    this.client = new Minio.Client({
      endPoint: host,
      port,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
      secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
    await this.ensurePrivateBucket();
  }

  async upload(file: Express.Multer.File, prefix = 'blog/'): Promise<string> {
    if (!this.ready) {
      await this.ensureBucket();
    }

    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const extension = extname(file.originalname).toLowerCase();
    const key = `${normalizedPrefix}${randomUUID()}${extension}`;

    await this.client.putObject(this.bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    return `${this.publicUrl}/${key}`;
  }

  /**
   * Removes an object previously created via `upload()`, identified by its
   * public URL. Silently does nothing if the URL doesn't belong to this
   * bucket or the object is already gone.
   */
  async removeByUrl(url: string): Promise<void> {
    if (!this.ready) {
      await this.ensureBucket();
    }
    const prefix = `${this.publicUrl}/`;
    if (!url.startsWith(prefix)) return;
    const key = url.slice(prefix.length);
    if (!key) return;
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (error) {
      this.logger.warn(
        `Failed to remove object "${key}": ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // --- Private (personal media) bucket -----------------------------------
  //
  // Media uploaded from the device photo library is stored in a separate
  // bucket WITHOUT a public-read policy, so objects are only reachable via
  // the device-key-guarded proxy in MediaController.

  /** Uploads to the private bucket. Returns the object key (never a URL). */
  async uploadPrivate(file: Express.Multer.File, prefix = 'media/'): Promise<PrivateUploadResult> {
    if (!this.privateReady) {
      await this.ensurePrivateBucket();
    }

    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const extension = extname(file.originalname).toLowerCase();
    const key = `${normalizedPrefix}${randomUUID()}${extension}`;

    await this.client.putObject(this.privateBucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    return { key, size: file.size };
  }

  /**
   * Opens a stream to a private object, honoring an HTTP `Range` header so
   * videos can seek. Accepts the raw `Range` header value (e.g.
   * `bytes=0-1023`, `bytes=0-`, `bytes=-500`) and resolves open-ended/suffix
   * forms against the object's real size. Returns the stream, the HTTP status
   * (206 partial or 200 full), and the response headers to set.
   */
  async getRangeStream(key: string, rangeHeader?: string): Promise<RangedStream> {
    if (!this.privateReady) {
      await this.ensurePrivateBucket();
    }

    let total: number;
    let contentType = 'application/octet-stream';
    try {
      const stat = await this.client.statObject(this.privateBucket, key);
      total = Number(stat.size);
      contentType = stat.metaData?.['content-type'] ?? contentType;
    } catch (error) {
      throw new Error(
        `Failed to stat private object "${key}": ${error instanceof Error ? error.message : error}`,
      );
    }

    const range = this.resolveRange(rangeHeader, total);

    if (!range) {
      const stream = await this.client.getObject(this.privateBucket, key);
      return {
        stream,
        statusCode: 200,
        headers: {
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
        },
      };
    }

    const { start, end } = range;
    const stream = await this.client.getPartialObject(
      this.privateBucket,
      key,
      start,
      end - start + 1,
    );
    return {
      stream,
      statusCode: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
      },
    };
  }

  /**
   * Parses an HTTP `Range` header against a known total size. Supports
   * `bytes=start-end`, `bytes=start-` (open-ended), and `bytes=-N` (suffix).
   * Returns null when the header is absent; throws on malformed input.
   */
  private resolveRange(
    header: string | undefined,
    total: number,
  ): { start: number; end: number } | null {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) {
      throw new Error('Invalid Range header');
    }
    const [, startStr, endStr] = match;
    let start: number;
    let end: number;
    if (!startStr) {
      // Suffix range: last N bytes.
      const n = Number(endStr);
      start = Math.max(0, total - n);
      end = total - 1;
    } else {
      start = Number(startStr);
      end = endStr ? Math.min(Number(endStr), total - 1) : total - 1;
    }
    if (start > end || start >= total) {
      throw new Error('Range not satisfiable');
    }
    return { start, end };
  }

  /** Best-effort removal of a private object by key. */
  async removeByKey(key: string): Promise<void> {
    if (!this.privateReady) {
      await this.ensurePrivateBucket();
    }
    try {
      await this.client.removeObject(this.privateBucket, key);
    } catch (error) {
      this.logger.warn(
        `Failed to remove private object "${key}": ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async ensureBucket(): Promise<void> {
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) {
          await this.client.makeBucket(this.bucket);
        }

        await this.client.setBucketPolicy(
          this.bucket,
          JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${this.bucket}/*`],
              },
            ],
          }),
        );

        this.ready = true;
        this.logger.log(`MinIO bucket "${this.bucket}" is ready`);
        return;
      } catch (error) {
        this.logger.warn(
          `MinIO not ready (attempt ${attempt}/${maxAttempts}): ${error instanceof Error ? error.message : error}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    this.logger.error('MinIO bucket initialization failed after retries');
  }

  /**
   * Creates the private media bucket if missing and intentionally does NOT
   * attach a public-read policy, so its objects stay reachable only through
   * authenticated backend endpoints.
   */
  private async ensurePrivateBucket(): Promise<void> {
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const exists = await this.client.bucketExists(this.privateBucket);
        if (!exists) {
          await this.client.makeBucket(this.privateBucket);
        }
        // Deliberately no setBucketPolicy — default is fully private.

        this.privateReady = true;
        this.logger.log(`MinIO private bucket "${this.privateBucket}" is ready`);
        return;
      } catch (error) {
        this.logger.warn(
          `MinIO private bucket not ready (attempt ${attempt}/${maxAttempts}): ${error instanceof Error ? error.message : error}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    this.logger.error('MinIO private bucket initialization failed after retries');
  }
}
