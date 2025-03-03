import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PerformanceAnalyzer } from './analyzers/performance-analyzer';
import { SeoAnalyzer } from './analyzers/seo-analyzer';
import { TechnicalAnalysisController } from './technical-analysis.controller';
import { TechnicalAnalysisService } from './technical-analysis.service';

@Module({
  imports: [PrismaModule],
  controllers: [TechnicalAnalysisController],
  providers: [
    TechnicalAnalysisService,
    SeoAnalyzer,
    PerformanceAnalyzer,
    // В реальном проекте здесь будут дополнительные анализаторы:
    // LinkAnalyzer,
    // MobileAnalyzer,
    // ContentAnalyzer,
    // SecurityAnalyzer
  ],
  exports: [TechnicalAnalysisService],
})
export class TechnicalAnalysisModule {}
