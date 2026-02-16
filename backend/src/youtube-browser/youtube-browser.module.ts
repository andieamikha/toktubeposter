import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YoutubeAccount } from '../youtube-accounts/entities/youtube-account.entity';
import { YoutubeBrowserService } from './youtube-browser.service';
import { YoutubeBrowserController } from './youtube-browser.controller';

@Module({
  imports: [TypeOrmModule.forFeature([YoutubeAccount])],
  controllers: [YoutubeBrowserController],
  providers: [YoutubeBrowserService],
  exports: [YoutubeBrowserService],
})
export class YoutubeBrowserModule {}
