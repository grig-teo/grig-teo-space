import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type HealthDocSource = 'app' | 'telegram' | 'manual';

@Entity('health_document')
@Index('idx_health_document_recorded', ['recordedAt'])
export class HealthDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  /** Text extracted on-device (Vision OCR) — the searchable content. */
  @Column({ name: 'ocr_text', type: 'text' })
  ocrText!: string;

  @Column({ name: 'image_url', type: 'varchar', length: 512 })
  imageUrl!: string;

  @Column({ name: 'thumb_url', type: 'varchar', length: 512, nullable: true })
  thumbUrl!: string | null;

  @Column({ name: 'page_count', type: 'int', default: 1 })
  pageCount!: number;

  /** Detected language of the OCR text (e.g. en, ru, ro). */
  @Column({ type: 'varchar', length: 8, nullable: true })
  language!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'app' })
  source!: HealthDocSource;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
