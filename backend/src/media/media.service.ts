import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaItem, type MediaKind } from '../entities/media-item.entity';
import { RangedStream, StorageService } from '../storage/storage.service';

// --- DTOs ----------------------------------------------------------------

export type CreateMediaInput = {
  assetLocalId?: string;
  kind?: string;
  file?: Express.Multer.File;
  width?: string;
  height?: string;
  durationMs?: string;
  recordedAt?: string;
};

export type MediaListItem = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  durationMs: number | null;
  /** Relative URL to the device-key-guarded file proxy. */
  url: string;
  recordedAt: string | null;
  createdAt: string;
};

export type MediaListResult = {
  items: MediaListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_KINDS: MediaKind[] = ['photo', 'video'];

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaItem)
    private readonly repo: Repository<MediaItem>,
    private readonly storage: StorageService,
  ) {}

  // --- Upload ------------------------------------------------------------

  /**
   * Stores an uploaded photo/video in the private MinIO bucket. Idempotent on
   * `assetLocalId`: if the device already backed up this asset, the existing
   * record is returned without re-uploading.
   */
  async create(input: CreateMediaInput): Promise<MediaItem> {
    const assetLocalId = (input.assetLocalId ?? '').trim();
    if (!assetLocalId) {
      throw new BadRequestException('assetLocalId is required');
    }

    // Idempotency: dedup on the device-local asset id before touching storage.
    const existing = await this.repo.findOne({ where: { assetLocalId } });
    if (existing) {
      return existing;
    }

    const file = input.file;
    if (!file) {
      throw new BadRequestException('A file is required');
    }

    const kind = this.parseKind(input.kind);
    const { key, size } = await this.storage.uploadPrivate(file, 'media');

    const width = Number(input.width ?? 0) || 0;
    const height = Number(input.height ?? 0) || 0;
    const durationMs = input.durationMs ? Number(input.durationMs) || null : null;

    return this.repo.save({
      assetLocalId: assetLocalId.slice(0, 128),
      kind,
      filename: (file.originalname || `${assetLocalId}.${kind}`).slice(0, 255),
      mimeType: (file.mimetype || 'application/octet-stream').slice(0, 64),
      byteSize: size || file.size,
      width,
      height,
      durationMs,
      storageKey: key,
      recordedAt: this.parseDate(input.recordedAt),
    });
  }

  // --- Read --------------------------------------------------------------

  async findOne(id: string): Promise<MediaItem> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Media not found');
    }
    return item;
  }

  async list(params: {
    page?: number;
    pageSize?: number;
    kind?: string;
  }): Promise<MediaListResult> {
    const page = Math.max(1, Math.floor(Number(params.page ?? 1) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(params.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)),
    );

    const qb = this.repo
      .createQueryBuilder('m')
      .orderBy('m.recordedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('m.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const kind = this.parseKind(params.kind, /* required */ false);
    if (kind) {
      qb.andWhere('m.kind = :kind', { kind });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toListItem(row)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  /**
   * Opens a ranged stream to the private object for the proxy endpoint. The
   * raw HTTP `Range` header is forwarded; the storage layer resolves it
   * against the object's real size.
   */
  async openFile(id: string, rangeHeader?: string): Promise<RangedStream> {
    const item = await this.findOne(id);
    return this.storage.getRangeStream(item.storageKey, rangeHeader);
  }

  // --- Delete ------------------------------------------------------------

  async remove(id: string): Promise<{ id: string }> {
    const item = await this.findOne(id);
    await this.storage.removeByKey(item.storageKey);
    await this.repo.delete(id);
    return { id };
  }

  // --- Helpers -----------------------------------------------------------

  toListItem(row: MediaItem): MediaListItem {
    return {
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      mimeType: row.mimeType,
      byteSize: Number(row.byteSize),
      width: row.width,
      height: row.height,
      durationMs: row.durationMs === null ? null : Number(row.durationMs),
      url: `/api/media/${row.id}/file`,
      recordedAt: row.recordedAt ? row.recordedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseKind(value: string | undefined, required = true): MediaKind | undefined {
    if (!value) {
      if (required) {
        throw new BadRequestException('kind must be "photo" or "video"');
      }
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_KINDS.includes(normalized as MediaKind)) {
      throw new BadRequestException('kind must be "photo" or "video"');
    }
    return normalized as MediaKind;
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
