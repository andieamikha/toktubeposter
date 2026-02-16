import {
  Controller, Post, Get, Param, Body, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants';
import { YoutubeBrowserService } from './youtube-browser.service';

@Controller('youtube-browser')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class YoutubeBrowserController {
  constructor(private browserService: YoutubeBrowserService) {}

  /**
   * Login using email + password
   * POST /youtube-browser/:accountId/login-credentials
   */
  @Post(':accountId/login-credentials')
  @Roles(UserRole.ADMIN)
  async loginWithCredentials(
    @Param('accountId') accountId: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    await this.browserService.saveCredentials(accountId, 'credentials', { email, password });
    return this.browserService.loginWithCredentials(accountId);
  }

  /**
   * Login using cookies
   * POST /youtube-browser/:accountId/login-cookies
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
   * Verify login status
   * GET /youtube-browser/:accountId/verify
   */
  @Get(':accountId/verify')
  @Roles(UserRole.ADMIN)
  async verifyLogin(@Param('accountId') accountId: string) {
    return this.browserService.verifyLogin(accountId);
  }

  /**
   * Clear login
   * POST /youtube-browser/:accountId/logout
   */
  @Post(':accountId/logout')
  @Roles(UserRole.ADMIN)
  async logout(@Param('accountId') accountId: string) {
    await this.browserService.clearLogin(accountId);
    return { message: 'Login data YouTube berhasil dihapus.' };
  }

  /**
   * Upload video to YouTube via browser
   * POST /youtube-browser/:accountId/upload
   */
  @Post(':accountId/upload')
  @Roles(UserRole.ADMIN)
  async uploadVideo(
    @Param('accountId') accountId: string,
    @Body() body: { video_path: string; title: string; description: string },
  ) {
    return this.browserService.uploadVideo(accountId, body.video_path, body.title, body.description);
  }
}
