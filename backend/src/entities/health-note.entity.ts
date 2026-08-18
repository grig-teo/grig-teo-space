import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type HealthNoteSource = 'telegram' | 'manual' | 'demo' | 'ios';

export const HEALTH_NOTE_SOURCES: readonly HealthNoteSource[] = [
  'telegram',
  'manual',
  'demo',
  'ios',
] as const;

@Entity('health_note')
@Index('idx_health_note_recorded', ['recordedAt'])
export class HealthNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  mood!: string | null;

  @Column({ type: 'varchar', length: 16 })
  source!: HealthNoteSource;

  /** Private-bucket object key of an attached photo/video, if any. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  mediaKey!: string | null;

  /** 'photo' | 'video' when mediaKey is set. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  mediaType!: string | null;

  /** Vision-model description of the attached photo ("a pepperoni pizza"),
   *  filled asynchronously after upload. Feeds the tip context. */
  @Column({ type: 'text', nullable: true })
  mediaNote!: string | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
