import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SchedulesService } from '../schedules/schedules.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('my-tasks')
@UseGuards(AuthGuard('jwt'))
export class TasksController {
  constructor(private schedulesService: SchedulesService) {}

  @Get()
  getMyTasks(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    return this.schedulesService.getMyTasks(userId, date);
  }

  @Get(':id')
  getTaskDetail(@Param('id') id: string) {
    return this.schedulesService.findOne(id);
  }
}
