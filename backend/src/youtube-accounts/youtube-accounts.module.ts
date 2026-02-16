import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YoutubeAccount } from './entities/youtube-account.entity';
import { YoutubeAccountsService } from './youtube-accounts.service';
import { YoutubeAccountsController } from './youtube-accounts.controller';
import { YoutubeApiModule } from '../youtube-api/youtube-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([YoutubeAccount]),
    YoutubeApiModule,
  ],
  controllers: [YoutubeAccountsController],
  providers: [YoutubeAccountsService],
  exports: [YoutubeAccountsService, TypeOrmModule],
})
export class YoutubeAccountsModule {}
