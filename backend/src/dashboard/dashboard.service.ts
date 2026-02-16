import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { PostStatus } from '../common/constants';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ScheduledPost)
    private schedulesRepo: Repository<ScheduledPost>,
  ) {}

  async getDaily(date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const startUtc = new Date(`${targetDate}T00:00:00+07:00`);
    const endUtc = new Date(`${targetDate}T23:59:59+07:00`);

    const posts = await this.schedulesRepo.find({
      where: { scheduledAt: Between(startUtc, endUtc) },
      relations: ['assignedOperator', 'tiktokAccount'],
    });

    const overall = this.computeStats(posts);

    // Group by operator
    const byOperatorMap = new Map<string, ScheduledPost[]>();
    posts.forEach((p) => {
      const key = p.assignedOperatorId;
      if (!byOperatorMap.has(key)) byOperatorMap.set(key, []);
      byOperatorMap.get(key)!.push(p);
    });

    const byOperator = Array.from(byOperatorMap.entries()).map(([opId, opPosts]) => ({
      operator_id: opId,
      operator_name: opPosts[0].assignedOperator?.fullName || 'Unknown',
      ...this.computeStats(opPosts),
    }));

    // Group by account
    const byAccountMap = new Map<string, ScheduledPost[]>();
    posts.forEach((p) => {
      const key = p.tiktokAccountId;
      if (!byAccountMap.has(key)) byAccountMap.set(key, []);
      byAccountMap.get(key)!.push(p);
    });

    const byAccount = Array.from(byAccountMap.entries()).map(([accId, accPosts]) => {
      const scheduledPosts = accPosts
        .filter(p => p.status === PostStatus.SCHEDULED || p.status === PostStatus.DUE)
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

      return {
        account_id: accId,
        username: accPosts[0].tiktokAccount?.username || 'Unknown',
        ...this.computeStats(accPosts),
        next_scheduled_at: scheduledPosts[0]?.scheduledAt || null,
      };
    });

    return {
      date: targetDate,
      overall,
      by_operator: byOperator,
      by_account: byAccount,
    };
  }

  private computeStats(posts: ScheduledPost[]) {
    const total = posts.length;
    const done = posts.filter(p => p.status === PostStatus.DONE).length;
    const scheduled = posts.filter(p => p.status === PostStatus.SCHEDULED).length;
    const due = posts.filter(p => p.status === PostStatus.DUE).length;
    const overdue = posts.filter(p => p.status === PostStatus.OVERDUE).length;
    const missed = posts.filter(p => p.status === PostStatus.MISSED).length;
    const canceled = posts.filter(p => p.status === PostStatus.CANCELED).length;

    return {
      total,
      scheduled,
      due,
      overdue,
      done,
      missed,
      canceled,
      completion_rate: total > 0 ? Math.round((done / total) * 10000) / 10000 : 0,
    };
  }
}
