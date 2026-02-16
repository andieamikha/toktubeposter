import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as fs from 'fs';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

export interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}

export interface TikTokPublishResponse {
  publish_id: string;
  upload_url?: string;
}

@Injectable()
export class TiktokApiService {
  private readonly logger = new Logger(TiktokApiService.name);
  private readonly clientKey: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private config: ConfigService,
    @InjectRepository(TiktokAccount)
    private accountsRepo: Repository<TiktokAccount>,
  ) {
    this.clientKey = config.get<string>('TIKTOK_CLIENT_KEY', '');
    this.clientSecret = config.get<string>('TIKTOK_CLIENT_SECRET', '');
    this.redirectUri = config.get<string>(
      'TIKTOK_REDIRECT_URI',
      'http://localhost:3001/api/v1/tiktok-oauth/callback',
    );
  }

  /**
   * Check if TikTok API is configured
   */
  isConfigured(): boolean {
    return !!(this.clientKey && this.clientSecret);
  }

  /**
   * Generate OAuth authorization URL for a TikTok account
   */
  getAuthUrl(accountId: string): string {
    if (!this.isConfigured()) {
      throw new BadRequestException({
        code: 'TIKTOK_API_NOT_CONFIGURED',
        message: 'TIKTOK_CLIENT_KEY dan TIKTOK_CLIENT_SECRET belum dikonfigurasi di .env',
      });
    }

    const state = Buffer.from(JSON.stringify({ accountId })).toString('base64url');
    const scopes = 'user.info.basic,video.publish,video.upload';

    const params = new URLSearchParams({
      client_key: this.clientKey,
      scope: scopes,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state,
    });

    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<TikTokTokenResponse> {
    try {
      const { data } = await axios.post(
        `${TIKTOK_API_BASE}/oauth/token/`,
        new URLSearchParams({
          client_key: this.clientKey,
          client_secret: this.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      return data;
    } catch (error: any) {
      this.logger.error(`Token exchange failed: ${error.message}`);
      throw new BadRequestException('Gagal mendapatkan token TikTok. Coba ulangi proses koneksi.');
    }
  }

  /**
   * Refresh an expired access token
   */
  async refreshAccessToken(account: TiktokAccount): Promise<TiktokAccount> {
    if (!account.tiktokRefreshToken) {
      throw new BadRequestException('Akun belum terhubung ke TikTok. Silakan hubungkan terlebih dahulu.');
    }

    try {
      const { data } = await axios.post(
        `${TIKTOK_API_BASE}/oauth/token/`,
        new URLSearchParams({
          client_key: this.clientKey,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: account.tiktokRefreshToken,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      if (data.error) {
        // Refresh token expired — need to re-authorize
        account.isOauthConnected = false;
        account.tiktokAccessToken = null;
        account.tiktokRefreshToken = null;
        await this.accountsRepo.save(account);
        throw new BadRequestException('Sesi TikTok sudah kedaluwarsa. Silakan hubungkan ulang akun.');
      }

      account.tiktokAccessToken = data.access_token;
      account.tiktokRefreshToken = data.refresh_token;
      account.tiktokTokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
      await this.accountsRepo.save(account);

      return account;
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Token refresh failed: ${error.message}`);
      throw new BadRequestException('Gagal memperbarui token TikTok.');
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidToken(account: TiktokAccount): Promise<string> {
    if (!account.isOauthConnected || !account.tiktokAccessToken) {
      throw new BadRequestException(
        `Akun @${account.username} belum terhubung ke TikTok API. Hubungkan terlebih dahulu di halaman Akun TikTok.`,
      );
    }

    // Check if token is expired or about to expire (5 min buffer)
    if (account.tiktokTokenExpiresAt) {
      const expiresAt = new Date(account.tiktokTokenExpiresAt).getTime();
      if (Date.now() > expiresAt - 5 * 60 * 1000) {
        this.logger.log(`Refreshing expired token for @${account.username}`);
        account = await this.refreshAccessToken(account);
      }
    }

    return account.tiktokAccessToken!;
  }

  /**
   * Save OAuth tokens to a TikTok account
   */
  async saveTokens(accountId: string, tokens: TikTokTokenResponse) {
    await this.accountsRepo.update(accountId, {
      tiktokOpenId: tokens.open_id,
      tiktokAccessToken: tokens.access_token,
      tiktokRefreshToken: tokens.refresh_token,
      tiktokTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      isOauthConnected: true,
    });

    this.logger.log(`TikTok OAuth tokens saved for account ${accountId}`);
  }

  /**
   * Disconnect TikTok OAuth from an account
   */
  async disconnect(accountId: string) {
    await this.accountsRepo.update(accountId, {
      tiktokOpenId: null,
      tiktokAccessToken: null,
      tiktokRefreshToken: null,
      tiktokTokenExpiresAt: null,
      isOauthConnected: false,
    });

    this.logger.log(`TikTok OAuth disconnected for account ${accountId}`);
  }

  /**
   * Upload video to TikTok using FILE_UPLOAD mode
   * 1. Init publish → get upload_url
   * 2. Upload file chunks to upload_url
   * 3. Return publish_id for status tracking
   */
  async uploadVideo(
    account: TiktokAccount,
    filePath: string,
    caption: string,
    privacyLevel: string = 'SELF_ONLY',
  ): Promise<TikTokPublishResponse> {
    const accessToken = await this.getValidToken(account);
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Step 1: Init publish
    const chunkSize = Math.min(fileSize, 64 * 1024 * 1024); // Max 64MB chunks
    const totalChunks = Math.ceil(fileSize / chunkSize);

    this.logger.log(`Initiating TikTok upload: ${(fileSize / 1024 / 1024).toFixed(2)} MB, ${totalChunks} chunk(s)`);

    const initPayload = {
      post_info: {
        title: caption.substring(0, 2200), // TikTok max caption length
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      },
    };

    let publishId: string;
    let uploadUrl: string;

    try {
      const { data: initResponse } = await axios.post(
        `${TIKTOK_API_BASE}/post/publish/video/init/`,
        initPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        },
      );

      if (initResponse.error?.code) {
        throw new Error(initResponse.error.message || `TikTok API error: ${initResponse.error.code}`);
      }

      publishId = initResponse.data.publish_id;
      uploadUrl = initResponse.data.upload_url;

      this.logger.log(`Init successful: publish_id=${publishId}`);
    } catch (error: any) {
      this.logger.error(`TikTok init upload failed: ${error.message}`);
      const msg = error.response?.data?.error?.message || error.message;
      throw new BadRequestException(`Gagal menginisiasi upload TikTok: ${msg}`);
    }

    // Step 2: Upload file chunks
    try {
      const fileBuffer = fs.readFileSync(filePath);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunk = fileBuffer.subarray(start, end);

        this.logger.log(`Uploading chunk ${i + 1}/${totalChunks}: bytes ${start}-${end - 1}/${fileSize}`);

        await axios.put(uploadUrl, chunk, {
          headers: {
            'Content-Range': `bytes ${start}-${end - 1}/${fileSize}`,
            'Content-Type': 'video/mp4',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      }

      this.logger.log('File upload completed successfully');
    } catch (error: any) {
      this.logger.error(`TikTok file upload failed: ${error.message}`);
      throw new BadRequestException(`Gagal mengunggah video ke TikTok: ${error.message}`);
    }

    return { publish_id: publishId, upload_url: uploadUrl };
  }

  /**
   * Upload video to TikTok using PULL_FROM_URL mode
   * TikTok pulls the video from the given URL
   */
  async uploadVideoFromUrl(
    account: TiktokAccount,
    videoUrl: string,
    caption: string,
    privacyLevel: string = 'SELF_ONLY',
  ): Promise<TikTokPublishResponse> {
    const accessToken = await this.getValidToken(account);

    const payload = {
      post_info: {
        title: caption.substring(0, 2200),
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    };

    try {
      const { data } = await axios.post(
        `${TIKTOK_API_BASE}/post/publish/video/init/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        },
      );

      if (data.error?.code) {
        throw new Error(data.error.message || `TikTok API error: ${data.error.code}`);
      }

      return {
        publish_id: data.data.publish_id,
      };
    } catch (error: any) {
      this.logger.error(`TikTok URL upload failed: ${error.message}`);
      const msg = error.response?.data?.error?.message || error.message;
      throw new BadRequestException(`Gagal mengunggah video ke TikTok: ${msg}`);
    }
  }

  /**
   * Check the publish status of a video
   */
  async checkPublishStatus(account: TiktokAccount, publishId: string): Promise<any> {
    const accessToken = await this.getValidToken(account);

    try {
      const { data } = await axios.post(
        `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
        { publish_id: publishId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        },
      );

      return data.data;
    } catch (error: any) {
      this.logger.error(`Status check failed: ${error.message}`);
      throw new BadRequestException('Gagal memeriksa status upload.');
    }
  }
}
