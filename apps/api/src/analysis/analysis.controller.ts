import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnalysisService, ITechnicalAnalysisResult } from './analysis.service';

// DTO для запроса на анализ
class AnalyzePageDto {
  url: string;
  options?: {
    includeBrowserMetrics?: boolean;
    customChecks?: Record<string, boolean>;
  };
}

@ApiTags('analysis')
@Controller('analysis')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get('scans/:scanId')
  @ApiOperation({
    summary: 'Получить результаты технического анализа по ID сканирования',
  })
  @ApiResponse({
    status: 200,
    description: 'Результаты технического анализа',
    type: 'object',
  })
  @ApiResponse({ status: 404, description: 'Сканирование не найдено' })
  async getAnalysisResultsByScanId(
    @Param('scanId') scanId: string,
    @User() user: any,
  ): Promise<ITechnicalAnalysisResult> {
    // Проверяем, что сканирование принадлежит пользователю
    const pageScan = await this.prismaService.pageScan.findUnique({
      where: { id: scanId },
      include: { project: true },
    });

    if (!pageScan || pageScan.project.ownerId !== user.id) {
      throw new Error('Сканирование не найдено или у вас нет доступа к нему');
    }

    // Получаем результаты анализа
    const results = await this.analysisService.getAnalysisResults(scanId);

    if (!results) {
      throw new Error('Результаты анализа не найдены');
    }

    return results;
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Запустить технический анализ страницы' })
  @ApiResponse({
    status: 201,
    description: 'Результаты технического анализа',
    type: 'object',
  })
  async analyzePageByUrl(
    @Body() dto: AnalyzePageDto,
    @User() user: any,
  ): Promise<any> {
    // Создаем новый проект для пользователя, если это первый анализ
    let project = await this.prismaService.project.findFirst({
      where: { ownerId: user.id },
    });

    if (!project) {
      project = await this.prismaService.project.create({
        data: {
          name: 'Мои анализы',
          ownerId: user.id,
        },
      });
    }

    // Создаем новое сканирование
    const pageScan = await this.prismaService.pageScan.create({
      data: {
        url: dto.url,
        status: 'in_progress',
        projectId: project.id,
      },
    });

    try {
      // Получаем HTML страницы
      const response = await fetch(dto.url);
      const html = await response.text();

      // Запускаем анализ
      const results = await this.analysisService.analyzePage(
        {
          url: dto.url,
          html,
        },
        dto.options,
      );

      // Обновляем статус сканирования
      await this.prismaService.pageScan.update({
        where: { id: pageScan.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      return {
        scanId: pageScan.id,
        results,
      };
    } catch (error) {
      // В случае ошибки обновляем статус сканирования
      await this.prismaService.pageScan.update({
        where: { id: pageScan.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }
}
