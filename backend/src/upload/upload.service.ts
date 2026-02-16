import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { Content } from '../contents/entities/content.entity';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';
import { YoutubeAccount } from '../youtube-accounts/entities/youtube-account.entity';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { TiktokApiService } from '../tiktok-api/tiktok-api.service';
import { TiktokBrowserService } from '../tiktok-browser/tiktok-browser.service';
import { YoutubeBrowserService } from '../youtube-browser/youtube-browser.service';
import { YoutubeApiService } from '../youtube-api/youtube-api.service';
import { UploadStatus, PostStatus, ContentStatus } from '../common/constants';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @InjectRepository(ScheduledPost)
    private schedulesRepo: Repository<ScheduledPost>,
    @InjectRepository(Content)
    private contentsRepo: Repository<Content>,
    @InjectRepository(TiktokAccount)
    private accountsRepo: Repository<TiktokAccount>,
    @InjectRepository(YoutubeAccount)
    private youtubeAccountsRepo: Repository<YoutubeAccount>,
    private googleDriveService: GoogleDriveService,
    private tiktokApiService: TiktokApiService,
    private tiktokBrowserService: TiktokBrowserService,
    private youtubeBrowserService: YoutubeBrowserService,
    private youtubeApiService: YoutubeApiService,
  ) {}

  /**
   * Resolve video file - supports local:// URLs and Google Drive URLs
   * Returns { localPath, fileName, fileSize, isLocal }
   */
  private async resolveVideoFile(driveUrl: string): Promise<{
    localPath: string;
    fileName: string;
    fileSize: number;
    isLocal: boolean;
  }> {
    // Check if this is a local file (uploaded via /files/upload)
    if (driveUrl.startsWith('local://')) {
      const filename = driveUrl.replace('local://', '');
      const localPath = path.join(process.cwd(), 'data', 'videos', filename);
      
      if (!fs.existsSync(localPath)) {
        throw new BadRequestException(`File lokal tidak ditemukan: ${filename}`);
      }

      const stat = fs.statSync(localPath);
      return {
        localPath,
        fileName: filename,
        fileSize: stat.size,
        isLocal: true,
      };
    }

    // Otherwise, download from Google Drive
    const downloaded = await this.googleDriveService.downloadFile(driveUrl);
    return {
      localPath: downloaded.localPath,
      fileName: downloaded.fileName,
      fileSize: downloaded.fileSize,
      isLocal: false,
    };
  }

  /**
   * Get upload status for a schedule
   */
  async getUploadStatus(scheduleId: string) {
    const schedule = await this.schedulesRepo.findOne({
      where: { id: scheduleId },
      select: ['id', 'uploadStatus', 'uploadError', 'tiktokPublishId', 'tiktokUrl', 'status'],
    });

    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan.');

    return {
      id: schedule.id,
      uploadStatus: schedule.uploadStatus,
      uploadError: schedule.uploadError,
      tiktokPublishId: schedule.tiktokPublishId,
      tiktokUrl: schedule.tiktokUrl,
      postStatus: schedule.status,
    };
  }

  /**
   * Main upload pipeline:
   * 1. Download video from Google Drive
   * 2. Upload to TikTok via Content Posting API
   * 3. Check publish status
   * 4. Mark schedule as done
   */
  async uploadToTikTok(
    scheduleId: string,
    privacyLevel: string = 'SELF_ONLY',
  ) {
    // Load the full schedule with relations
    const schedule = await this.schedulesRepo.findOne({
      where: { id: scheduleId },
      relations: ['content', 'tiktokAccount'],
    });

    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan.');

    // Validate schedule state
    if (schedule.uploadStatus === UploadStatus.DOWNLOADING || schedule.uploadStatus === UploadStatus.UPLOADING) {
      throw new BadRequestException('Upload sedang berlangsung. Tunggu hingga selesai.');
    }

    if (schedule.status === PostStatus.DONE) {
      throw new BadRequestException('Jadwal ini sudah selesai.');
    }

    if (schedule.status === PostStatus.CANCELED) {
      throw new BadRequestException('Jadwal ini sudah dibatalkan.');
    }

    const content = schedule.content;
    if (!content) throw new BadRequestException('Konten tidak ditemukan untuk jadwal ini.');

    if (!content.finalCaption) {
      throw new BadRequestException('Konten belum memiliki caption final. Finalize terlebih dahulu.');
    }

    const account = schedule.tiktokAccount;
    if (!account) throw new BadRequestException('Akun TikTok tidak ditemukan.');

    if (!account.isOauthConnected) {
      throw new BadRequestException(
        `Akun @${account.username} belum terhubung ke TikTok API. Hubungkan terlebih dahulu di halaman Akun TikTok.`,
      );
    }

    // Build caption with hashtags
    const hashtags = content.finalHashtags?.map((h) => `#${h}`).join(' ') || '';
    const fullCaption = `${content.finalCaption}\n\n${hashtags}`.trim();

    let localFilePath: string | null = null;
    let isLocalFile = false;

    try {
      // === STEP 1: Resolve video file (local upload or Google Drive) ===
      await this.updateUploadStatus(scheduleId, UploadStatus.DOWNLOADING);
      if (!content.driveUrl) {
        throw new BadRequestException('Konten belum memiliki video. Tambahkan link video terlebih dahulu.');
      }
      this.logger.log(`[${scheduleId}] Resolving video: ${content.driveUrl}`);

      const resolved = await this.resolveVideoFile(content.driveUrl);
      localFilePath = resolved.localPath;
      isLocalFile = resolved.isLocal;

      this.logger.log(`[${scheduleId}] ${isLocalFile ? 'Local file' : 'Downloaded'}: ${resolved.fileName} (${(resolved.fileSize / 1024 / 1024).toFixed(2)} MB)`);

      // === STEP 2: Upload to TikTok ===
      await this.updateUploadStatus(scheduleId, UploadStatus.UPLOADING);
      this.logger.log(`[${scheduleId}] Uploading to TikTok for @${account.username}...`);

      const publishResult = await this.tiktokApiService.uploadVideo(
        account,
        localFilePath,
        fullCaption,
        privacyLevel,
      );

      // Save publish ID
      await this.schedulesRepo.update(scheduleId, {
        tiktokPublishId: publishResult.publish_id,
        uploadStatus: UploadStatus.PROCESSING,
      });

      this.logger.log(`[${scheduleId}] Upload complete! publish_id=${publishResult.publish_id}`);

      // === STEP 3: Check publish status (with retry) ===
      await this.waitForPublish(scheduleId, account, publishResult.publish_id);

      return {
        success: true,
        message: 'Video berhasil diupload ke TikTok!',
        publish_id: publishResult.publish_id,
        upload_status: UploadStatus.PUBLISHED,
      };
    } catch (error: any) {
      this.logger.error(`[${scheduleId}] Upload failed: ${error.message}`);

      await this.schedulesRepo.update(scheduleId, {
        uploadStatus: UploadStatus.FAILED,
        uploadError: error.message || 'Unknown error',
      });

      throw error;
    } finally {
      // Only cleanup if it was downloaded (not a local upload)
      if (localFilePath && !isLocalFile) {
        this.googleDriveService.cleanupFile(localFilePath);
      }
    }
  }

  /**
   * Wait for TikTok to process the video (poll status)
   */
  private async waitForPublish(
    scheduleId: string,
    account: TiktokAccount,
    publishId: string,
    maxAttempts = 10,
    intervalMs = 5000,
  ) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      try {
        const status = await this.tiktokApiService.checkPublishStatus(account, publishId);
        this.logger.log(`[${scheduleId}] Publish status check ${attempt}/${maxAttempts}: ${JSON.stringify(status)}`);

        if (status?.status === 'PUBLISH_COMPLETE') {
          // Successfully published!
          await this.schedulesRepo.update(scheduleId, {
            uploadStatus: UploadStatus.PUBLISHED,
            status: PostStatus.DONE,
            postedAt: new Date(),
            uploadError: null,
          });

          this.logger.log(`[${scheduleId}] Published successfully!`);
          return;
        }

        if (status?.status === 'FAILED') {
          throw new Error(`TikTok publish failed: ${status.fail_reason || 'Unknown reason'}`);
        }
      } catch (error: any) {
        if (attempt === maxAttempts) {
          // Last attempt — mark as processing (user can check later)
          this.logger.warn(`[${scheduleId}] Status check timed out after ${maxAttempts} attempts`);
          await this.schedulesRepo.update(scheduleId, {
            uploadStatus: UploadStatus.PROCESSING,
            uploadError: 'Video masih diproses oleh TikTok. Cek kembali nanti.',
          });
          return;
        }
      }
    }
  }

  /**
   * Retry a failed upload
   */
  async retryUpload(scheduleId: string, privacyLevel?: string) {
    const schedule = await this.schedulesRepo.findOne({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan.');

    if (schedule.uploadStatus !== UploadStatus.FAILED) {
      throw new BadRequestException('Hanya upload yang gagal yang bisa di-retry.');
    }

    // Reset status
    await this.schedulesRepo.update(scheduleId, {
      uploadStatus: UploadStatus.IDLE,
      uploadError: null,
      tiktokPublishId: null,
    });

    return this.uploadToTikTok(scheduleId, privacyLevel);
  }

  /**
   * Refresh publish status from TikTok
   */
  async refreshStatus(scheduleId: string) {
    const schedule = await this.schedulesRepo.findOne({
      where: { id: scheduleId },
      relations: ['tiktokAccount'],
    });

    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan.');
    if (!schedule.tiktokPublishId) throw new BadRequestException('Tidak ada publish ID untuk jadwal ini.');

    const status = await this.tiktokApiService.checkPublishStatus(
      schedule.tiktokAccount,
      schedule.tiktokPublishId,
    );

    if (status?.status === 'PUBLISH_COMPLETE') {
      await this.schedulesRepo.update(scheduleId, {
        uploadStatus: UploadStatus.PUBLISHED,
        status: PostStatus.DONE,
        postedAt: new Date(),
        uploadError: null,
      });
    } else if (status?.status === 'FAILED') {
      await this.schedulesRepo.update(scheduleId, {
        uploadStatus: UploadStatus.FAILED,
        uploadError: status.fail_reason || 'Publish failed',
      });
    }

    return {
      publish_id: schedule.tiktokPublishId,
      tiktok_status: status?.status || 'UNKNOWN',
      upload_status: schedule.uploadStatus,
      fail_reason: status?.fail_reason,
    };
  }

  private async updateUploadStatus(scheduleId: string, status: UploadStatus) {
    await this.schedulesRepo.update(scheduleId, {
      uploadStatus: status,
      uploadError: null,
    });
  }

  /**
   * Upload to TikTok via Puppeteer browser automation
   * Pipeline: Download from Drive → Upload via browser → Mark done
   */
  async uploadViaBrowser(scheduleId: string) {
    const schedule = await this.schedulesRepo.findOne({
      where: { id: scheduleId },
      relations: ['content', 'tiktokAccount'],
    });

    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan.');

    if (schedule.uploadStatus === UploadStatus.DOWNLOADING || schedule.uploadStatus === UploadStatus.UPLOADING) {
      throw new BadRequestException('Upload sedang berlangsung. Tunggu hingga selesai.');
    }

    if (schedule.status === PostStatus.DONE) {
      throw new BadRequestException('Jadwal ini sudah selesai.');
    }

    const content = schedule.content;
    if (!content) throw new BadRequestException('Konten tidak ditemukan.');
    if (!content.finalCaption) throw new BadRequestException('Konten belum memiliki caption final.');

    const account = schedule.tiktokAccount;
    if (!account) throw new BadRequestException('Akun TikTok tidak ditemukan.');
    if (!account.isBrowserLoggedIn && account.loginMethod === 'none') {
      throw new BadRequestException(
        `Akun @${account.username} belum login ke TikTok. Silakan login terlebih dahulu di halaman Akun TikTok.`,
      );
    }

    const hashtags = content.finalHashtags?.map((h) => `#${h}`).join(' ') || '';
    const fullCaption = `${content.finalCaption}\n\n${hashtags}`.trim();

    let localFilePath: string | null = null;
    let isLocalFile = false;

    try {
      // Step 1: Resolve video file (local upload or Google Drive)
      await this.updateUploadStatus(scheduleId, UploadStatus.DOWNLOADING);
      if (!content.driveUrl) {
        throw new BadRequestException('Konten belum memiliki video.');
      }
      this.logger.log(`[${scheduleId}] Browser upload — resolving video: ${content.driveUrl}`);

      const resolved = await this.resolveVideoFile(content.driveUrl);
      localFilePath = resolved.localPath;
      isLocalFile = resolved.isLocal;
      this.logger.log(`[${scheduleId}] ${isLocalFile ? 'Local file' : 'Downloaded'}: ${resolved.fileName} (${(resolved.fileSize / 1024 / 1024).toFixed(2)} MB)`);

      // Step 2: Upload via browser
      await this.updateUploadStatus(scheduleId, UploadStatus.UPLOADING);
      this.logger.log(`[${scheduleId}] Browser upload — uploading for @${account.username}...`);

      const result = await this.tiktokBrowserService.uploadVideo(
        account.id,
        localFilePath,
        fullCaption,
      );

      if (result.success) {
        await this.schedulesRepo.update(scheduleId, {
          uploadStatus: UploadStatus.PUBLISHED,
          status: PostStatus.DONE,
          postedAt: new Date(),
          uploadError: null,
        });

        this.logger.log(`[${scheduleId}] Browser upload successful!`);
        return {
          success: true,
          message: 'Video berhasil diupload via browser!',
          upload_status: UploadStatus.PUBLISHED,
        };
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      this.logger.error(`[${scheduleId}] Browser upload failed: ${error.message}`);
      await this.schedulesRepo.update(scheduleId, {
        uploadStatus: UploadStatus.FAILED,
        uploadError: error.message || 'Browser upload failed',
      });
      throw error;
    } finally {
      // Only cleanup if it was downloaded (not a local upload)
      if (localFilePath && !isLocalFile) {
        this.googleDriveService.cleanupFile(localFilePath);
      }
    }
  }

  /**
   * Direct upload from content (no schedule needed)
   * Creates an ad-hoc schedule, uploads via browser, returns result
   */
  async directUploadFromContent(
    contentId: string,
    method: 'browser' | 'api' = 'browser',
    userId: string,
    privacyLevel: string = 'SELF_ONLY',
    overrideAccountId?: string,
  ) {
    // Load content with account
    const content = await this.contentsRepo.findOne({
      where: { id: contentId },
      relations: ['tiktokAccount'],
    });

    if (!content) throw new NotFoundException('Konten tidak ditemukan.');

    // Use override account if provided, otherwise use content's account
    let account: TiktokAccount | null = null;
    if (overrideAccountId) {
      account = await this.accountsRepo.findOne({ where: { id: overrideAccountId } });
      if (!account) throw new BadRequestException('Akun TikTok tidak ditemukan.');
    } else {
      if (!content.tiktokAccountId) throw new BadRequestException('Konten belum dipilihkan akun TikTok.');
      account = content.tiktokAccount;
      if (!account) throw new BadRequestException('Akun TikTok tidak ditemukan.');
    }

    // Build caption: use finalCaption if available, otherwise build from brief
    let fullCaption = '';
    if (content.finalCaption) {
      const hashtags = content.finalHashtags?.map((h) => `#${h}`).join(' ') || '';
      fullCaption = `${content.finalCaption}\n\n${hashtags}`.trim();
    } else if (content.aiOptions && content.aiOptions.length > 0) {
      // Use first AI option
      const opt = content.aiOptions[0];
      const hashtags = opt.hashtags?.map((h: string) => `#${h}`).join(' ') || '';
      fullCaption = `${opt.caption}\n\n${hashtags}`.trim();
    } else {
      // Fallback: use brief topic + points
      const points = content.briefPoints?.join(' \u2022 ') || '';
      fullCaption = `${content.briefTopic}\n\n${points}`.trim();
    }

    let localFilePath: string | null = null;
    let isLocalFile = false;

    try {
      // Step 1: Resolve video file
      if (!content.driveUrl) {
        throw new BadRequestException('Konten belum memiliki video. Tambahkan link video terlebih dahulu.');
      }
      this.logger.log(`[direct-${contentId}] Resolving video: ${content.driveUrl}`);
      const resolved = await this.resolveVideoFile(content.driveUrl);
      localFilePath = resolved.localPath;
      isLocalFile = resolved.isLocal;
      this.logger.log(`[direct-${contentId}] ${isLocalFile ? 'Local file' : 'Downloaded'}: ${resolved.fileName} (${(resolved.fileSize / 1024 / 1024).toFixed(2)} MB)`);

      // Step 2: Upload
      if (method === 'browser') {
        // Check browser login
        if (!account.isBrowserLoggedIn && account.loginMethod === 'none') {
          throw new BadRequestException(
            `Akun @${account.username} belum login browser. Login terlebih dahulu di halaman Akun TikTok.`,
          );
        }

        this.logger.log(`[direct-${contentId}] Browser upload for @${account.username}...`);
        const result = await this.tiktokBrowserService.uploadVideo(
          account.id,
          localFilePath,
          fullCaption,
        );

        if (!result.success) {
          throw new Error(result.message);
        }

        // Mark content as used
        await this.contentsRepo.update(contentId, {
          status: ContentStatus.USED,
          usedCount: () => 'used_count + 1',
        } as any);

        return {
          success: true,
          message: `Video berhasil diupload ke @${account.username} via browser!`,
          method: 'browser',
        };
      } else {
        // API upload
        if (!account.isOauthConnected) {
          throw new BadRequestException(
            `Akun @${account.username} belum terhubung TikTok API. Hubungkan terlebih dahulu.`,
          );
        }

        this.logger.log(`[direct-${contentId}] API upload for @${account.username}...`);
        const publishResult = await this.tiktokApiService.uploadVideo(
          account,
          localFilePath,
          fullCaption,
          privacyLevel,
        );

        // Mark content as used
        await this.contentsRepo.update(contentId, {
          status: ContentStatus.USED,
          usedCount: () => 'used_count + 1',
        } as any);

        return {
          success: true,
          message: `Video berhasil diupload ke @${account.username} via API!`,
          method: 'api',
          publish_id: publishResult.publish_id,
        };
      }
    } catch (error: any) {
      this.logger.error(`[direct-${contentId}] Direct upload failed: ${error.message}`);
      throw error;
    } finally {
      if (localFilePath && !isLocalFile) {
        this.googleDriveService.cleanupFile(localFilePath);
      }
    }
  }

  /**
   * Direct upload to YouTube from content
   * Supports both browser automation and YouTube Data API
   */
  async directUploadToYouTube(
    contentId: string,
    youtubeAccountId: string,
    userId: string,
    method: 'browser' | 'api' = 'browser',
    privacyStatus: 'public' | 'private' | 'unlisted' = 'public',
  ) {
    const content = await this.contentsRepo.findOne({
      where: { id: contentId },
      relations: ['tiktokAccount'],
    });

    if (!content) throw new NotFoundException('Konten tidak ditemukan.');

    const ytAccount = await this.youtubeAccountsRepo.findOne({ where: { id: youtubeAccountId } });
    if (!ytAccount) throw new BadRequestException('Akun YouTube tidak ditemukan.');

    // Build title & description
    const title = content.briefTopic.substring(0, 100);
    let description = '';
    if (content.finalCaption) {
      const hashtags = content.finalHashtags?.map((h) => `#${h}`).join(' ') || '';
      description = `${content.finalCaption}\n\n${hashtags}`.trim();
    } else if (content.aiOptions && content.aiOptions.length > 0) {
      const opt = content.aiOptions[0];
      const hashtags = opt.hashtags?.map((h: string) => `#${h}`).join(' ') || '';
      description = `${opt.caption}\n\n${hashtags}`.trim();
    } else {
      const points = content.briefPoints?.join(' • ') || '';
      description = `${content.briefTopic}\n\n${points}`.trim();
    }

    let localFilePath: string | null = null;
    let isLocalFile = false;

    try {
      // Resolve video file
      if (!content.driveUrl) {
        throw new BadRequestException('Konten belum memiliki video. Tambahkan link video terlebih dahulu.');
      }
      this.logger.log(`[yt-${contentId}] Resolving video: ${content.driveUrl}`);
      const resolved = await this.resolveVideoFile(content.driveUrl);
      localFilePath = resolved.localPath;
      isLocalFile = resolved.isLocal;
      this.logger.log(`[yt-${contentId}] ${isLocalFile ? 'Local file' : 'Downloaded'}: ${resolved.fileName}`);

      if (method === 'api') {
        // === YouTube Data API upload ===
        if (!ytAccount.isApiConnected) {
          throw new BadRequestException(
            `Akun ${ytAccount.channelName} belum terhubung ke YouTube API. Hubungkan terlebih dahulu di halaman Akun YouTube.`,
          );
        }

        // Extract tags from hashtags
        const tags = content.finalHashtags || [];

        this.logger.log(`[yt-${contentId}] YouTube API upload for ${ytAccount.channelName}...`);
        const apiResult = await this.youtubeApiService.uploadVideo(
          ytAccount,
          localFilePath,
          title,
          description,
          privacyStatus,
          tags,
        );

        // Mark content as used
        await this.contentsRepo.update(contentId, {
          status: ContentStatus.USED,
          usedCount: () => 'used_count + 1',
        } as any);

        return {
          success: true,
          message: `Video berhasil diupload ke YouTube ${ytAccount.channelName} via API!`,
          platform: 'youtube',
          method: 'api',
          videoId: apiResult.videoId,
          videoUrl: apiResult.videoUrl,
        };
      } else {
        // === Browser automation upload ===
        if (!ytAccount.isBrowserLoggedIn && ytAccount.loginMethod === 'none') {
          throw new BadRequestException(
            `Akun ${ytAccount.channelName} belum login browser. Login terlebih dahulu di halaman Akun YouTube.`,
          );
        }

        this.logger.log(`[yt-${contentId}] YouTube browser upload for ${ytAccount.channelName}...`);
        const result = await this.youtubeBrowserService.uploadVideo(
          ytAccount.id,
          localFilePath,
          title,
          description,
        );

        if (!result.success) {
          throw new BadRequestException(result.message);
        }

        // Mark content as used
        await this.contentsRepo.update(contentId, {
          status: ContentStatus.USED,
          usedCount: () => 'used_count + 1',
        } as any);

        return {
          success: true,
          message: `Video berhasil diupload ke YouTube ${ytAccount.channelName} via browser!`,
          platform: 'youtube',
          method: 'browser',
        };
      }
    } catch (error: any) {
      this.logger.error(`[yt-${contentId}] YouTube upload failed: ${error.message}`);
      throw error;
    } finally {
      if (localFilePath && !isLocalFile) {
        this.googleDriveService.cleanupFile(localFilePath);
      }
    }
  }
}
