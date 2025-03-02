import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../common/decorators/user.decorator';
import {
  CreateProjectDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
    type: ProjectResponseDto,
  })
  createProject(@User() user, @Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all projects for user' })
  @ApiResponse({
    status: 200,
    description: 'Returns all projects for the user',
    type: [ProjectResponseDto],
  })
  getAllProjects(@User() user) {
    return this.projectsService.findAllProjects(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the project details',
    type: ProjectResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getProjectById(@Param('id') id: string, @User() user) {
    return this.projectsService.findProjectById(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project' })
  @ApiResponse({
    status: 200,
    description: 'Project updated successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateProject(
    @Param('id') id: string,
    @User() user,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.updateProject(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  deleteProject(@Param('id') id: string, @User() user) {
    return this.projectsService.deleteProject(id, user.id);
  }
}
