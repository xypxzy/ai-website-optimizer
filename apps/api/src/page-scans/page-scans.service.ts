import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePageScanDto } from './dto/page-scan.dto';
import { ScanQueueService } from './scan-queue/scan-queue.service';

@Injectable()
export class PageScansService {
  constructor(
    private prisma: PrismaService,
    private scanQueueService: ScanQueueService,
  ) {}

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

    // Создание сканирования с начальным статусом "pending"
    const pageScan = await this.prisma.pageScan.create({
      data: {
        url: dto.url,
        status: 'pending',
        projectId,
      },
    });

    // Добавляем задачу в очередь сканирования
    await this.scanQueueService.addScanJob(pageScan.id);

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

  async cancelPageScan(id: string, userId: string) {
    // Проверка доступа к сканированию
    const pageScan = await this.findPageScanById(id, userId);

    if (['completed', 'failed', 'cancelled'].includes(pageScan.status)) {
      throw new ForbiddenException(
        `Cannot cancel scan with status: ${pageScan.status}`,
      );
    }

    // Отменяем задачу в очереди
    const canceled = await this.scanQueueService.cancelScanJob(id);

    if (!canceled) {
      // Если задача не была найдена в очереди, но статус активный,
      // обновляем статус напрямую
      if (['pending', 'queued', 'in_progress'].includes(pageScan.status)) {
        await this.prisma.pageScan.update({
          where: { id },
          data: {
            status: 'cancelled',
            completedAt: new Date(),
          },
        });
      }
    }

    return { success: true, message: 'Scan cancelled successfully' };
  }
}
