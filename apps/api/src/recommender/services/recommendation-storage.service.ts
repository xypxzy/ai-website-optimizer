import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IRecommendation } from '../interfaces/recommender.interface';

@Injectable()
export class RecommendationStorageService {
  private readonly logger = new Logger(RecommendationStorageService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Stores recommendations for a prompt in the database
   */
  async storeRecommendations(
    promptId: string,
    recommendations: IRecommendation[],
  ): Promise<void> {
    try {
      // Check if the prompt exists
      const prompt = await this.prisma.prompt.findUnique({
        where: { id: promptId },
      });

      if (!prompt) {
        throw new Error(`Prompt with ID ${promptId} not found`);
      }

      // Delete existing recommendations for this prompt
      await this.prisma.recommendation.deleteMany({
        where: { promptId },
      });

      // First, find element IDs for all recommendations
      const recommendationsWithElementIds = await Promise.all(
        recommendations.map(async (recommendation) => {
          const elementId = await this.findRelevantElementId(
            recommendation,
            prompt.pageScanId,
          );
          return {
            ...recommendation,
            elementId,
          };
        }),
      );

      // Then create all recommendations in a transaction
      await this.prisma.$transaction(
        recommendationsWithElementIds.map((recommendation) => {
          return this.prisma.recommendation.create({
            data: {
              promptId,
              category: recommendation.category,
              type: this.mapCategoryToType(recommendation.category),
              priority: this.mapPriorityToDatabaseValue(
                recommendation.priority,
              ),
              description: recommendation.description,
              // Include expected effect in the reasoning field
              reasoning: `${recommendation.rationale}\n\nExpected Effect: ${this.formatExpectedEffect(recommendation.expectedEffect)}`,
              implementation: recommendation.implementation,
              elementId: recommendation.elementId,
              // Optional fields
              previewUrl: null,
            },
          });
        }),
      );

      this.logger.log(
        `Stored ${recommendations.length} recommendations for prompt ${promptId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error storing recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Maps a category to a type (improve, fix, or optimize)
   */
  private mapCategoryToType(category: string): string {
    category = category.toLowerCase();

    if (
      category.includes('bug') ||
      category.includes('error') ||
      category.includes('critical')
    ) {
      return 'fix';
    } else if (
      category.includes('performance') ||
      category.includes('speed') ||
      category.includes('optimization')
    ) {
      return 'optimize';
    } else {
      return 'improve';
    }
  }

  /**
   * Maps priority values to database values
   */
  private mapPriorityToDatabaseValue(
    priority: 'high' | 'medium' | 'low',
  ): string {
    switch (priority) {
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Find a relevant element ID based on the recommendation content
   * This is a simplistic implementation - in a real system, you would use more
   * sophisticated techniques like selector matching or content similarity
   */
  private async findRelevantElementId(
    recommendation: IRecommendation,
    pageScanId: string,
  ): Promise<string | null> {
    try {
      // Look for elements that match the recommendation by type/category
      const matchingElements = await this.prisma.element.findMany({
        where: {
          pageScanId,
          type: {
            contains: recommendation.category,
            mode: 'insensitive',
          },
        },
        take: 1,
      });

      return matchingElements.length > 0 ? matchingElements[0].id : null;
    } catch (error) {
      this.logger.warn(`Error finding relevant element: ${error.message}`);
      return null;
    }
  }

  /**
   * Format the expected effect text for consistency
   */
  private formatExpectedEffect(effect: string): string {
    if (!effect) return 'Improved user experience';

    // Ensure the effect starts with a capital letter and ends with a period
    let formatted = effect.trim();
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    if (!formatted.endsWith('.')) formatted += '.';

    return formatted;
  }
}
