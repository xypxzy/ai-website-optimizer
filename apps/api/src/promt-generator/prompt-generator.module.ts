import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PromptGeneratorService } from '../promt-generator/prompt-generator.service';
import { PromptGeneratorController } from './prompt-generator.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PromptGeneratorController],
  providers: [PromptGeneratorService],
  exports: [PromptGeneratorService],
})
export class PromptGeneratorModule {}
