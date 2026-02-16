import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NicheType } from '../../common/constants';
import { User } from '../../users/entities/user.entity';

@Entity('youtube_accounts')
export class YoutubeAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'channel_name' })
  channelName: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'channel_url' })
  channelUrl: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30 })
  niche: NicheType;

  @Column({ type: 'uuid', nullable: true, name: 'default_operator_id' })
  defaultOperatorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'default_operator_id' })
  defaultOperator: User | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  // === Browser Login Fields ===
  @Column({ type: 'varchar', length: 50, default: 'none', name: 'login_method' })
  loginMethod: 'none' | 'credentials' | 'cookies';

  @Column({ type: 'varchar', nullable: true, name: 'youtube_password' })
  youtubePassword: string | null;

  @Column({ type: 'text', nullable: true, name: 'youtube_cookies' })
  youtubeCookies: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_browser_logged_in' })
  isBrowserLoggedIn: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'last_browser_login_at' })
  lastBrowserLoginAt: Date | null;

  // === YouTube API OAuth Fields ===
  @Column({ type: 'boolean', default: false, name: 'is_api_connected' })
  isApiConnected: boolean;

  @Column({ type: 'text', nullable: true, name: 'youtube_access_token' })
  youtubeAccessToken: string | null;

  @Column({ type: 'text', nullable: true, name: 'youtube_refresh_token' })
  youtubeRefreshToken: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'youtube_token_expires_at' })
  youtubeTokenExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
