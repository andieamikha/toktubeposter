import {
  Controller, Post, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { BulkService } from './bulk.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants';

@Controller('bulk')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class BulkController {
  constructor(private bulkService: BulkService) {}

  @Post('preview')
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  preview(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.bulkService.preview(dto, userId);
  }

  @Post(':batchId/publish')
  publish(@Param('batchId') batchId: string, @CurrentUser('id') userId: string) {
    return this.bulkService.publish(batchId, userId);
  }

  @Delete(':batchId')
  cancel(@Param('batchId') batchId: string) {
    return this.bulkService.cancelBatch(batchId);
  }
}
