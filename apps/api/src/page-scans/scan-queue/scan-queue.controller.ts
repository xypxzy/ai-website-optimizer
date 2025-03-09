import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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
}
