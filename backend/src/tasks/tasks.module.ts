import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [SchedulesModule],
  controllers: [TasksController],
})
export class TasksModule {}
