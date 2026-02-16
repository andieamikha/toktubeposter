import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BatchStatus } from '../../common/constants';
import { User } from '../../users/entities/user.entity';

@Entity('bulk_batches')
export class BulkBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, name: 'target_date' })
  targetDate: string;

  @Column({ type: 'integer', default: 1, name: 'frequency_min' })
  frequencyMin: number;

  @Column({ type: 'integer', default: 3, name: 'frequency_max' })
  frequencyMax: number;

  @Column({ type: 'int', default: 0, name: 'total_scheduled' })
  totalScheduled: number;

  @Column({ type: 'simple-json', nullable: true, name: 'accounts_with_insufficient_content' })
  accountsWithInsufficientContent: any[] | null;

  @Column({ type: 'simple-json', nullable: true, name: 'preview_data' })
  previewData: any[] | null;

  @Column({ type: 'varchar', length: 20, default: BatchStatus.PREVIEW })
  status: BatchStatus;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, name: 'published_at' })
  publishedAt: Date | null;
}
