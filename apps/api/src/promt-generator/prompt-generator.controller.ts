import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  IGeneratedPrompt,
  PromptGeneratorService,
} from './prompt-generator.service';

@ApiTags('prompts')
@Controller('prompts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PromptGeneratorController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly promptGeneratorService: PromptGeneratorService,
  ) {}

  @Get('scans/:scanId')
  @ApiOperation({
    summary: 'Получить все промпты для сканирования',
    description:
      'Возвращает список сгенерированных промптов для указанного сканирования',
  })
  @ApiResponse({
    status: 200,
    description: 'Список промптов',
    type: 'array',
  })
  @ApiResponse({ status: 404, description: 'Сканирование не найдено' })
  async getPromptsByScanId(
    @Param('scanId') scanId: string,
    @User() user: any,
  ): Promise<IGeneratedPrompt[]> {
    // Проверяем, что сканирование принадлежит пользователю
    const pageScan = await this.prismaService.pageScan.findUnique({
      where: { id: scanId },
      include: { project: true },
    });

    if (!pageScan || pageScan.project.ownerId !== user.id) {
      throw new Error('Сканирование не найдено или у вас нет доступа к нему');
    }

    // Получаем промпты для сканирования
    return this.promptGeneratorService.getPromptsByScanId(scanId);
  }

  @Get(':promptId')
  @ApiOperation({
    summary: 'Получить промпт по ID',
    description: 'Возвращает детальную информацию о промпте по его ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Информация о промпте',
    type: 'object',
  })
  @ApiResponse({ status: 404, description: 'Промпт не найден' })
  async getPromptById(
    @Param('promptId') promptId: string,
    @User() user: any,
  ): Promise<any> {
    // Получаем промпт и проверяем доступ
    const prompt = await this.prismaService.prompt.findUnique({
      where: { id: promptId },
      include: {
        pageScan: {
          include: { project: true },
        },
      },
    });

    if (!prompt || prompt.pageScan.project.ownerId !== user.id) {
      throw new Error('Промпт не найден или у вас нет доступа к нему');
    }

    // Возвращаем информацию о промпте
    return {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      promptText: prompt.promptText,
      targetUse: prompt.targetUse,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
      pageScanId: prompt.pageScanId,
    };
  }
}
