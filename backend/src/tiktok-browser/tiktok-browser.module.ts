import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';
import { TiktokBrowserService } from './tiktok-browser.service';
import { TiktokBrowserController } from './tiktok-browser.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TiktokAccount])],
  controllers: [TiktokBrowserController],
  providers: [TiktokBrowserService],
  exports: [TiktokBrowserService],
})
export class TiktokBrowserModule {}
