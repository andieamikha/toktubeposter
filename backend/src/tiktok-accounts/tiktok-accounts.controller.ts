import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TiktokAccountsService } from './tiktok-accounts.service';
import { TiktokApiService } from '../tiktok-api/tiktok-api.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/constants';

@Controller('tiktok-accounts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TiktokAccountsController {
  constructor(
    private accountsService: TiktokAccountsService,
    private tiktokApiService: TiktokApiService,
  ) {}

  @Get()
  findAll(@Query() query: { niche?: string; operator_id?: string }) {
    return this.accountsService.findAll(query);
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

  @Post('bulk-reassign')
  @Roles(UserRole.ADMIN)
  bulkReassign(@Body() dto: { operator_id: string; account_ids: string[] }) {
    return this.accountsService.bulkReassign(dto.operator_id, dto.account_ids);
  }

  /**
   * Get TikTok OAuth authorization URL for an account
   * POST /tiktok-accounts/:id/connect
   */
  @Post(':id/connect')
  @Roles(UserRole.ADMIN)
  async connectTikTok(@Param('id') id: string) {
    // Verify the account exists
    await this.accountsService.findOne(id);
    const authUrl = this.tiktokApiService.getAuthUrl(id);
    return { auth_url: authUrl };
  }

  /**
   * Disconnect TikTok OAuth from an account
   * POST /tiktok-accounts/:id/disconnect
   */
  @Post(':id/disconnect')
  @Roles(UserRole.ADMIN)
  async disconnectTikTok(@Param('id') id: string) {
    await this.accountsService.findOne(id);
    await this.tiktokApiService.disconnect(id);
    return { message: 'TikTok API berhasil diputuskan dari akun ini.' };
  }

  /**
   * Check TikTok API configuration status
   * GET /tiktok-accounts/api-status
   */
  @Get('api-status')
  @Roles(UserRole.ADMIN)
  getApiStatus() {
    return {
      configured: this.tiktokApiService.isConfigured(),
    };
  }
}
