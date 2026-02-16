import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiktokAccount } from './entities/tiktok-account.entity';
import { TiktokAccountsService } from './tiktok-accounts.service';
import { TiktokAccountsController } from './tiktok-accounts.controller';
import { TiktokApiModule } from '../tiktok-api/tiktok-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TiktokAccount]),
    TiktokApiModule,
  ],
  controllers: [TiktokAccountsController],
  providers: [TiktokAccountsService],
  exports: [TiktokAccountsService],
})
export class TiktokAccountsModule {}
