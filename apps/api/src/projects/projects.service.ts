import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async createProject(ownerId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        ...dto,
        ownerId,
      },
    });
  }

  async findAllProjects(userId: string) {
    return this.prisma.project.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findProjectById(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        pageScans: {
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            url: true,
            status: true,
            createdAt: true,
            completedAt: true,
            screenshotUrl: true,
          },
        },
        siteStructureAnalysis: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return project;
  }

  async updateProject(id: string, userId: string, dto: UpdateProjectDto) {
    // Проверка существования проекта и доступа к нему
    await this.findProjectById(id, userId);

    return this.prisma.project.update({
      where: { id },
      data: dto,
    });
  }

  async deleteProject(id: string, userId: string) {
    // Проверка существования проекта и доступа к нему
    await this.findProjectById(id, userId);

    return this.prisma.project.delete({
      where: { id },
    });
  }
}
