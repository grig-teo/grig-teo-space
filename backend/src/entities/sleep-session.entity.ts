import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One night's sleep with the full stage breakdown, uploaded by the iOS app
 * straight from the ring's sleep frames. Replaces the derived
 * sleep_duration_h/sleep_quality readings as the rich source for the sleep
 * page; the plain readings stay for charts and the tip pipeline.
 */
@Entity('sleep_sessions')
export class SleepSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  endedAt!: Date;

  @Column({ type: 'int' })
  durationMin!: number;

  @Column({ type: 'int', default: 0 })
  deepMin!: number;

  @Column({ type: 'int', default: 0 })
  remMin!: number;

  @Column({ type: 'int', default: 0 })
  lightMin!: number;

  @Column({ type: 'int', default: 0 })
  awakeMin!: number;

  /** Composite 0–100 sleep score computed on the phone. */
  @Column({ type: 'double precision' })
  score!: number;

  @Column({ type: 'jsonb', nullable: true })
  raw!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
