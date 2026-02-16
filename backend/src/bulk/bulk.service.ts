import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, Between } from 'typeorm';
import { BulkBatch } from './entities/bulk-batch.entity';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { Content } from '../contents/entities/content.entity';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';
import {
  BatchStatus, PostStatus, ContentStatus,
  MIN_POST_GAP_HOURS, POSTING_WINDOW,
} from '../common/constants';

interface PreviewItem {
  content_id: string;
  tiktok_account_id: string;
  assigned_operator_id: string;
  scheduled_at: string;
  brief_topic: string;
  username: string;
  operator_name: string;
}

@Injectable()
export class BulkService {
  private readonly logger = new Logger(BulkService.name);

  constructor(
    @InjectRepository(BulkBatch)
    private batchRepo: Repository<BulkBatch>,
    @InjectRepository(ScheduledPost)
    private schedulesRepo: Repository<ScheduledPost>,
    @InjectRepository(Content)
    private contentsRepo: Repository<Content>,
    @InjectRepository(TiktokAccount)
    private accountsRepo: Repository<TiktokAccount>,
  ) {}

  async preview(data: {
    target_date: string;
    frequency_min: number;
    frequency_max: number;
    account_ids?: string[];
  }, userId: string) {
    const { target_date, frequency_min, frequency_max, account_ids } = data;

    // Get active accounts
    const where: any = { isActive: true };
    if (account_ids && account_ids.length > 0) {
      where.id = In(account_ids);
    }
    const accounts = await this.accountsRepo.find({
      where,
      relations: ['defaultOperator'],
      order: { username: 'ASC' },
    });

    const preview: PreviewItem[] = [];
    const insufficient: any[] = [];

    const startUtc = new Date(`${target_date}T00:00:00+07:00`);
    const endUtc = new Date(`${target_date}T23:59:59+07:00`);

    for (const account of accounts) {
      if (!account.defaultOperatorId) {
        insufficient.push({
          account_id: account.id,
          username: account.username,
          requested: 0,
          available: 0,
          scheduled: 0,
          reason: 'Tidak ada operator default.',
        });
        continue;
      }

      // Existing schedules for this account on target date
      const existing = await this.schedulesRepo.find({
        where: {
          tiktokAccountId: account.id,
          scheduledAt: Between(startUtc, endUtc),
          status: Not(PostStatus.CANCELED),
        },
        order: { scheduledAt: 'ASC' },
      });

      const existingTimes = existing.map(e => e.scheduledAt);
      const targetCount = this.randomInt(frequency_min, frequency_max);
      let remainingSlots = Math.max(0, targetCount - existing.length);

      if (remainingSlots === 0) continue;

      // Get ready content for this account
      const readyContents = await this.contentsRepo.find({
        where: {
          tiktokAccountId: account.id,
          status: ContentStatus.READY,
        },
        order: { createdAt: 'ASC' },
        take: remainingSlots,
      });

      if (readyContents.length < remainingSlots) {
        if (readyContents.length === 0 && remainingSlots > 0) {
          insufficient.push({
            account_id: account.id,
            username: account.username,
            requested: remainingSlots,
            available: 0,
            scheduled: 0,
          });
          continue;
        }
        insufficient.push({
          account_id: account.id,
          username: account.username,
          requested: remainingSlots,
          available: readyContents.length,
          scheduled: readyContents.length,
        });
        remainingSlots = readyContents.length;
      }

      // Generate time slots
      const slots = this.generateTimeSlots(target_date, remainingSlots, existingTimes);

      for (let i = 0; i < Math.min(slots.length, readyContents.length); i++) {
        preview.push({
          content_id: readyContents[i].id,
          tiktok_account_id: account.id,
          assigned_operator_id: account.defaultOperatorId,
          scheduled_at: slots[i].toISOString(),
          brief_topic: readyContents[i].briefTopic,
          username: account.username,
          operator_name: account.defaultOperator?.fullName || 'Unknown',
        });
      }
    }

    // Save batch
    const batch = this.batchRepo.create({
      targetDate: target_date,
      frequencyMin: frequency_min,
      frequencyMax: frequency_max,
      totalScheduled: preview.length,
      accountsWithInsufficientContent: insufficient.length > 0 ? insufficient : null,
      previewData: preview,
      status: BatchStatus.PREVIEW,
      createdBy: userId,
    });
    const saved = await this.batchRepo.save(batch);

    return {
      batch_id: saved.id,
      target_date,
      summary: {
        total_accounts: accounts.length,
        total_schedules: preview.length,
        accounts_with_insufficient_content: insufficient.length,
      },
      insufficient_content: insufficient,
      preview: this.groupPreviewByAccount(preview),
    };
  }

  async publish(batchId: string, userId: string) {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch tidak ditemukan.');
    if (batch.status !== BatchStatus.PREVIEW) {
      throw new BadRequestException('Batch sudah dipublish atau dibatalkan.');
    }

    const previewItems: PreviewItem[] = batch.previewData || [];

    // Create all scheduled posts
    const posts: Partial<ScheduledPost>[] = previewItems.map(item => ({
      contentId: item.content_id,
      tiktokAccountId: item.tiktok_account_id,
      assignedOperatorId: item.assigned_operator_id,
      scheduledAt: new Date(item.scheduled_at),
      batchId: batchId,
      createdBy: userId,
      status: PostStatus.SCHEDULED,
    }));

    await this.schedulesRepo.save(posts);

    // Mark contents as used
    const contentIds = previewItems.map(i => i.content_id);
    if (contentIds.length > 0) {
      await this.contentsRepo
        .createQueryBuilder()
        .update()
        .set({
          status: ContentStatus.USED,
          usedCount: () => 'used_count + 1',
        })
        .whereInIds(contentIds)
        .execute();
    }

    // Update batch
    batch.status = BatchStatus.PUBLISHED;
    batch.publishedAt = new Date();
    await this.batchRepo.save(batch);

    return {
      batch_id: batchId,
      status: 'published',
      total_created: previewItems.length,
      published_at: batch.publishedAt,
    };
  }

  async cancelBatch(batchId: string) {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch tidak ditemukan.');
    if (batch.status !== BatchStatus.PREVIEW) {
      throw new BadRequestException('Hanya batch preview yang bisa dibatalkan.');
    }
    batch.status = BatchStatus.CANCELED;
    await this.batchRepo.save(batch);
    return { message: 'Batch berhasil dibatalkan.' };
  }

  private generateTimeSlots(
    targetDate: string,
    count: number,
    existingTimes: Date[],
  ): Date[] {
    // Window: 08:00 - 22:00 WIB = 01:00 - 15:00 UTC
    const windowStart = new Date(`${targetDate}T01:00:00Z`); // 08:00 WIB
    const windowEnd = new Date(`${targetDate}T15:00:00Z`);   // 22:00 WIB
    const minGapMs = MIN_POST_GAP_HOURS * 60 * 60 * 1000;
    const totalMs = windowEnd.getTime() - windowStart.getTime();

    const allTimes = [...existingTimes.map(t => t.getTime())];
    const result: number[] = [];
    let attempts = 0;
    const maxAttempts = count * 200;

    while (result.length < count && attempts < maxAttempts) {
      const randomMs = Math.floor(Math.random() * totalMs);
      const candidate = windowStart.getTime() + randomMs;

      const valid = [...allTimes, ...result].every(
        t => Math.abs(candidate - t) >= minGapMs,
      );

      if (valid) {
        result.push(candidate);
      }
      attempts++;
    }

    // Fallback: distribute evenly if random fails
    if (result.length < count) {
      const remaining = count - result.length;
      const allOccupied = [...allTimes, ...result].sort((a, b) => a - b);
      const gaps: { start: number; end: number; size: number }[] = [];

      // Compute gaps
      const boundaries = [windowStart.getTime(), ...allOccupied, windowEnd.getTime()].sort((a, b) => a - b);
      for (let i = 0; i < boundaries.length - 1; i++) {
        const gapSize = boundaries[i + 1] - boundaries[i];
        if (gapSize >= minGapMs * 2) {
          gaps.push({ start: boundaries[i], end: boundaries[i + 1], size: gapSize });
        }
      }

      gaps.sort((a, b) => b.size - a.size);

      for (const gap of gaps) {
        if (result.length >= count) break;
        const mid = gap.start + Math.floor(gap.size / 2);
        const validMid = [...allTimes, ...result].every(
          t => Math.abs(mid - t) >= minGapMs,
        );
        if (validMid) {
          result.push(mid);
        }
      }
    }

    return result
      .sort((a, b) => a - b)
      .map(t => new Date(t));
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private groupPreviewByAccount(preview: PreviewItem[]) {
    const grouped = new Map<string, { username: string; operator: string; schedules: any[] }>();

    for (const item of preview) {
      if (!grouped.has(item.tiktok_account_id)) {
        grouped.set(item.tiktok_account_id, {
          username: item.username,
          operator: item.operator_name,
          schedules: [],
        });
      }
      const scheduledWib = new Date(item.scheduled_at);
      const wibHours = (scheduledWib.getUTCHours() + 7) % 24;
      const wibMins = scheduledWib.getUTCMinutes();

      grouped.get(item.tiktok_account_id)!.schedules.push({
        content_id: item.content_id,
        brief_topic: item.brief_topic,
        scheduled_at: item.scheduled_at,
        scheduled_at_wib: `${String(wibHours).padStart(2, '0')}:${String(wibMins).padStart(2, '0')}`,
      });
    }

    return Array.from(grouped.entries()).map(([accountId, data]) => ({
      tiktok_account_id: accountId,
      ...data,
    }));
  }
}
