import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ContactStatus = 'new' | 'read' | 'archived';

/**
 * A project inquiry submitted through the public contact form.
 *
 * The visitor IP is never stored: only a salted SHA-256 hash, which is enough
 * to spot a repeat sender without holding personal data nobody asked us to
 * keep. The free-text fields are capped in the service, not here, so the
 * limits live in one place and can change without a schema change.
 */
@Entity('contact_message')
@Index('idx_contact_message_created', ['createdAt'])
export class ContactMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 200 })
  email!: string;

  /** Optional: many independent founders write from a personal address. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  company?: string;

  @Column({ type: 'text' })
  description!: string;

  /** Free text on purpose: "not sure yet" is a legitimate answer. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  budget?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  timeline?: string;

  /** Where it came from, e.g. "contact" or "home", so replies can be framed. */
  @Column({ type: 'varchar', length: 40, default: 'contact' })
  source!: string;

  /** Salted hash of the submitter IP. Never the raw address. */
  @Column({ name: 'ip_hash', type: 'varchar', length: 64 })
  ipHash!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent?: string;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status!: ContactStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
