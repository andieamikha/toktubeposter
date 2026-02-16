import {
  Controller, Post, Get, Param, Body, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants';
import { TiktokBrowserService } from './tiktok-browser.service';

@Controller('tiktok-browser')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TiktokBrowserController {
  constructor(private browserService: TiktokBrowserService) {}

  /**
   * Login to TikTok using username + password
   * POST /tiktok-browser/:accountId/login-credentials
   */
  @Post(':accountId/login-credentials')
  @Roles(UserRole.ADMIN)
  async loginWithCredentials(
    @Param('accountId') accountId: string,
    @Body('password') password: string,
  ) {
    // Save credentials first
    await this.browserService.saveCredentials(accountId, 'credentials', { password });
    // Then try to login
    return this.browserService.loginWithCredentials(accountId);
  }

  /**
   * Login to TikTok using cookies
   * POST /tiktok-browser/:accountId/login-cookies
   */
  @Post(':accountId/login-cookies')
  @Roles(UserRole.ADMIN)
  async loginWithCookies(
    @Param('accountId') accountId: string,
    @Body('cookies') cookies: string,
  ) {
    return this.browserService.loginWithCookies(accountId, cookies);
  }

  /**
   * Verify if the browser session is still logged in
   * GET /tiktok-browser/:accountId/verify
   */
  @Get(':accountId/verify')
  @Roles(UserRole.ADMIN)
  async verifyLogin(@Param('accountId') accountId: string) {
    return this.browserService.verifyLogin(accountId);
  }

  /**
   * Clear all login data for an account
   * POST /tiktok-browser/:accountId/logout
   */
  @Post(':accountId/logout')
  @Roles(UserRole.ADMIN)
  async logout(@Param('accountId') accountId: string) {
    await this.browserService.clearLogin(accountId);
    return { message: 'Login data berhasil dihapus.' };
  }

  /**
   * Upload video to TikTok via browser
   * POST /tiktok-browser/:accountId/upload
   * Body: { video_path: string, caption: string }
   */
  @Post(':accountId/upload')
  @Roles(UserRole.ADMIN)
  async uploadVideo(
    @Param('accountId') accountId: string,
    @Body() body: { video_path: string; caption: string },
  ) {
    return this.browserService.uploadVideo(accountId, body.video_path, body.caption);
  }
}
