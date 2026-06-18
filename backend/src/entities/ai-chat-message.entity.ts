import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AiChatRole = 'user' | 'assistant';

@Entity('ai_chat_messages')
@Index('idx_ai_chat_messages_session_created', ['sessionId', 'createdAt'])
export class AiChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'varchar', length: 64 })
  sessionId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: AiChatRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 8 })
  locale!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
