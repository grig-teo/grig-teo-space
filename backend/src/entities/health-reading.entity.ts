import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type HealthMetric =
  | 'heart_rate'
  | 'spo2'
  | 'steps'
  | 'calories'
  | 'distance_km'
  | 'stress'
  | 'hrv'
  | 'sleep_duration_h'
  | 'sleep_quality'
  | 'body_temperature';

export type HealthSource = 'ring' | 'manual' | 'demo';

export const HEALTH_METRICS: readonly HealthMetric[] = [
  'heart_rate',
  'spo2',
  'steps',
  'calories',
  'distance_km',
  'stress',
  'hrv',
  'sleep_duration_h',
  'sleep_quality',
  'body_temperature',
] as const;

export const HEALTH_SOURCES: readonly HealthSource[] = [
  'ring',
  'manual',
  'demo',
] as const;

@Entity('health_reading')
// One row per (metric, timestamp): ring history re-syncs resend the same
// slots with updated values, and the latest value must win, not append.
@Index('idx_health_reading_metric_recorded', ['metric', 'recordedAt'], { unique: true })
export class HealthReading {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'metric', type: 'varchar', length: 24 })
  metric!: HealthMetric;

  @Column({ type: 'double precision' })
  value!: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  unit!: string | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @Column({ type: 'varchar', length: 16 })
  source!: HealthSource;

  @Column({ type: 'jsonb', nullable: true })
  raw!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
