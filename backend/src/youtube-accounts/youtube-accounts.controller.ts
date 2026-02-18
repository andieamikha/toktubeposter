import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { YoutubeAccountsService } from './youtube-accounts.service';
import { YoutubeApiService } from '../youtube-api/youtube-api.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/constants';

@Controller('youtube-accounts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class YoutubeAccountsController {
  constructor(
    private accountsService: YoutubeAccountsService,
    private youtubeApiService: YoutubeApiService,
  ) {}

  @Get()
  findAll(@Query() query: { niche?: string; operator_id?: string }) {
    return this.accountsService.findAll(query);
  }

  /**
   * Get YouTube API configuration status
   * GET /youtube-accounts/api/status
   * Must be defined BEFORE :id route
   */
  @Get('api/status')
  getApiStatus() {
    return {
      configured: this.youtubeApiService.isConfigured(),
    };
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: any) {
    return this.accountsService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: any) {
    return this.accountsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.accountsService.remove(id);
  }

  // === YouTube API OAuth endpoints ===

  /**
   * Get OAuth authorization URL for a YouTube account
   * GET /youtube-accounts/:id/api/auth-url
   */
  @Get(':id/api/auth-url')
  @Roles(UserRole.ADMIN)
  async getAuthUrl(@Param('id') id: string) {
    const url = await this.youtubeApiService.getAuthUrl(id);
    return { url };
  }

  /**
   * Disconnect YouTube API OAuth from an account
   * POST /youtube-accounts/:id/api/disconnect
   */
  @Post(':id/api/disconnect')
  @Roles(UserRole.ADMIN)
  async disconnectApi(@Param('id') id: string) {
    await this.youtubeApiService.disconnect(id);
    return { message: 'YouTube API berhasil diputuskan.' };
  }

  /**
   * Get channel info via YouTube API
   * GET /youtube-accounts/:id/api/channel-info
   */
  @Get(':id/api/channel-info')
  @Roles(UserRole.ADMIN)
  async getChannelInfo(@Param('id') id: string) {
    const account = await this.accountsService.findOne(id);
    return this.youtubeApiService.getChannelInfo(account);
  }
}
