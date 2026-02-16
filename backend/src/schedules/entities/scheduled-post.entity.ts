import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { PostStatus, UploadStatus } from '../../common/constants';
import { Content } from '../../contents/entities/content.entity';
import { TiktokAccount } from '../../tiktok-accounts/entities/tiktok-account.entity';
import { User } from '../../users/entities/user.entity';

@Entity('scheduled_posts')
@Index('idx_sp_account_scheduled', ['tiktokAccountId', 'scheduledAt'])
@Index('idx_sp_operator_date', ['assignedOperatorId', 'scheduledAt'])
@Index('idx_sp_status_scheduled', ['status', 'scheduledAt'])
export class ScheduledPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'content_id' })
  contentId: string;

  @OneToOne(() => Content, (content) => content.scheduledPost)
  @JoinColumn({ name: 'content_id' })
  content: Content;

  @Column({ type: 'uuid', name: 'tiktok_account_id' })
  tiktokAccountId: string;

  @ManyToOne(() => TiktokAccount, (account) => account.scheduledPosts)
  @JoinColumn({ name: 'tiktok_account_id' })
  tiktokAccount: TiktokAccount;

  @Column({ type: 'uuid', name: 'assigned_operator_id' })
  assignedOperatorId: string;

  @ManyToOne(() => User, (user) => user.assignedPosts)
  @JoinColumn({ name: 'assigned_operator_id' })
  assignedOperator: User;

  @Column({ type: 'datetime', name: 'scheduled_at' })
  scheduledAt: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: PostStatus.SCHEDULED,
  })
  status: PostStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'tiktok_url' })
  tiktokUrl: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'posted_at' })
  postedAt: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'batch_id' })
  batchId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // === Direct Upload Fields ===
  @Column({ type: 'varchar', length: 20, default: UploadStatus.IDLE, name: 'upload_status' })
  uploadStatus: UploadStatus;

  @Column({ type: 'text', nullable: true, name: 'upload_error' })
  uploadError: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'tiktok_publish_id' })
  tiktokPublishId: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
