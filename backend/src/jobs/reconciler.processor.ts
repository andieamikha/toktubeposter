import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { PostStatus, NotificationType } from '../common/constants';
import { NotificationProcessor } from './notification.processor';

@Injectable()
export class ReconcilerProcessor {
  private readonly logger = new Logger(ReconcilerProcessor.name);

  constructor(
    @InjectRepository(ScheduledPost)
    private schedulesRepo: Repository<ScheduledPost>,
    @InjectRepository(Notification)
    private notifRepo: Repository<Notification>,
    private notificationProcessor: NotificationProcessor,
  ) {}

  async process(): Promise<void> {
    const now = new Date();
    this.logger.debug('Running status reconciler...');

    try {
      // 1. Check for reminders to send (30 min before)
      await this.enqueueReminders(now);

      // 2. scheduled → due
      const toDue = await this.schedulesRepo
        .createQueryBuilder('s')
        .where('s.status = :status', { status: PostStatus.SCHEDULED })
        .andWhere('s.scheduledAt <= :now', { now: now.toISOString() })
        .getMany();

      if (toDue.length > 0) {
        await this.schedulesRepo.update(
          { id: In(toDue.map(s => s.id)) },
          { status: PostStatus.DUE },
        );
        this.logger.log(`${toDue.length} posts transitioned: scheduled → due`);
      }

      // 3. due → overdue (30 min past scheduled)
      const overdueThreshold = new Date(now.getTime() - 30 * 60 * 1000);
      const toOverdue = await this.schedulesRepo
        .createQueryBuilder('s')
        .where('s.status = :status', { status: PostStatus.DUE })
        .andWhere('s.scheduledAt <= :threshold', { threshold: overdueThreshold.toISOString() })
        .getMany();

      if (toOverdue.length > 0) {
        await this.schedulesRepo.update(
          { id: In(toOverdue.map(s => s.id)) },
          { status: PostStatus.OVERDUE },
        );
        this.logger.log(`${toOverdue.length} posts transitioned: due → overdue`);

        // Send overdue alerts directly
        for (const post of toOverdue) {
          await this.sendNotification(post.id, NotificationType.OVERDUE);
        }
      }

      // 4. overdue → missed (2 hours past scheduled)
      const missedThreshold = new Date(now.getTime() - 120 * 60 * 1000);
      const toMissed = await this.schedulesRepo
        .createQueryBuilder('s')
        .where('s.status = :status', { status: PostStatus.OVERDUE })
        .andWhere('s.scheduledAt <= :threshold', { threshold: missedThreshold.toISOString() })
        .getMany();

      if (toMissed.length > 0) {
        await this.schedulesRepo.update(
          { id: In(toMissed.map(s => s.id)) },
          { status: PostStatus.MISSED },
        );
        this.logger.log(`${toMissed.length} posts transitioned: overdue → missed`);
      }
    } catch (error) {
      this.logger.error('Reconciler error', error);
    }
  }

  private async enqueueReminders(now: Date) {
    // Reminder 30 min before
    const reminder30Threshold = new Date(now.getTime() + 30 * 60 * 1000);
    const needReminder30 = await this.schedulesRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: PostStatus.SCHEDULED })
      .andWhere('s.scheduledAt <= :threshold', { threshold: reminder30Threshold.toISOString() })
      .andWhere('s.scheduledAt > :now', { now: now.toISOString() })
      .getMany();

    for (const post of needReminder30) {
      await this.sendNotification(post.id, NotificationType.REMINDER_30M);
    }

    // Reminder 5 min before
    const reminder5Threshold = new Date(now.getTime() + 5 * 60 * 1000);
    const needReminder5 = await this.schedulesRepo
      .createQueryBuilder('s')
      .where('s.status IN (:...statuses)', {
        statuses: [PostStatus.SCHEDULED, PostStatus.DUE],
      })
      .andWhere('s.scheduledAt <= :threshold', { threshold: reminder5Threshold.toISOString() })
      .andWhere('s.scheduledAt > :now', { now: now.toISOString() })
      .getMany();

    for (const post of needReminder5) {
      await this.sendNotification(post.id, NotificationType.REMINDER_5M);
    }
  }

  private async sendNotification(postId: string, type: NotificationType) {
    // Check if notification already exists
    const existing = await this.notifRepo.findOne({
      where: { scheduledPostId: postId, type },
    });

    if (!existing) {
      try {
        await this.notificationProcessor.processNotification(postId, type);
      } catch (error) {
        this.logger.error(`Failed to send notification ${type} for post ${postId}`, error);
      }
    }
  }
}
