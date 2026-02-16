import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconcilerProcessor } from './jobs/reconciler.processor';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private reconciler: ReconcilerProcessor,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runReconciler() {
    await this.reconciler.process();
    this.logger.debug('Reconciler run completed');
  }
}
