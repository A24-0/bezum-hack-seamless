import { Injectable } from '@nestjs/common';
import { DocScope, MemberRole, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EpochQueryDto,
  EpochRoleQueryDto,
  ProjectEpochRoleQueryDto,
  ProjectQueryDto,
} from './dto/case-query.dto';
import {
  CicdResponseDto,
  ContextResponseDto,
  GraphResponseDto,
  KanbanItemDto,
  OverviewResponseDto,
} from './dto/responses.dto';

@Injectable()
export class CaseService {
  constructor(private readonly prisma: PrismaService) {}

  resolveMemberRole(userRole: UserRole, requestedRole?: MemberRole): MemberRole {
    if (userRole === UserRole.admin) {
      return requestedRole ?? MemberRole.manager;
    }

    return MemberRole.developer;
  }

  async getContext(): Promise<ContextResponseDto> {
    const [projects, epochs] = await Promise.all([
      this.prisma.project.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.epoch.findMany({ orderBy: { id: 'asc' } }),
    ]);

    return { projects, epochs };
  }

  async getOverview(query: ProjectEpochRoleQueryDto): Promise<OverviewResponseDto> {
    const where = this.scopeWhere(query.role);
    const [docs, tasks, meetings] = await Promise.all([
      this.prisma.document.count({ where: { epochId: query.epochId, ...where } }),
      this.prisma.task.count({ where: { epochId: query.epochId } }),
      this.prisma.meeting.count({ where: { epochId: query.epochId } }),
    ]);

    return { docs, tasks, meetings, projectId: query.projectId, epochId: query.epochId, role: query.role };
  }

  getDocs(query: EpochRoleQueryDto) {
    return this.prisma.document.findMany({
      where: { epochId: query.epochId, ...this.scopeWhere(query.role) },
      include: {
        taskLinks: { select: { taskId: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  async getKanban(query: EpochQueryDto): Promise<KanbanItemDto[]> {
    return this.prisma.task.findMany({
      where: { epochId: query.epochId },
      include: { pr: { select: { id: true } } },
      orderBy: { id: 'asc' },
    });
  }

  getMeetings(query: EpochQueryDto) {
    return this.prisma.meeting.findMany({
      where: { epochId: query.epochId },
      include: {
        taskLinks: { select: { taskId: true } },
        docs: { select: { id: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  async getCicd(query: EpochQueryDto): Promise<CicdResponseDto> {
    const [prs, releases] = await Promise.all([
      this.prisma.pullRequest.findMany({
        where: { task: { epochId: query.epochId } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.release.findMany({ where: { epochId: query.epochId }, orderBy: { id: 'asc' } }),
    ]);

    return { prs, releases };
  }

  getNotifications(query: ProjectQueryDto) {
    return this.prisma.notification.findMany({
      where: { projectId: query.projectId },
      orderBy: { id: 'asc' },
    });
  }

  async getGraph(query: ProjectEpochRoleQueryDto): Promise<GraphResponseDto> {
    const [docs, tasks, meetings] = await Promise.all([
      this.prisma.document.findMany({
        where: { epochId: query.epochId, ...this.scopeWhere(query.role) },
        include: { taskLinks: true },
      }),
      this.prisma.task.findMany({ where: { epochId: query.epochId }, include: { pr: true } }),
      this.prisma.meeting.findMany({ where: { epochId: query.epochId }, include: { taskLinks: true } }),
    ]);

    return {
      role: query.role,
      projectId: query.projectId,
      epochId: query.epochId,
      links: {
        docs_to_tasks: docs.map((doc) => ({
          doc: doc.id,
          tasks: doc.taskLinks.map((item) => item.taskId),
        })),
        docs_to_meetings: docs.map((doc) => ({
          doc: doc.id,
          meeting: doc.linkedMeetingId,
        })),
        tasks_to_prs: tasks.map((task) => ({ task: task.id, pr: task.pr?.id ?? null })),
        meetings_to_summary: meetings.map((meeting) => ({
          meeting: meeting.id,
          summary: meeting.summary,
        })),
      },
    };
  }

  private scopeWhere(role: MemberRole): Prisma.DocumentWhereInput {
    if (role === MemberRole.customer) {
      return { scope: DocScope.all };
    }

    return {};
  }
}
