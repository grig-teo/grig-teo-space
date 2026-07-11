import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type HealthNoteSource = 'telegram' | 'manual' | 'demo';

export const HEALTH_NOTE_SOURCES: readonly HealthNoteSource[] = [
  'telegram',
  'manual',
  'demo',
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

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
