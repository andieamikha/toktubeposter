import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { ReconcilerProcessor } from './reconciler.processor';
import { NotificationProcessor } from './notification.processor';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledPost, Notification, User]),
    TelegramModule,
  ],
  providers: [NotificationProcessor, ReconcilerProcessor],
  exports: [ReconcilerProcessor, NotificationProcessor],
})
export class JobsModule {}
