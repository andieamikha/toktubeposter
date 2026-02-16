import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { NotificationType, NotificationStatus } from '../common/constants';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @InjectRepository(ScheduledPost)
    private schedulesRepo: Repository<ScheduledPost>,
    @InjectRepository(Notification)
    private notifRepo: Repository<Notification>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private telegramService: TelegramService,
  ) {}

  async processNotification(scheduledPostId: string, type: NotificationType): Promise<void> {
    try {
      // Check if already sent
      const existing = await this.notifRepo.findOne({
        where: { scheduledPostId, type },
      });
      if (existing && existing.status === NotificationStatus.SENT) {
        return; // Already sent, idempotent
      }

      // Get schedule details
      const post = await this.schedulesRepo.findOne({
        where: { id: scheduledPostId },
        relations: ['tiktokAccount', 'content', 'assignedOperator'],
      });

      if (!post) {
        this.logger.warn(`Post ${scheduledPostId} not found for notification`);
        return;
      }

      const operator = post.assignedOperator;
      if (!operator || !operator.telegramChatId) {
        this.logger.warn(`Operator ${post.assignedOperatorId} has no Telegram connected`);
        await this.saveNotification(scheduledPostId, operator?.id, type, 'Operator belum menghubungkan Telegram', NotificationStatus.FAILED);
        return;
      }

      // Build message
      const message = this.buildMessage(type, operator.fullName, post);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const executionUrl = `${frontendUrl}/tugas/${post.id}`;

      // Send via Telegram
      const msgId = await this.telegramService.sendMessage(
        operator.telegramChatId,
        message,
        executionUrl,
      );

      // Save notification
      await this.saveNotification(
        scheduledPostId, operator.id, type,
        message, NotificationStatus.SENT, msgId,
      );

      this.logger.log(`Notification ${type} sent to ${operator.fullName} for post ${scheduledPostId}`);
    } catch (error) {
      this.logger.error(`Failed to send notification for ${scheduledPostId}`, error);
    }
  }

  private buildMessage(type: NotificationType, operatorName: string, post: ScheduledPost): string {
    const scheduledWib = this.toWIB(post.scheduledAt);
    const username = post.tiktokAccount?.username || 'Unknown';
    const briefTopic = post.content?.briefTopic || 'Untitled';

    switch (type) {
      case NotificationType.REMINDER_30M:
        return `📋 Pengingat Posting\n\nHai ${operatorName}! Kamu punya jadwal posting dalam 30 menit:\n\n📱 Akun: @${username}\n⏰ Jadwal: ${scheduledWib} WIB\n📝 Konten: ${briefTopic}`;

      case NotificationType.REMINDER_5M:
        return `⚡ Posting Segera!\n\nHai ${operatorName}, 5 menit lagi waktunya posting!\n\n📱 Akun: @${username}\n⏰ Jadwal: ${scheduledWib} WIB\n📝 Konten: ${briefTopic}\n\nSegera buka TikTok Web dan upload video ya!`;

      case NotificationType.OVERDUE:
        return `🚨 Posting Terlambat!\n\nHai ${operatorName}, posting berikut sudah TERLAMBAT (lewat 30 menit dari jadwal):\n\n📱 Akun: @${username}\n⏰ Jadwal awal: ${scheduledWib} WIB\n📝 Konten: ${briefTopic}\n\n⚠️ Segera selesaikan sebelum menjadi MISSED (batas +2 jam dari jadwal).`;

      default:
        return `Notifikasi posting untuk @${username}`;
    }
  }

  private toWIB(date: Date): string {
    const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}`;
  }

  private async saveNotification(
    postId: string, userId: string | undefined, type: NotificationType,
    message: string, status: NotificationStatus, telegramMsgId?: string,
  ) {
    try {
      const notif = this.notifRepo.create({
        scheduledPostId: postId,
        userId: userId || '',
        type,
        message,
        status,
        telegramMessageId: telegramMsgId || null,
        sentAt: status === NotificationStatus.SENT ? new Date() : null,
        errorMessage: status === NotificationStatus.FAILED ? message : null,
      });
      await this.notifRepo.save(notif);
    } catch (error) {
      // Duplicate - update instead
      await this.notifRepo.update(
        { scheduledPostId: postId, type },
        { status, sentAt: new Date(), telegramMessageId: telegramMsgId },
      );
    }
  }
}
