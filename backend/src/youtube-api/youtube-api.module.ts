import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YoutubeAccount } from '../youtube-accounts/entities/youtube-account.entity';
import { YoutubeApiService } from './youtube-api.service';
import { YoutubeOauthController } from './youtube-oauth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([YoutubeAccount])],
  controllers: [YoutubeOauthController],
  providers: [YoutubeApiService],
  exports: [YoutubeApiService],
})
export class YoutubeApiModule {}
