import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisualizationService } from '../visualization/visualization.service';
import {
  IPromptTemplate,
  IRecommenderResponse,
} from './interfaces/recommender.interface';
import { OpenAIService } from './services/openai.service';
import { RecommendationStorageService } from './services/recommendation-storage.service';
import { RecommenderCacheService } from './services/recommender-cache.service';

@Injectable()
export class RecommenderService {
  private readonly logger = new Logger(RecommenderService.name);
  private readonly promptTemplates: Record<string, IPromptTemplate> = {
    seo: {
      systemPrompt:
        'You are an expert SEO specialist. Analyze the provided website data and generate specific, actionable SEO recommendations.',
      userPromptSuffix:
        '\n\nFormat your response as JSON with an array of recommendations, each containing: category, priority, description, solution, rationale, implementation, and expectedEffect.',
      responseFormat: { type: 'json_object' },
    },
    performance: {
      systemPrompt:
        'You are an expert web performance engineer. Analyze the provided website data and generate specific, actionable performance optimization recommendations.',
      userPromptSuffix:
        '\n\nFormat your response as JSON with an array of recommendations, each containing: category, priority, description, solution, rationale, implementation, and expectedEffect.',
      responseFormat: { type: 'json_object' },
    },
    general: {
      systemPrompt:
        'You are an expert web developer, designer, and SEO specialist. Analyze the provided website data and generate specific, actionable recommendations for improvement.',
      userPromptSuffix:
        '\n\nFormat your response as JSON with an array of recommendations, each containing: category, priority, description, solution, rationale, implementation, and expectedEffect.',
      responseFormat: { type: 'json_object' },
    },
  };

  constructor(
    private openaiService: OpenAIService,
    private recommenderCacheService: RecommenderCacheService,
    private recommendationStorageService: RecommendationStorageService,
    private visualizationService: VisualizationService,
    private prisma: PrismaService,
  ) {}

  /**
   * Generates recommendations for a prompt, using cache if available
   */
  async generateRecommendations(
    promptId: string,
    forceFresh = false,
  ): Promise<IRecommenderResponse> {
    try {
      // Get the prompt from the database
      const prompt = await this.prisma.prompt.findUnique({
        where: { id: promptId },
      });

      if (!prompt) {
        throw new Error(`Prompt with ID ${promptId} not found`);
      }

      const promptText = prompt.promptText;
      const promptType = prompt.targetUse || 'general';
      const promptTemplate =
        this.promptTemplates[promptType] || this.promptTemplates.general;

      // Check cache first (unless forced to generate fresh)
      if (!forceFresh) {
        const cachedResponse =
          await this.recommenderCacheService.getCachedResponse(promptText);
        if (cachedResponse) {
          // Store the cached recommendations in the database
          await this.recommendationStorageService.storeRecommendations(
            promptId,
            cachedResponse.recommendations,
          );
          return cachedResponse;
        }
      }

      // Generate new recommendations
      const response = await this.openaiService.generateRecommendations(
        promptText,
        promptTemplate,
      );

      // Store recommendations in the database
      await this.recommendationStorageService.storeRecommendations(
        promptId,
        response.recommendations,
      );

      // Cache the response
      await this.recommenderCacheService.cacheResponse(promptText, response);

      // Update the prompt with the generation timestamp
      await this.prisma.prompt.update({
        where: { id: promptId },
        data: {
          updatedAt: new Date(),
        },
      });

      return response;
    } catch (error) {
      this.logger.error(
        `Error generating recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Retrieves recommendations from the database for a prompt
   */
  async getRecommendationsForPrompt(promptId: string): Promise<any[]> {
    try {
      const recommendations = await this.prisma.recommendation.findMany({
        where: { promptId },
        include: {
          preview: true,
          element: {
            select: {
              id: true,
              type: true,
              selector: true,
              screenshot: true,
            },
          },
        },
        orderBy: [
          { priority: 'asc' }, // High priority first (assuming 'high' sorts before 'medium' and 'low')
          { category: 'asc' },
        ],
      });

      return recommendations;
    } catch (error) {
      this.logger.error(
        `Error getting recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createVisualizationsForRecommendations(
    recommendations: any[],
  ): Promise<void> {
    try {
      // Для каждой рекомендации создаем визуализацию
      for (const recommendation of recommendations) {
        try {
          await this.visualizationService.createVisualization(
            recommendation.id,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to create visualization for recommendation ${recommendation.id}: ${error.message}`,
          );
          // Продолжаем с другими рекомендациями даже если одна не удалась
        }
      }
    } catch (error) {
      this.logger.error(
        `Error creating visualizations: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Clear cache and generate fresh recommendations
   */
  async refreshRecommendations(
    promptId: string,
  ): Promise<IRecommenderResponse> {
    try {
      const prompt = await this.prisma.prompt.findUnique({
        where: { id: promptId },
      });

      if (!prompt) {
        throw new Error(`Prompt with ID ${promptId} not found`);
      }

      // Clear the cached response
      await this.recommenderCacheService.clearCachedResponse(prompt.promptText);

      // Generate fresh recommendations
      return this.generateRecommendations(promptId, true);
    } catch (error) {
      this.logger.error(
        `Error refreshing recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Returns usage statistics for LLM API calls
   */
  async getUsageStatistics(
    userId: string,
    period: 'day' | 'week' | 'month' = 'month',
  ): Promise<any> {
    try {
      // This would typically query a separate table tracking API usage
      // For this example, we'll return mock data
      return {
        totalRequests: 42,
        totalTokens: 156789,
        estimatedCost: 0.32,
        period,
      };
    } catch (error) {
      this.logger.error(
        `Error getting usage statistics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
