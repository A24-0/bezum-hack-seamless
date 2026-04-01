import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaseService } from './case.service';
import {
  CreateMeetingDto,
  EpochQueryDto,
  EpochRoleQueryDto,
  PickSlotDto,
  ProjectEpochRoleQueryDto,
  ProjectRoleQueryDto,
  PrWebhookDto,
  UpdateTranscriptDto,
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

  // ─── Meetings ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get meeting list by epoch' })
  @Get('meetings')
  getMeetings(@Query() query: EpochQueryDto) {
    return this.caseService.getMeetings(query);
  }

  @ApiOperation({ summary: 'Create meeting with optional task/doc inheritance' })
  @Post('meetings')
  createMeeting(@Body() dto: CreateMeetingDto) {
    return this.caseService.createMeeting(dto);
  }

  @ApiOperation({ summary: 'Pick a time slot for the meeting' })
  @Patch('meetings/:id/slot')
  pickSlot(@Param('id') id: string, @Body() dto: PickSlotDto) {
    return this.caseService.pickSlot(id, dto);
  }

  @ApiOperation({ summary: 'Store transcript/summary/recording for a meeting' })
  @Patch('meetings/:id/transcript')
  updateTranscript(@Param('id') id: string, @Body() dto: UpdateTranscriptDto) {
    return this.caseService.updateTranscript(id, dto);
  }

  // ─── CI/CD ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get ci/cd section by epoch' })
  @Get('cicd')
  getCicd(@Query() query: EpochQueryDto) {
    return this.caseService.getCicd(query);
  }

  @ApiOperation({ summary: 'Git webhook: PR opened/merged/closed → auto-sync task status' })
  @Post('webhook/pr')
  prWebhook(@Body() dto: PrWebhookDto) {
    return this.caseService.handlePrWebhook(dto);
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get notification feed filtered by project and role' })
  @Get('notifications')
  getNotifications(@Query() query: ProjectRoleQueryDto) {
    return this.caseService.getNotifications(query);
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Patch('notifications/:id/read')
  markRead(@Param('id') id: string) {
    return this.caseService.markNotificationRead(id);
  }

  // ─── Graph ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get entity graph links by role' })
  @Get('graph')
  getGraph(@Query() query: ProjectEpochRoleQueryDto) {
    return this.caseService.getGraph(query);
  }
}
