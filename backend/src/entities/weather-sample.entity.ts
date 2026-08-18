import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One hourly weather snapshot fetched from Open-Meteo for the owner's last
 * known location (pushed by the iOS app). Kept separate from health readings
 * so environment data never leaks into health summaries or alerts.
 */
@Entity('weather_samples')
export class WeatherSample {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Start of the UTC hour this sample describes. */
  @Index({ unique: true })
  @Column({ type: 'timestamptz' })
  recordedAt!: Date;

  @Column({ type: 'double precision' })
  temperatureC!: number;

  @Column({ type: 'double precision', nullable: true })
  feelsLikeC!: number | null;

  @Column({ type: 'double precision', nullable: true })
  pressureHpa!: number | null;

  @Column({ type: 'double precision', nullable: true })
  humidityPct!: number | null;

  /** WMO weather interpretation code (0 = clear, 95 = thunderstorm, …). */
  @Column({ type: 'int', nullable: true })
  conditionCode!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  raw!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
