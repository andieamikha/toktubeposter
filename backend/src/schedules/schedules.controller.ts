import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SchedulesService } from './schedules.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants';

@Controller('schedules')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SchedulesController {
  constructor(private schedulesService: SchedulesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.schedulesService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.schedulesService.create(dto, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schedulesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: any) {
    return this.schedulesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  cancel(@Param('id') id: string) {
    return this.schedulesService.cancel(id);
  }

  @Post(':id/mark-done')
  markDone(
    @Param('id') id: string,
    @Body('tiktok_url') tiktokUrl: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.schedulesService.markDone(id, tiktokUrl, userId);
  }
}
