import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Content } from '../contents/entities/content.entity';
import { UploadService } from './upload.service';

/**
 * Upload Queue Service
 * Manages a per-content upload queue:
 *   queued → downloading → uploading → published / failed
 * Processes one upload at a time in background.
 */
@Injectable()
export class UploadQueueService {
  private readonly logger = new Logger(UploadQueueService.name);
  private processing = false;

  constructor(
    @InjectRepository(Content)
    private contentsRepo: Repository<Content>,
    private uploadService: UploadService,
  ) {
    // Kick off queue processing every 3 seconds
    setInterval(() => this.processNext(), 3000);

    // On startup, reset any stuck "downloading"/"uploading" items back to queued
    this.resetStuckItems();
  }

  /**
   * Enqueue a content for upload.
   * Returns immediately — the upload happens in background.
   */
  async enqueue(params: {
    contentId: string;
    platform: 'tiktok' | 'youtube';
    method: 'browser' | 'api';
    accountId: string;
    privacy: string;
  }) {
    const content = await this.contentsRepo.findOne({ where: { id: params.contentId } });
    if (!content) throw new Error('Konten tidak ditemukan.');

    // Prevent double-queue
    if (['queued', 'downloading', 'uploading'].includes(content.uploadStatus)) {
      throw new Error('Konten ini sudah dalam antrian upload.');
    }

    await this.contentsRepo.update(params.contentId, {
      uploadStatus: 'queued',
      uploadPlatform: params.platform,
      uploadMethod: params.method,
      uploadAccountId: params.accountId,
      uploadPrivacy: params.privacy,
      uploadError: null,
      uploadResultUrl: null,
      uploadStartedAt: null,
      uploadCompletedAt: null,
      uploadQueuedAt: new Date(),
    });

    this.logger.log(`Enqueued content ${params.contentId} for ${params.platform}/${params.method}`);

    // Try to process immediately
    this.processNext();
  }

  /**
   * Cancel a queued upload (only if still queued, not yet processing).
   */
  async cancel(contentId: string) {
    const content = await this.contentsRepo.findOne({ where: { id: contentId } });
    if (!content) throw new Error('Konten tidak ditemukan.');

    if (content.uploadStatus !== 'queued') {
      throw new Error('Hanya upload yang masih dalam antrian yang bisa dibatalkan.');
    }

    await this.contentsRepo.update(contentId, {
      uploadStatus: 'idle',
      uploadPlatform: null,
      uploadMethod: null,
      uploadAccountId: null,
      uploadPrivacy: null,
      uploadQueuedAt: null,
    });

    this.logger.log(`Cancelled queued upload for content ${contentId}`);
  }

  /**
   * Get all items with active upload statuses.
   */
  async getQueueStatus() {
    return this.contentsRepo.find({
      where: {
        uploadStatus: In(['queued', 'downloading', 'uploading', 'processing', 'published', 'failed']),
      },
      relations: ['tiktokAccount'],
      order: { uploadQueuedAt: 'ASC' },
    });
  }

  /**
   * Reset a failed upload so it can be retried.
   */
  async retry(contentId: string) {
    const content = await this.contentsRepo.findOne({ where: { id: contentId } });
    if (!content) throw new Error('Konten tidak ditemukan.');

    if (content.uploadStatus !== 'failed') {
      throw new Error('Hanya upload yang gagal yang bisa di-retry.');
    }

    await this.contentsRepo.update(contentId, {
      uploadStatus: 'queued',
      uploadError: null,
      uploadStartedAt: null,
      uploadCompletedAt: null,
      uploadQueuedAt: new Date(),
    });

    this.logger.log(`Retrying upload for content ${contentId}`);
    this.processNext();
  }

  /**
   * Dismiss/clear a finished upload status (published or failed).
   */
  async dismiss(contentId: string) {
    await this.contentsRepo.update(contentId, {
      uploadStatus: 'idle',
      uploadError: null,
      uploadPlatform: null,
      uploadMethod: null,
      uploadAccountId: null,
      uploadPrivacy: null,
      uploadStartedAt: null,
      uploadCompletedAt: null,
      uploadResultUrl: null,
      uploadQueuedAt: null,
    });
  }

  // ─── Internal processing ───

  private async resetStuckItems() {
    const stuck = await this.contentsRepo.find({
      where: { uploadStatus: In(['downloading', 'uploading']) },
    });
    for (const item of stuck) {
      this.logger.warn(`Resetting stuck upload for content ${item.id}`);
      await this.contentsRepo.update(item.id, { uploadStatus: 'queued' });
    }
  }

  private async processNext() {
    if (this.processing) return;

    // Find the oldest queued item
    const next = await this.contentsRepo.findOne({
      where: { uploadStatus: 'queued' },
      order: { uploadQueuedAt: 'ASC' },
    });

    if (!next) return;

    this.processing = true;
    this.logger.log(`Processing upload for content ${next.id} [${next.uploadPlatform}/${next.uploadMethod}]`);

    try {
      // Mark as downloading
      await this.contentsRepo.update(next.id, {
        uploadStatus: 'downloading',
        uploadStartedAt: new Date(),
      });

      if (next.uploadPlatform === 'tiktok') {
        await this.processTikTokUpload(next);
      } else if (next.uploadPlatform === 'youtube') {
        await this.processYouTubeUpload(next);
      } else {
        throw new Error(`Platform tidak dikenal: ${next.uploadPlatform}`);
      }
    } catch (error: any) {
      this.logger.error(`Upload failed for content ${next.id}: ${error.message}`);
      await this.contentsRepo.update(next.id, {
        uploadStatus: 'failed',
        uploadError: error.message || 'Upload gagal',
        uploadCompletedAt: new Date(),
      });
    } finally {
      this.processing = false;
    }
  }

  private async processTikTokUpload(content: Content) {
    // Mark uploading
    await this.contentsRepo.update(content.id, { uploadStatus: 'uploading' });

    const result = await this.uploadService.directUploadFromContent(
      content.id,
      (content.uploadMethod as 'browser' | 'api') || 'browser',
      content.createdBy || '',
      content.uploadPrivacy || 'SELF_ONLY',
      content.uploadAccountId || undefined,
    );

    // Mark published
    await this.contentsRepo.update(content.id, {
      uploadStatus: 'published',
      uploadCompletedAt: new Date(),
      uploadResultUrl: (result as any)?.publish_id
        ? `tiktok:publish:${(result as any).publish_id}`
        : null,
    });

    this.logger.log(`TikTok upload complete for content ${content.id}`);
  }

  private async processYouTubeUpload(content: Content) {
    // Mark uploading
    await this.contentsRepo.update(content.id, { uploadStatus: 'uploading' });

    const result = await this.uploadService.directUploadToYouTube(
      content.id,
      content.uploadAccountId || '',
      content.createdBy || '',
      (content.uploadMethod as 'browser' | 'api') || 'browser',
      (content.uploadPrivacy as 'public' | 'private' | 'unlisted') || 'public',
    );

    // Mark published
    await this.contentsRepo.update(content.id, {
      uploadStatus: 'published',
      uploadCompletedAt: new Date(),
      uploadResultUrl: (result as any)?.videoUrl || null,
    });

    this.logger.log(`YouTube upload complete for content ${content.id}`);
  }
}
