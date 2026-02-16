import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduledPost])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
