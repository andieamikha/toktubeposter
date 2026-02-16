import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { NicheType } from '../../common/constants';
import { User } from '../../users/entities/user.entity';
import { Content } from '../../contents/entities/content.entity';
import { ScheduledPost } from '../../schedules/entities/scheduled-post.entity';

@Entity('tiktok_accounts')
export class TiktokAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'display_name' })
  displayName: string | null;

  @Column({ type: 'varchar', length: 30 })
  niche: NicheType;

  @Column({ type: 'uuid', nullable: true, name: 'default_operator_id' })
  defaultOperatorId: string | null;

  @ManyToOne(() => User, (user) => user.assignedAccounts, { nullable: true })
  @JoinColumn({ name: 'default_operator_id' })
  defaultOperator: User | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  // === TikTok OAuth Fields ===
  @Column({ type: 'varchar', nullable: true, name: 'tiktok_open_id' })
  tiktokOpenId: string | null;

  @Column({ type: 'text', nullable: true, name: 'tiktok_access_token' })
  tiktokAccessToken: string | null;

  @Column({ type: 'text', nullable: true, name: 'tiktok_refresh_token' })
  tiktokRefreshToken: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'tiktok_token_expires_at' })
  tiktokTokenExpiresAt: Date | null;

  @Column({ type: 'boolean', default: false, name: 'is_oauth_connected' })
  isOauthConnected: boolean;

  // === Browser Login Fields ===
  @Column({ type: 'varchar', length: 50, default: 'none', name: 'login_method' })
  loginMethod: 'none' | 'credentials' | 'cookies';

  @Column({ type: 'varchar', nullable: true, name: 'tiktok_password' })
  tiktokPassword: string | null;

  @Column({ type: 'text', nullable: true, name: 'tiktok_cookies' })
  tiktokCookies: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_browser_logged_in' })
  isBrowserLoggedIn: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'last_browser_login_at' })
  lastBrowserLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Content, (content) => content.tiktokAccount)
  contents: Content[];

  @OneToMany(() => ScheduledPost, (post) => post.tiktokAccount)
  scheduledPosts: ScheduledPost[];
}
