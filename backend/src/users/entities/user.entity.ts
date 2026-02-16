import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRole } from '../../common/constants';
import { TiktokAccount } from '../../tiktok-accounts/entities/tiktok-account.entity';
import { Content } from '../../contents/entities/content.entity';
import { ScheduledPost } from '../../schedules/entities/scheduled-post.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 100, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 20, default: UserRole.OPERATOR })
  role: UserRole;

  @Column({ type: 'varchar', length: 50, nullable: true, unique: true, name: 'telegram_chat_id' })
  telegramChatId: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true, name: 'telegram_link_code' })
  telegramLinkCode: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'telegram_code_expires_at' })
  telegramCodeExpiresAt: Date | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'last_login_at' })
  lastLoginAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'refresh_token_hash' })
  refreshTokenHash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => TiktokAccount, (account) => account.defaultOperator)
  assignedAccounts: TiktokAccount[];

  @OneToMany(() => Content, (content) => content.createdByUser)
  createdContents: Content[];

  @OneToMany(() => ScheduledPost, (post) => post.assignedOperator)
  assignedPosts: ScheduledPost[];
}
