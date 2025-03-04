import { Module } from '@nestjs/common';
import { AnalysisModule } from './analysis/analysis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BullBoardModule } from './bull/bull-board.module';
import { BullModule } from './bull/bull.module';
import { ConfigModule } from './config/config.module';
import { CrawlerModule } from './crawler/crawler.module';
import { PageScansModule } from './page-scans/page-scans.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { PromptGeneratorModule } from './promt-generator/prompt-generator.module';
import { RecommenderModule } from './recommender/recommender.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    BullModule,
    BullBoardModule,
    AuthModule,
    ProjectsModule,
    PageScansModule,
    CrawlerModule,
    AnalysisModule,
    PromptGeneratorModule,
    RecommenderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
