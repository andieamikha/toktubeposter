import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { YoutubeApiService } from './youtube-api.service';

/**
 * Handles YouTube OAuth callback (no auth guard — Google redirects here)
 */
@Controller('youtube-oauth')
export class YoutubeOauthController {
  private readonly logger = new Logger(YoutubeOauthController.name);

  constructor(
    private youtubeApiService: YoutubeApiService,
    private config: ConfigService,
  ) {}

  /**
   * OAuth callback from Google
   * Google redirects user here after authorization
   * GET /youtube-oauth/callback?code=xxx&state=xxx
   */
  @Get('callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');

    if (error) {
      this.logger.warn(`YouTube OAuth denied: ${error}`);
      return res.redirect(
        `${frontendUrl}/dashboard/youtube-accounts?oauth=error&message=${encodeURIComponent(error)}`,
      );
    }

    try {
      // Decode state to get accountId
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      const accountId = stateData.accountId;

      if (!accountId) {
        throw new Error('accountId not found in state');
      }

      // Exchange code for tokens
      const tokens = await this.youtubeApiService.exchangeCodeForTokens(code);

      // Save tokens to the YouTube account
      await this.youtubeApiService.saveTokens(accountId, tokens);

      this.logger.log(`YouTube OAuth success for account ${accountId}`);

      // Redirect to frontend with success
      return res.redirect(`${frontendUrl}/dashboard/youtube-accounts?oauth=success`);
    } catch (err: any) {
      this.logger.error(`YouTube OAuth callback error: ${err.message}`);
      return res.redirect(
        `${frontendUrl}/dashboard/youtube-accounts?oauth=error&message=${encodeURIComponent(err.message)}`,
      );
    }
  }
}
