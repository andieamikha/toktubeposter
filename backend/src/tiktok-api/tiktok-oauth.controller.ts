import { Controller, Get, Query, Res, UseGuards, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { TiktokApiService } from './tiktok-api.service';

/**
 * Handles TikTok OAuth callback (no auth guard — TikTok redirects here)
 */
@Controller('tiktok-oauth')
export class TiktokOauthController {
  private readonly logger = new Logger(TiktokOauthController.name);

  constructor(
    private tiktokApiService: TiktokApiService,
    private config: ConfigService,
  ) {}

  /**
   * OAuth callback from TikTok
   * TikTok redirects user here after authorization
   * GET /tiktok-oauth/callback?code=xxx&state=xxx
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
      this.logger.warn(`OAuth denied: ${error}`);
      return res.redirect(`${frontendUrl}/dashboard/accounts?oauth=error&message=${encodeURIComponent(error)}`);
    }

    try {
      // Decode state to get accountId
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      const accountId = stateData.accountId;

      if (!accountId) {
        throw new Error('accountId not found in state');
      }

      // Exchange code for tokens
      const tokens = await this.tiktokApiService.exchangeCodeForTokens(code);

      // Save tokens to the TikTok account
      await this.tiktokApiService.saveTokens(accountId, tokens);

      this.logger.log(`TikTok OAuth success for account ${accountId}`);

      // Redirect to frontend with success
      return res.redirect(`${frontendUrl}/dashboard/accounts?oauth=success`);
    } catch (err: any) {
      this.logger.error(`OAuth callback error: ${err.message}`);
      return res.redirect(`${frontendUrl}/dashboard/accounts?oauth=error&message=${encodeURIComponent(err.message)}`);
    }
  }
}
