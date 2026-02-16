import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ContentsService } from './contents.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants';

@Controller('contents')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ContentsController {
  constructor(private contentsService: ContentsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.contentsService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.contentsService.create(dto, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentsService.findOne(id);
  }

  @Get(':id/copy-text')
  getCopyText(@Param('id') id: string) {
    return this.contentsService.getCopyText(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: any) {
    return this.contentsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.contentsService.remove(id);
  }

  @Post('ai-suggest-brief')
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  suggestBrief(@Body() dto: { niche_template: string; drive_url?: string }) {
    return this.contentsService.suggestBrief(dto);
  }

  @Post(':id/ai-generate')
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  generateAi(@Param('id') id: string, @Body() dto?: { custom_prompt?: string }) {
    return this.contentsService.generateAi(id, dto?.custom_prompt);
  }

  @Post(':id/finalize')
  @Roles(UserRole.ADMIN)
  finalize(@Param('id') id: string, @Body() dto: any) {
    return this.contentsService.finalize(id, dto);
  }
}
