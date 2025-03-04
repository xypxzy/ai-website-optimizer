import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { IRecommenderResponse } from './interfaces/recommender.interface';
import { RecommenderService } from './recommender.service';

// DTO for requesting recommendations generation
class GenerateRecommendationsDto {
  promptId: string;
  forceFresh?: boolean;
}

@ApiTags('recommender')
@Controller('recommendations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RecommenderController {
  constructor(
    private recommenderService: RecommenderService,
    private prismaService: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Generate recommendations for a prompt' })
  @ApiResponse({
    status: 201,
    description: 'Recommendations generated successfully',
  })
  async generateRecommendations(
    @Body() dto: GenerateRecommendationsDto,
    @User() user: any,
  ): Promise<IRecommenderResponse> {
    // Check if the user has access to the prompt
    const prompt = await this.prismaService.prompt.findUnique({
      where: { id: dto.promptId },
      include: {
        pageScan: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!prompt || prompt.pageScan.project.ownerId !== user.id) {
      throw new Error('Prompt not found or unauthorized');
    }

    // Generate recommendations
    return this.recommenderService.generateRecommendations(
      dto.promptId,
      dto.forceFresh || false,
    );
  }

  @Get(':promptId')
  @ApiOperation({ summary: 'Get recommendations for a prompt' })
  @ApiParam({ name: 'promptId', description: 'ID of the prompt' })
  @ApiResponse({
    status: 200,
    description: 'Returns all recommendations for the prompt',
  })
  async getRecommendations(
    @Param('promptId') promptId: string,
    @User() user: any,
  ): Promise<any[]> {
    // Check if the user has access to the prompt
    const prompt = await this.prismaService.prompt.findUnique({
      where: { id: promptId },
      include: {
        pageScan: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!prompt || prompt.pageScan.project.ownerId !== user.id) {
      throw new Error('Prompt not found or unauthorized');
    }

    // Get recommendations
    return this.recommenderService.getRecommendationsForPrompt(promptId);
  }

  @Post('refresh/:promptId')
  @ApiOperation({ summary: 'Refresh recommendations for a prompt' })
  @ApiParam({ name: 'promptId', description: 'ID of the prompt' })
  @ApiResponse({
    status: 201,
    description: 'Recommendations refreshed successfully',
  })
  async refreshRecommendations(
    @Param('promptId') promptId: string,
    @User() user: any,
  ): Promise<IRecommenderResponse> {
    // Check if the user has access to the prompt
    const prompt = await this.prismaService.prompt.findUnique({
      where: { id: promptId },
      include: {
        pageScan: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!prompt || prompt.pageScan.project.ownerId !== user.id) {
      throw new Error('Prompt not found or unauthorized');
    }

    // Refresh recommendations
    return this.recommenderService.refreshRecommendations(promptId);
  }

  @Get('usage-statistics')
  @ApiOperation({ summary: 'Get LLM API usage statistics' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month'], required: false })
  @ApiResponse({
    status: 200,
    description: 'Returns usage statistics for the specified period',
  })
  async getUsageStatistics(
    @User() user: any,
    @Query('period') period?: 'day' | 'week' | 'month',
  ): Promise<any> {
    return this.recommenderService.getUsageStatistics(
      user.id,
      period || 'month',
    );
  }
}
