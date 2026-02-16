import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { Content } from '../contents/entities/content.entity';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';
import { YoutubeAccount } from '../youtube-accounts/entities/youtube-account.entity';
import { UploadService } from './upload.service';
import { UploadQueueService } from './upload-queue.service';
import { UploadController } from './upload.controller';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { TiktokApiModule } from '../tiktok-api/tiktok-api.module';
import { TiktokBrowserModule } from '../tiktok-browser/tiktok-browser.module';
import { YoutubeBrowserModule } from '../youtube-browser/youtube-browser.module';
import { YoutubeApiModule } from '../youtube-api/youtube-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledPost, Content, TiktokAccount, YoutubeAccount]),
    GoogleDriveModule,
    TiktokApiModule,
    TiktokBrowserModule,
    YoutubeBrowserModule,
    YoutubeApiModule,
  ],
  controllers: [UploadController],
  providers: [UploadService, UploadQueueService],
  exports: [UploadService, UploadQueueService],
})
export class UploadModule {}
