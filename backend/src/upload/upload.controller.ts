import {
  Controller, Post, Get, Param, Body, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { UploadService } from './upload.service';
import { UploadQueueService } from './upload-queue.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('upload')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UploadController {
  constructor(
    private uploadService: UploadService,
    private uploadQueueService: UploadQueueService,
  ) {}

  // ─── Upload Queue endpoints (static routes first!) ───

  /** GET /upload/queue/status */
  @Get('queue/status')
  async getQueueStatus() {
    return this.uploadQueueService.getQueueStatus();
  }

  /** POST /upload/queue/:contentId — enqueue upload */
  @Post('queue/:contentId')
  async enqueue(
    @Param('contentId') contentId: string,
    @Body('platform') platform: 'tiktok' | 'youtube',
    @Body('method') method: 'browser' | 'api',
    @Body('account_id') accountId: string,
    @Body('privacy') privacy: string,
  ) {
    await this.uploadQueueService.enqueue({
      contentId,
      platform: platform || 'tiktok',
      method: method || 'browser',
      accountId,
      privacy: privacy || 'SELF_ONLY',
    });
    return { message: 'Upload ditambahkan ke antrian.' };
  }

  /** POST /upload/queue/:contentId/cancel */
  @Post('queue/:contentId/cancel')
  async cancelQueue(@Param('contentId') contentId: string) {
    await this.uploadQueueService.cancel(contentId);
    return { message: 'Upload dibatalkan.' };
  }

  /** POST /upload/queue/:contentId/retry */
  @Post('queue/:contentId/retry')
  async retryQueue(@Param('contentId') contentId: string) {
    await this.uploadQueueService.retry(contentId);
    return { message: 'Upload akan di-retry.' };
  }

  /** POST /upload/queue/:contentId/dismiss */
  @Post('queue/:contentId/dismiss')
  async dismissQueue(@Param('contentId') contentId: string) {
    await this.uploadQueueService.dismiss(contentId);
    return { message: 'Status upload dihapus.' };
  }

  // ─── Direct upload endpoints ───

  /** POST /upload/direct/:contentId */
  @Post('direct/:contentId')
  async directUpload(
    @Param('contentId') contentId: string,
    @Body('method') method?: 'browser' | 'api',
    @Body('privacy_level') privacyLevel?: string,
    @Body('tiktok_account_id') tiktokAccountId?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.uploadService.directUploadFromContent(
      contentId,
      method || 'browser',
      userId || '',
      privacyLevel || 'SELF_ONLY',
      tiktokAccountId,
    );
  }

  /** POST /upload/youtube/:contentId */
  @Post('youtube/:contentId')
  async directUploadYouTube(
    @Param('contentId') contentId: string,
    @Body('youtube_account_id') youtubeAccountId: string,
    @Body('method') method?: 'browser' | 'api',
    @Body('privacy_status') privacyStatus?: 'public' | 'private' | 'unlisted',
    @CurrentUser('id') userId?: string,
  ) {
    return this.uploadService.directUploadToYouTube(
      contentId,
      youtubeAccountId,
      userId || '',
      method || 'browser',
      privacyStatus || 'public',
    );
  }

  // ─── Schedule-based upload endpoints ───

  /** POST /upload/:scheduleId/tiktok */
  @Post(':scheduleId/tiktok')
  async uploadToTikTok(
    @Param('scheduleId') scheduleId: string,
    @Body('privacy_level') privacyLevel?: string,
  ) {
    return this.uploadService.uploadToTikTok(scheduleId, privacyLevel || 'SELF_ONLY');
  }

  /** GET /upload/:scheduleId/status */
  @Get(':scheduleId/status')
  async getStatus(@Param('scheduleId') scheduleId: string) {
    return this.uploadService.getUploadStatus(scheduleId);
  }

  /** POST /upload/:scheduleId/retry */
  @Post(':scheduleId/retry')
  async retryUpload(
    @Param('scheduleId') scheduleId: string,
    @Body('privacy_level') privacyLevel?: string,
  ) {
    return this.uploadService.retryUpload(scheduleId, privacyLevel);
  }

  /** POST /upload/:scheduleId/refresh-status */
  @Post(':scheduleId/refresh-status')
  async refreshStatus(@Param('scheduleId') scheduleId: string) {
    return this.uploadService.refreshStatus(scheduleId);
  }

  /** POST /upload/:scheduleId/browser */
  @Post(':scheduleId/browser')
  async uploadViaBrowser(@Param('scheduleId') scheduleId: string) {
    return this.uploadService.uploadViaBrowser(scheduleId);
  }
}
