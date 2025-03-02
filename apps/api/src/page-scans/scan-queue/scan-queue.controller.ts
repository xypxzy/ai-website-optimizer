import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScanQueueService } from './scan-queue.service';

@ApiTags('scan-queue')
@Controller('admin/scan-queue')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ScanQueueController {
  constructor(private scanQueueService: ScanQueueService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  @ApiResponse({
    status: 200,
    description: 'Returns the current queue statistics',
  })
  async getQueueStats() {
    return this.scanQueueService.getQueueStats();
  }

  @Post('pause')
  @ApiOperation({ summary: 'Pause the queue' })
  @ApiResponse({
    status: 200,
    description: 'Queue paused successfully',
  })
  async pauseQueue() {
    await this.scanQueueService.pauseQueue();
    return { success: true, message: 'Queue paused successfully' };
  }

  @Post('resume')
  @ApiOperation({ summary: 'Resume the queue' })
  @ApiResponse({
    status: 200,
    description: 'Queue resumed successfully',
  })
  async resumeQueue() {
    await this.scanQueueService.resumeQueue();
    return { success: true, message: 'Queue resumed successfully' };
  }

  @Delete('clear')
  @ApiOperation({ summary: 'Clear the queue' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['waiting', 'active', 'completed', 'failed', 'delayed', 'all'],
    description: 'The status of jobs to clear',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue cleared successfully',
  })
  async clearQueue(
    @Query('status')
    status:
      | 'waiting'
      | 'active'
      | 'completed'
      | 'failed'
      | 'delayed'
      | 'all' = 'all',
  ) {
    await this.scanQueueService.clearQueue(status);
    return {
      success: true,
      message: `Queue cleared successfully (status: ${status})`,
    };
  }
}
