import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PromptGeneratorModule } from 'src/promt-generator/prompt-generator.module';
import { ContentAnalyzer } from './analyzers/content-analyzer';
import { LinkAnalyzer } from './analyzers/link-analyzer';
import { MobileAnalyzer } from './analyzers/mobile-analyzer';
import { PerformanceAnalyzer } from './analyzers/performance-analyzer';
import { SecurityAnalyzer } from './analyzers/security-analyzer';
import { SeoAnalyzer } from './analyzers/seo-analyzer';
import { StructureAnalyzer } from './analyzers/structure-analyzer';
import { TechnicalAnalysisController } from './technical-analysis.controller';
import { TechnicalAnalysisService } from './technical-analysis.service';

@Module({
  imports: [PrismaModule, PromptGeneratorModule],
  controllers: [TechnicalAnalysisController],
  providers: [
    TechnicalAnalysisService,
    SeoAnalyzer,
    PerformanceAnalyzer,
    StructureAnalyzer,
    LinkAnalyzer,
    MobileAnalyzer,
    ContentAnalyzer,
    SecurityAnalyzer,
  ],
  exports: [TechnicalAnalysisService],
})
export class TechnicalAnalysisModule {}
