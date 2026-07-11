import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HealthDocument } from './health-document.entity';

/**
 * A single page/sheet within a multi-page health document.
 * Each page has its own scanned image + OCR text (extracted on-device).
 */
@Entity('health_document_page')
@Index('idx_health_doc_page_document_order', ['documentId', 'pageNumber'])
export class HealthDocumentPage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => HealthDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: HealthDocument;

  /** 1-based page order. */
  @Column({ name: 'page_number', type: 'int' })
  pageNumber!: number;

  @Column({ name: 'ocr_text', type: 'text' })
  ocrText!: string;

  @Column({ name: 'image_url', type: 'varchar', length: 512 })
  imageUrl!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
