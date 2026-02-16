import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkBatch } from './entities/bulk-batch.entity';
import { ScheduledPost } from '../schedules/entities/scheduled-post.entity';
import { Content } from '../contents/entities/content.entity';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';
import { BulkService } from './bulk.service';
import { BulkController } from './bulk.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BulkBatch, ScheduledPost, Content, TiktokAccount])],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}
