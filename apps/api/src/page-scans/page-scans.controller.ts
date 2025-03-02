import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../common/decorators/user.decorator';
import { CreatePageScanDto, PageScanResponseDto } from './dto/page-scan.dto';
import { PageScansService } from './page-scans.service';

@ApiTags('page-scans')
@Controller('projects/:projectId/scans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PageScansController {
  constructor(private pageScansService: PageScansService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new page scan' })
  @ApiResponse({
    status: 201,
    description: 'Page scan created successfully',
    type: PageScanResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createPageScan(
    @Param('projectId') projectId: string,
    @User() user,
    @Body() dto: CreatePageScanDto,
  ) {
    return this.pageScansService.createPageScan(projectId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all page scans for a project' })
  @ApiResponse({
    status: 200,
    description: 'Returns all page scans for the project',
    type: [PageScanResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getAllPageScans(@Param('projectId') projectId: string, @User() user) {
    return this.pageScansService.findAllPageScans(projectId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get page scan by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the page scan details',
    type: PageScanResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Page scan not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getPageScanById(@Param('id') id: string, @User() user) {
    return this.pageScansService.findPageScanById(id, user.id);
  }
}
