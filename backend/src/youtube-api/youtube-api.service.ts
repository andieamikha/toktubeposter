import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import { YoutubeAccount } from '../youtube-accounts/entities/youtube-account.entity';

// Lazy-load googleapis to avoid slow TypeScript compilation and crashes if not installed
let _google: any = null;
async function getGoogle(): Promise<any> {
  if (!_google) {
    try {
      const mod = await import('googleapis');
      _google = mod.google;
    } catch {
      throw new BadRequestException(
        'Package "googleapis" belum terinstall. Jalankan: cd backend && npm install googleapis google-auth-library',
      );
    }
  }
  return _google;
}

@Injectable()
export class YoutubeApiService {
  private readonly logger = new Logger(YoutubeApiService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private config: ConfigService,
    @InjectRepository(YoutubeAccount)
    private accountsRepo: Repository<YoutubeAccount>,
  ) {
    this.clientId = config.get<string>('YOUTUBE_CLIENT_ID', '');
    this.clientSecret = config.get<string>('YOUTUBE_CLIENT_SECRET', '');
    this.redirectUri = config.get<string>(
      'YOUTUBE_REDIRECT_URI',
      'http://localhost:3001/api/v1/youtube-oauth/callback',
    );
  }

  /**
   * Check if YouTube API is configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Create an OAuth2 client
   */
  private async createOAuth2Client(): Promise<any> {
    const google = await getGoogle();
    return new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
  }

  /**
   * Create an authenticated OAuth2 client for a specific account
   */
  private async getAuthenticatedClient(account: YoutubeAccount): Promise<any> {
    if (!account.isApiConnected || !account.youtubeAccessToken) {
      throw new BadRequestException(
        `Akun ${account.channelName} belum terhubung ke YouTube API. Hubungkan terlebih dahulu.`,
      );
    }

    const oauth2Client = await this.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: account.youtubeAccessToken,
      refresh_token: account.youtubeRefreshToken,
      expiry_date: account.youtubeTokenExpiresAt
        ? new Date(account.youtubeTokenExpiresAt).getTime()
        : undefined,
    });

    // Listen for token refresh events
    oauth2Client.on('tokens', async (tokens) => {
      this.logger.log(`Token refreshed for ${account.channelName}`);
      const updateData: any = {};
      if (tokens.access_token) {
        updateData.youtubeAccessToken = tokens.access_token;
      }
      if (tokens.refresh_token) {
        updateData.youtubeRefreshToken = tokens.refresh_token;
      }
      if (tokens.expiry_date) {
        updateData.youtubeTokenExpiresAt = new Date(tokens.expiry_date);
      }
      await this.accountsRepo.update(account.id, updateData);
    });

    // Check if token is expired and refresh
    if (account.youtubeTokenExpiresAt) {
      const expiresAt = new Date(account.youtubeTokenExpiresAt).getTime();
      if (Date.now() > expiresAt - 5 * 60 * 1000) {
        this.logger.log(`Refreshing expired token for ${account.channelName}`);
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          oauth2Client.setCredentials(credentials);

          await this.accountsRepo.update(account.id, {
            youtubeAccessToken: credentials.access_token || account.youtubeAccessToken,
            youtubeRefreshToken: credentials.refresh_token || account.youtubeRefreshToken,
            youtubeTokenExpiresAt: credentials.expiry_date
              ? new Date(credentials.expiry_date)
              : account.youtubeTokenExpiresAt,
          });
        } catch (error: any) {
          this.logger.error(`Token refresh failed: ${error.message}`);
          await this.accountsRepo.update(account.id, {
            isApiConnected: false,
            youtubeAccessToken: null,
            youtubeRefreshToken: null,
            youtubeTokenExpiresAt: null,
          });
          throw new BadRequestException(
            'Sesi YouTube API sudah kedaluwarsa. Silakan hubungkan ulang akun.',
          );
        }
      }
    }

    return oauth2Client;
  }

  /**
   * Generate OAuth authorization URL
   */
  async getAuthUrl(accountId: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new BadRequestException({
        code: 'YOUTUBE_API_NOT_CONFIGURED',
        message: 'YOUTUBE_CLIENT_ID dan YOUTUBE_CLIENT_SECRET belum dikonfigurasi di .env',
      });
    }

    const oauth2Client = await this.createOAuth2Client();
    const state = Buffer.from(JSON.stringify({ accountId })).toString('base64url');

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.readonly',
      ],
      state,
    });

    return url;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<{
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    scope: string;
  }> {
    try {
      const oauth2Client = await this.createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
        scope: tokens.scope || '',
      };
    } catch (error: any) {
      this.logger.error(`Token exchange failed: ${error.message}`);
      throw new BadRequestException('Gagal mendapatkan token YouTube. Coba ulangi proses koneksi.');
    }
  }

  /**
   * Save OAuth tokens to a YouTube account
   */
  async saveTokens(
    accountId: string,
    tokens: { access_token: string; refresh_token: string; expiry_date: number },
  ) {
    await this.accountsRepo.update(accountId, {
      youtubeAccessToken: tokens.access_token,
      youtubeRefreshToken: tokens.refresh_token,
      youtubeTokenExpiresAt: new Date(tokens.expiry_date),
      isApiConnected: true,
    });

    this.logger.log(`YouTube OAuth tokens saved for account ${accountId}`);
  }

  /**
   * Disconnect YouTube OAuth from an account
   */
  async disconnect(accountId: string) {
    await this.accountsRepo.update(accountId, {
      youtubeAccessToken: null,
      youtubeRefreshToken: null,
      youtubeTokenExpiresAt: null,
      isApiConnected: false,
    });

    this.logger.log(`YouTube OAuth disconnected for account ${accountId}`);
  }

  /**
   * Upload video to YouTube using the Data API v3
   */
  async uploadVideo(
    account: YoutubeAccount,
    filePath: string,
    title: string,
    description: string,
    privacyStatus: 'public' | 'private' | 'unlisted' = 'public',
    tags?: string[],
    categoryId: string = '22', // People & Blogs
  ): Promise<{ videoId: string; videoUrl: string }> {
    const oauth2Client = await this.getAuthenticatedClient(account);
    const google = await getGoogle();
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const fileSize = fs.statSync(filePath).size;
    this.logger.log(
      `Uploading to YouTube: "${title}" (${(fileSize / 1024 / 1024).toFixed(2)} MB) → ${account.channelName}`,
    );

    try {
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: title.substring(0, 100),
            description: description.substring(0, 5000),
            tags: tags || [],
            categoryId,
            defaultLanguage: 'id',
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(filePath),
        },
      });

      const videoId = response.data.id;
      if (!videoId) {
        throw new Error('Upload berhasil tapi videoId tidak ditemukan dalam response');
      }

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      this.logger.log(`Upload successful: ${videoUrl}`);

      return { videoId, videoUrl };
    } catch (error: any) {
      this.logger.error(`YouTube API upload failed: ${error.message}`);

      // Handle specific YouTube API errors
      if (error.code === 403) {
        throw new BadRequestException(
          'Kuota YouTube API habis atau akun tidak memiliki izin upload. Periksa Google Cloud Console.',
        );
      }
      if (error.code === 401) {
        // Token invalid, mark as disconnected
        await this.accountsRepo.update(account.id, {
          isApiConnected: false,
          youtubeAccessToken: null,
          youtubeRefreshToken: null,
          youtubeTokenExpiresAt: null,
        });
        throw new BadRequestException(
          'Sesi YouTube API sudah kedaluwarsa. Silakan hubungkan ulang akun.',
        );
      }

      const msg = error.response?.data?.error?.message || error.message;
      throw new BadRequestException(`Gagal upload video ke YouTube: ${msg}`);
    }
  }

  /**
   * Get channel info for the authenticated account
   */
  async getChannelInfo(account: YoutubeAccount): Promise<{
    channelId: string;
    title: string;
    subscriberCount: string;
    videoCount: string;
  }> {
    const oauth2Client = await this.getAuthenticatedClient(account);
    const google = await getGoogle();
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const response = await youtube.channels.list({
        part: ['snippet', 'statistics'],
        mine: true,
      });

      const channel = response.data.items?.[0];
      if (!channel) {
        throw new Error('Channel tidak ditemukan');
      }

      return {
        channelId: channel.id || '',
        title: channel.snippet?.title || '',
        subscriberCount: channel.statistics?.subscriberCount || '0',
        videoCount: channel.statistics?.videoCount || '0',
      };
    } catch (error: any) {
      this.logger.error(`Get channel info failed: ${error.message}`);
      throw new BadRequestException('Gagal mendapatkan info channel YouTube.');
    }
  }
}
