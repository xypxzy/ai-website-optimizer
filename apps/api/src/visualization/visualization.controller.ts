import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../common/decorators/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { VisualizationService } from './visualization.service';

// DTO для создания визуализации
class CreateVisualizationDto {
  recommendationId: string;
  forceRefresh?: boolean;
}

@ApiTags('visualization')
@Controller('visualization')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VisualizationController {
  constructor(
    private visualizationService: VisualizationService,
    private prismaService: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create visualization for a recommendation' })
  @ApiResponse({
    status: 201,
    description: 'Visualization created successfully',
  })
  async createVisualization(
    @Body() dto: CreateVisualizationDto,
    @User() user: any,
  ): Promise<any> {
    // Проверяем доступ пользователя к рекомендации
    const recommendation = await this.prismaService.recommendation.findUnique({
      where: { id: dto.recommendationId },
      include: {
        prompt: {
          include: {
            pageScan: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (
      !recommendation ||
      recommendation.prompt.pageScan.project.ownerId !== user.id
    ) {
      throw new Error('Recommendation not found or unauthorized');
    }

    // Создаем визуализацию
    const previewId = await this.visualizationService.createVisualization(
      dto.recommendationId,
    );

    return {
      success: true,
      previewId,
      message: 'Visualization created successfully',
    };
  }

  @Get(':recommendationId')
  @ApiOperation({ summary: 'Get visualization for a recommendation' })
  @ApiResponse({
    status: 200,
    description: 'Returns visualization data',
  })
  async getVisualization(
    @Param('recommendationId') recommendationId: string,
    @User() user: any,
  ): Promise<any> {
    // Проверяем доступ пользователя к рекомендации
    const recommendation = await this.prismaService.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
        prompt: {
          include: {
            pageScan: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (
      !recommendation ||
      recommendation.prompt.pageScan.project.ownerId !== user.id
    ) {
      throw new Error('Recommendation not found or unauthorized');
    }

    // Получаем визуализацию
    return this.visualizationService.getVisualization(recommendationId);
  }
}
