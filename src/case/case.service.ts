import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocScope, MemberRole, Prisma, PrStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
import {
  CicdResponseDto,
  ContextResponseDto,
  CreateMeetingResponseDto,
  GraphResponseDto,
  KanbanItemDto,
  NotificationDto,
  OverviewResponseDto,
  PrWebhookResponseDto,
} from './dto/responses.dto';

@Injectable()
export class CaseService {
  constructor(private readonly prisma: PrismaService) {}

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

  getNotifications(query: ProjectRoleQueryDto): Promise<NotificationDto[]> {
    const where: Prisma.NotificationWhereInput = { projectId: query.projectId };

    // customers only see notifications not restricted to manager/developer roles
    if (query.role === MemberRole.customer) {
      where.OR = [{ role: null }, { role: MemberRole.customer }];
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    }) as Promise<NotificationDto[]>;
  }

  async markNotificationRead(id: string): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException(`Notification ${id} not found`);

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    }) as Promise<NotificationDto>;
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

  // ─── Meetings-core ────────────────────────────────────────────────────────

  async createMeeting(dto: CreateMeetingDto): Promise<CreateMeetingResponseDto> {
    const epoch = await this.prisma.epoch.findUnique({ where: { id: dto.epochId } });
    if (!epoch) throw new NotFoundException(`Epoch ${dto.epochId} not found`);

    const id = `m-${Date.now()}`;

    const meeting = await this.prisma.meeting.create({
      data: {
        id,
        title: dto.title,
        epochId: dto.epochId,
        slots: dto.slots,
        pickedSlot: '',
        summary: '',
        ...(dto.taskId && {
          taskLinks: { create: { taskId: dto.taskId } },
        }),
        ...(dto.docId && {
          docs: { connect: { id: dto.docId } },
        }),
      },
      include: {
        taskLinks: { select: { taskId: true } },
        docs: { select: { id: true } },
      },
    });

    // fire-and-forget notification
    void this.createNotification({
      projectId: epoch.projectId,
      type: 'meeting',
      text: `Meeting "${dto.title}" created${dto.taskId ? `, linked to task ${dto.taskId}` : ''}${dto.docId ? `, linked to doc ${dto.docId}` : ''}`,
      entityType: 'meeting',
      entityId: id,
    });

    return {
      meeting: meeting as any,
      inheritedLinks: { taskId: dto.taskId, docId: dto.docId },
    };
  }

  async pickSlot(meetingId: string, dto: PickSlotDto) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException(`Meeting ${meetingId} not found`);
    if (!meeting.slots.includes(dto.slot)) {
      throw new BadRequestException(`Slot "${dto.slot}" is not in available slots: ${meeting.slots.join(', ')}`);
    }

    return this.prisma.meeting.update({
      where: { id: meetingId },
      data: { pickedSlot: dto.slot },
    });
  }

  async updateTranscript(meetingId: string, dto: UpdateTranscriptDto) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException(`Meeting ${meetingId} not found`);

    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        ...(dto.transcript !== undefined && { transcript: dto.transcript }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.recording !== undefined && { recording: dto.recording }),
      },
    });

    const epoch = await this.prisma.epoch.findUnique({ where: { id: meeting.epochId } });
    if (epoch && dto.summary) {
      void this.createNotification({
        projectId: epoch.projectId,
        type: 'meeting',
        text: `Summary added to meeting "${meeting.title}"`,
        entityType: 'meeting',
        entityId: meetingId,
      });
    }

    return updated;
  }

  // ─── CI/CD Webhook ────────────────────────────────────────────────────────

  async handlePrWebhook(dto: PrWebhookDto): Promise<PrWebhookResponseDto> {
    const prStatusMap: Record<string, PrStatus> = {
      opened: PrStatus.opened,
      merged: PrStatus.merged,
      closed: PrStatus.closed,
    };

    // Upsert PR record
    const pr = await this.prisma.pullRequest.upsert({
      where: { id: dto.prId },
      update: { status: prStatusMap[dto.event], taskId: dto.taskId },
      create: { id: dto.prId, taskId: dto.taskId, status: prStatusMap[dto.event] },
    });

    // Auto-set task status on PR merge
    let updatedTask: { id: string; status: TaskStatus } | null = null;
    if (dto.event === 'merged') {
      const task = await this.prisma.task.update({
        where: { id: dto.taskId },
        data: { status: TaskStatus.done },
      });
      updatedTask = { id: task.id, status: task.status };
    }

    // Derive project for notification
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: { epoch: { select: { projectId: true } } },
    });

    const notifText =
      dto.event === 'merged'
        ? `PR ${dto.prId} merged → task ${dto.taskId} auto-moved to done`
        : `PR ${dto.prId} ${dto.event} for task ${dto.taskId}`;

    const notif = await this.createNotification({
      projectId: task?.epoch.projectId ?? 'p1',
      type: 'pr',
      text: notifText,
      entityType: 'pr',
      entityId: dto.prId,
      role: MemberRole.developer,
    });

    return {
      pr: { id: pr.id, status: pr.status },
      task: updatedTask,
      notification: notif as any,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async createNotification(data: {
    projectId: string;
    type: string;
    text: string;
    entityType?: string;
    entityId?: string;
    role?: MemberRole;
  }) {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return this.prisma.notification.create({
      data: {
        id,
        projectId: data.projectId,
        type: data.type,
        text: data.text,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        role: data.role ?? null,
      },
    });
  }

  private scopeWhere(role: MemberRole): Prisma.DocumentWhereInput {
    if (role === MemberRole.customer) {
      return { scope: DocScope.all };
    }

    return {};
  }
}
