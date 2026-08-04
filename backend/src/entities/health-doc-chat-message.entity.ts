import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type HealthDocChatRole = 'user' | 'assistant';

/**
 * Chat messages for the records "AI doctor" assistant. Separate from the
 * public website's `ai_chat_messages` table — different context, model
 * (DeepSeek), and audience (the owner only).
 */
@Entity('health_doc_chat_message')
@Index('idx_health_doc_chat_session_created', ['sessionId', 'createdAt'])
export class HealthDocChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'varchar', length: 64 })
  sessionId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: HealthDocChatRole;

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
