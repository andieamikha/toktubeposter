import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';
import { TiktokApiService } from './tiktok-api.service';
import { TiktokOauthController } from './tiktok-oauth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TiktokAccount])],
  controllers: [TiktokOauthController],
  providers: [TiktokApiService],
  exports: [TiktokApiService],
})
export class TiktokApiModule {}
