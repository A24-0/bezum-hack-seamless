import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaseService } from './case.service';
import {
  EpochQueryDto,
  EpochRoleQueryDto,
  ProjectEpochRoleQueryDto,
  ProjectQueryDto,
} from './dto/case-query.dto';

@ApiTags('case')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('case')
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @ApiOperation({ summary: 'Get projects and epochs context' })
  @Get('context')
  getContext() {
    return this.caseService.getContext();
  }

  @ApiOperation({ summary: 'Get overview metrics by epoch and role' })
  @Get('overview')
  getOverview(@Query() query: ProjectEpochRoleQueryDto) {
    return this.caseService.getOverview(query);
  }

  @ApiOperation({ summary: 'Get docs list with scope filtering' })
  @Get('docs')
  getDocs(@Query() query: EpochRoleQueryDto) {
    return this.caseService.getDocs(query);
  }

  @ApiOperation({ summary: 'Get kanban tasks by epoch' })
  @Get('kanban')
  getKanban(@Query() query: EpochQueryDto) {
    return this.caseService.getKanban(query);
  }

  @ApiOperation({ summary: 'Get meeting list by epoch' })
  @Get('meetings')
  getMeetings(@Query() query: EpochQueryDto) {
    return this.caseService.getMeetings(query);
  }

  @ApiOperation({ summary: 'Get ci/cd section by epoch' })
  @Get('cicd')
  getCicd(@Query() query: EpochQueryDto) {
    return this.caseService.getCicd(query);
  }

  @ApiOperation({ summary: 'Get notifications by project' })
  @Get('notifications')
  getNotifications(@Query() query: ProjectQueryDto) {
    return this.caseService.getNotifications(query);
  }

  @ApiOperation({ summary: 'Get entity graph links by role' })
  @Get('graph')
  getGraph(@Query() query: ProjectEpochRoleQueryDto) {
    return this.caseService.getGraph(query);
  }
}
