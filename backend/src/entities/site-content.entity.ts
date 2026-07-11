import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type ContentKey =
  | 'profile'
  | 'projects'
  | 'experience'
  | 'blog'
  | 'health_public';

@Entity('site_content')
export class SiteContent {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  key!: ContentKey;

  @Column({ type: 'jsonb' })
  data!: unknown;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
