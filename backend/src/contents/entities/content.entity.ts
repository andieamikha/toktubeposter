import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { ContentStatus, NicheType } from '../../common/constants';
import { TiktokAccount } from '../../tiktok-accounts/entities/tiktok-account.entity';
import { User } from '../../users/entities/user.entity';
import { ScheduledPost } from '../../schedules/entities/scheduled-post.entity';

export interface AiOption {
  index: number;
  caption: string;
  hashtags: string[];
}

@Entity('contents')
export class Content {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tiktok_account_id' })
  tiktokAccountId: string;

  @ManyToOne(() => TiktokAccount, (account) => account.contents)
  @JoinColumn({ name: 'tiktok_account_id' })
  tiktokAccount: TiktokAccount;

  @Column({ type: 'varchar', length: 500, name: 'drive_url', nullable: true })
  driveUrl: string | null;

  @Column({ type: 'varchar', length: 300, name: 'brief_topic' })
  briefTopic: string;

  @Column({ type: 'simple-json', name: 'brief_points' })
  briefPoints: string[];

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'target_audience' })
  targetAudience: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tone: string | null;

  @Column({ type: 'varchar', length: 30, name: 'niche_template' })
  nicheTemplate: NicheType;

  @Column({ type: 'simple-json', nullable: true, name: 'ai_options' })
  aiOptions: AiOption[] | null;

  @Column({ type: 'smallint', nullable: true, name: 'selected_option_index' })
  selectedOptionIndex: number | null;

  @Column({ type: 'text', nullable: true, name: 'final_caption' })
  finalCaption: string | null;

  @Column({ type: 'simple-json', nullable: true, name: 'final_hashtags' })
  finalHashtags: string[] | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: ContentStatus.DRAFT,
  })
  status: ContentStatus;

  @Column({ type: 'int', default: 0, name: 'used_count' })
  usedCount: number;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, (user) => user.createdContents)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  // ─── Upload Queue Fields ───
  @Column({ type: 'varchar', length: 30, default: 'idle', name: 'upload_status' })
  uploadStatus: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'upload_platform' })
  uploadPlatform: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'upload_method' })
  uploadMethod: string | null;

  @Column({ type: 'text', nullable: true, name: 'upload_error' })
  uploadError: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'upload_account_id' })
  uploadAccountId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'upload_privacy' })
  uploadPrivacy: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'upload_started_at' })
  uploadStartedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'upload_completed_at' })
  uploadCompletedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'upload_result_url' })
  uploadResultUrl: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'upload_queued_at' })
  uploadQueuedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => ScheduledPost, (post) => post.content)
  scheduledPost: ScheduledPost;
}
