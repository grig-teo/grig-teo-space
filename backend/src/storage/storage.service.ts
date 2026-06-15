import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as Minio from 'minio';
import { extname } from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private ready = false;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'minio';
    const [host, portFromHost] = endpoint.split(':');
    const port = Number(process.env.MINIO_PORT ?? portFromHost ?? '9000');

    this.bucket = process.env.MINIO_BUCKET ?? 'grig-teo-media';
    this.publicUrl = (process.env.MINIO_PUBLIC_URL ?? `http://localhost:${port}/${this.bucket}`).replace(
      /\/$/,
      '',
    );

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
  }

  async upload(file: Express.Multer.File): Promise<string> {
    if (!this.ready) {
      await this.ensureBucket();
    }

    const extension = extname(file.originalname).toLowerCase();
    const key = `blog/${randomUUID()}${extension}`;

    await this.client.putObject(this.bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    return `${this.publicUrl}/${key}`;
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
}
