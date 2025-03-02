import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePageScanDto } from './dto/page-scan.dto';

@Injectable()
export class PageScansService {
  constructor(private prisma: PrismaService) {}

  async createPageScan(
    projectId: string,
    userId: string,
    dto: CreatePageScanDto,
  ) {
    // Проверка существования проекта и доступа к нему
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Создание сканирования
    const pageScan = await this.prisma.pageScan.create({
      data: {
        url: dto.url,
        status: 'pending',
        projectId,
      },
    });

    // В реальной имплементации здесь будет запуск процесса сканирования
    // Например, через очередь задач или вызов сервиса сканирования

    return pageScan;
  }

  async findAllPageScans(projectId: string, userId: string) {
    // Проверка существования проекта и доступа к нему
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return this.prisma.pageScan.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findPageScanById(id: string, userId: string) {
    const pageScan = await this.prisma.pageScan.findUnique({
      where: { id },
      include: {
        project: true,
        elements: true,
        seoAnalysis: true,
        technicalAnalysis: true,
        linkAnalysis: true,
        mobileAnalysis: true,
        contentAnalysis: true,
        securityAnalysis: true,
        prompts: {
          include: {
            recommendations: {
              include: {
                preview: true,
              },
            },
          },
        },
      },
    });

    if (!pageScan) {
      throw new NotFoundException('Page scan not found');
    }

    if (pageScan.project.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this page scan');
    }

    return pageScan;
  }
}
