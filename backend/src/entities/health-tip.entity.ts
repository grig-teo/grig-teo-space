import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Persisted GLM health tip. Each hourly generation (and each on-demand call)
 * stores one row so the iOS Tip page can show history. Duplicate-consecutive
 * tips are skipped at write time (see HealthService.saveTipIfNew).
 */
@Entity('health_tip')
@Index('idx_health_tip_generated', ['generatedAt'])
export class HealthTip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  /** When GLM generated the tip (not when the row was inserted). */
  @Column({ name: 'generated_at', type: 'timestamptz' })
  generatedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
