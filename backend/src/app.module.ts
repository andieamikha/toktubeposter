import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import * as path from 'path';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TiktokAccountsModule } from './tiktok-accounts/tiktok-accounts.module';
import { ContentsModule } from './contents/contents.module';
import { SchedulesModule } from './schedules/schedules.module';
import { BulkModule } from './bulk/bulk.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TasksModule } from './tasks/tasks.module';
import { TelegramModule } from './telegram/telegram.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { JobsModule } from './jobs/jobs.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { TiktokApiModule } from './tiktok-api/tiktok-api.module';
import { UploadModule } from './upload/upload.module';
import { TiktokBrowserModule } from './tiktok-browser/tiktok-browser.module';
import { YoutubeAccountsModule } from './youtube-accounts/youtube-accounts.module';
import { YoutubeBrowserModule } from './youtube-browser/youtube-browser.module';
import { YoutubeApiModule } from './youtube-api/youtube-api.module';
import { FilesModule } from './files/files.module';
import { CronService } from './cron.service';

// Entities
import { User } from './users/entities/user.entity';
import { TiktokAccount } from './tiktok-accounts/entities/tiktok-account.entity';
import { Content } from './contents/entities/content.entity';
import { ScheduledPost } from './schedules/entities/scheduled-post.entity';
import { BulkBatch } from './bulk/entities/bulk-batch.entity';
import { Notification } from './notifications/entities/notification.entity';
import { AuditLog } from './audit/entities/audit-log.entity';
import { YoutubeAccount } from './youtube-accounts/entities/youtube-account.entity';
import { AuthService } from './auth/auth.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqljs' as const,
        location: path.join(process.cwd(), config.get('DATABASE_FILE', 'data/tiktok_manager.db')),
        autoSave: true,
        entities: [User, TiktokAccount, YoutubeAccount, Content, ScheduledPost, BulkBatch, Notification, AuditLog],
        synchronize: true,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    ScheduleModule.forRoot(),

    AuthModule,
    UsersModule,
    TiktokAccountsModule,
    ContentsModule,
    SchedulesModule,
    BulkModule,
    DashboardModule,
    TasksModule,
    TelegramModule,
    NotificationsModule,
    AuditModule,
    JobsModule,
    GoogleDriveModule,
    TiktokApiModule,
    UploadModule,
    TiktokBrowserModule,
    YoutubeAccountsModule,
    YoutubeBrowserModule,
    YoutubeApiModule,
    FilesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    CronService,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private authService: AuthService) {}

  async onModuleInit() {
    await this.authService.seedAdmin();
  }
}
