import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type MediaKind = 'photo' | 'video';

/**
 * A backed-up photo or video from the iOS device's photo library.
 *
 * Stored privately in MinIO (no public-read policy) — the binary is served
 * only through the device-key-guarded `GET /api/media/:id/file` proxy, so the
 * `storageKey` is never exposed to clients and never resolves to a public URL.
 */
@Entity('media_item')
@Index('idx_media_item_local_id', ['assetLocalId'], { unique: true })
@Index('idx_media_item_recorded', ['recordedAt'])
export class MediaItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stable `PHAsset.localIdentifier` from the device — used to dedup uploads. */
  @Column({ name: 'asset_local_id', type: 'varchar', length: 128 })
  assetLocalId!: string;

  @Column({ type: 'varchar', length: 8 })
  kind!: MediaKind;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  filename!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType!: string;

  @Column({ name: 'byte_size', type: 'bigint' })
  byteSize!: number;

  @Column({ type: 'int' })
  width!: number;

  @Column({ type: 'int' })
  height!: number;

  /** Video duration in milliseconds (null for photos). */
  @Column({ name: 'duration_ms', type: 'bigint', nullable: true })
  durationMs!: number | null;

  /** MinIO object key in the private bucket. Never exposed to clients. */
  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey!: string;

  @Column({ name: 'recorded_at', type: 'timestamptz', nullable: true })
  recordedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
