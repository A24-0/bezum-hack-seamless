import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScenarioResponseDto } from './dto/responses.dto';

@Injectable()
export class CaseScenarioService {
  constructor(private readonly prisma: PrismaService) {}

  async run(type: 'task-meeting' | 'doc-approve' | 'pr-sync'): Promise<ScenarioResponseDto> {
    if (type === 'task-meeting') {
      return {
        action: 'Create meeting from task',
        result: {
          meeting: 'm-new',
          inheritedLinks: 'doc:d2,epoch:e1',
          status: 'scheduled',
        },
      };
    }

    if (type === 'doc-approve') {
      const doc = await this.prisma.document.update({
        where: { id: 'd2' },
        data: { status: 'approved', version: { increment: 1 } },
      });

      return {
        action: 'Approve doc changes',
        result: {
          doc: doc.id,
          status: doc.status,
          version: doc.version,
        },
      };
    }

    await this.prisma.pullRequest.update({
      where: { id: '!51' },
      data: { status: 'merged' },
    });
    await this.prisma.task.update({ where: { id: 't3' }, data: { status: TaskStatus.done } });

    return {
      action: 'PR sync',
      result: {
        pr: '!51',
        prStatus: 'merged',
        task: 't3',
        taskStatus: 'done',
      },
    };
  }
}
