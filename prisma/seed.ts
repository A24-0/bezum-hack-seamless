import { PrismaClient, MemberRole, PrStatus, TaskStatus, UserRole, DocStatus, DocScope } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin12345';

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: UserRole.admin,
    },
  });

  await prisma.project.upsert({ where: { id: 'p1' }, update: { name: 'N Platform' }, create: { id: 'p1', name: 'N Platform' } });
  await prisma.project.upsert({ where: { id: 'p2' }, update: { name: 'N Analytics' }, create: { id: 'p2', name: 'N Analytics' } });

  await prisma.membership.upsert({
    where: { userId_projectId: { userId: admin.id, projectId: 'p1' } },
    update: { role: MemberRole.manager },
    create: { userId: admin.id, projectId: 'p1', role: MemberRole.manager },
  });

  await prisma.epoch.upsert({ where: { id: 'e1' }, update: { name: 'Epoch 1: Discovery', projectId: 'p1' }, create: { id: 'e1', name: 'Epoch 1: Discovery', projectId: 'p1' } });
  await prisma.epoch.upsert({ where: { id: 'e2' }, update: { name: 'Epoch 2: Delivery', projectId: 'p1' }, create: { id: 'e2', name: 'Epoch 2: Delivery', projectId: 'p1' } });
  await prisma.epoch.upsert({ where: { id: 'e3' }, update: { name: 'Epoch 1: Migration', projectId: 'p2' }, create: { id: 'e3', name: 'Epoch 1: Migration', projectId: 'p2' } });

  await prisma.meeting.upsert({
    where: { id: 'm1' },
    update: {
      title: 'Kickoff + BRD',
      epochId: 'e1',
      slots: ['10:00', '11:00', '16:00'],
      pickedSlot: '11:00',
      summary: 'Согласовали цели эпохи и критерии acceptance.',
      transcript: 'PM: Добрый день всем. Сегодня обсуждаем цели первой эпохи.\nDev: Предлагаю зафиксировать entity map как первый deliverable.\nPM: Принято. Acceptance criteria — покрытие всех сущностей из BRD.',
    },
    create: {
      id: 'm1',
      title: 'Kickoff + BRD',
      epochId: 'e1',
      slots: ['10:00', '11:00', '16:00'],
      pickedSlot: '11:00',
      summary: 'Согласовали цели эпохи и критерии acceptance.',
      transcript: 'PM: Добрый день всем. Сегодня обсуждаем цели первой эпохи.\nDev: Предлагаю зафиксировать entity map как первый deliverable.\nPM: Принято. Acceptance criteria — покрытие всех сущностей из BRD.',
    },
  });

  await prisma.meeting.upsert({
    where: { id: 'm2' },
    update: {
      title: 'Tech sync',
      epochId: 'e1',
      slots: ['12:00', '14:00'],
      pickedSlot: '14:00',
      summary: 'Решили сделать журнал версий и автопривязку документов.',
      transcript: 'Dev: Нужен журнал версий для docs — клиент хочет видеть историю изменений.\nPM: Добавляем в scope. Также нужна автопривязка по #task-id в тексте документа.',
      recording: 'https://meet.example.com/recordings/m2.mp4',
    },
    create: {
      id: 'm2',
      title: 'Tech sync',
      epochId: 'e1',
      slots: ['12:00', '14:00'],
      pickedSlot: '14:00',
      summary: 'Решили сделать журнал версий и автопривязку документов.',
      transcript: 'Dev: Нужен журнал версий для docs — клиент хочет видеть историю изменений.\nPM: Добавляем в scope. Также нужна автопривязка по #task-id в тексте документа.',
      recording: 'https://meet.example.com/recordings/m2.mp4',
    },
  });

  await prisma.document.upsert({
    where: { id: 'd1' },
    update: {
      title: 'BRD: Общие требования',
      epochId: 'e1',
      scope: DocScope.all,
      status: DocStatus.approved,
      version: 5,
      linkedMeetingId: 'm1',
    },
    create: {
      id: 'd1',
      title: 'BRD: Общие требования',
      epochId: 'e1',
      scope: DocScope.all,
      status: DocStatus.approved,
      version: 5,
      linkedMeetingId: 'm1',
    },
  });

  await prisma.document.upsert({
    where: { id: 'd2' },
    update: {
      title: 'Tech spec: согласование docs',
      epochId: 'e1',
      scope: DocScope.manager_developer,
      status: DocStatus.review,
      version: 2,
      linkedMeetingId: 'm2',
    },
    create: {
      id: 'd2',
      title: 'Tech spec: согласование docs',
      epochId: 'e1',
      scope: DocScope.manager_developer,
      status: DocStatus.review,
      version: 2,
      linkedMeetingId: 'm2',
    },
  });

  await prisma.task.upsert({ where: { id: 't1' }, update: { title: 'Карта сущностей', epochId: 'e1', status: TaskStatus.todo, docQuote: 'BRD v5 §Entity' }, create: { id: 't1', title: 'Карта сущностей', epochId: 'e1', status: TaskStatus.todo, docQuote: 'BRD v5 §Entity' } });
  await prisma.task.upsert({ where: { id: 't2' }, update: { title: 'Flow согласования docs', epochId: 'e1', status: TaskStatus.in_progress, docQuote: 'Tech spec v2 §Approval' }, create: { id: 't2', title: 'Flow согласования docs', epochId: 'e1', status: TaskStatus.in_progress, docQuote: 'Tech spec v2 §Approval' } });
  await prisma.task.upsert({ where: { id: 't3' }, update: { title: 'Автосуммаризация встреч', epochId: 'e1', status: TaskStatus.review, docQuote: 'Meeting m2 summary' }, create: { id: 't3', title: 'Автосуммаризация встреч', epochId: 'e1', status: TaskStatus.review, docQuote: 'Meeting m2 summary' } });
  await prisma.task.upsert({ where: { id: 't4' }, update: { title: 'Релиз эпохи', epochId: 'e1', status: TaskStatus.done, docQuote: 'Release checklist' }, create: { id: 't4', title: 'Релиз эпохи', epochId: 'e1', status: TaskStatus.done, docQuote: 'Release checklist' } });

  await prisma.taskDocument.upsert({ where: { taskId_documentId: { taskId: 't1', documentId: 'd1' } }, update: {}, create: { taskId: 't1', documentId: 'd1' } });
  await prisma.taskDocument.upsert({ where: { taskId_documentId: { taskId: 't2', documentId: 'd1' } }, update: {}, create: { taskId: 't2', documentId: 'd1' } });
  await prisma.taskDocument.upsert({ where: { taskId_documentId: { taskId: 't2', documentId: 'd2' } }, update: {}, create: { taskId: 't2', documentId: 'd2' } });

  await prisma.taskMeeting.upsert({ where: { taskId_meetingId: { taskId: 't1', meetingId: 'm1' } }, update: {}, create: { taskId: 't1', meetingId: 'm1' } });
  await prisma.taskMeeting.upsert({ where: { taskId_meetingId: { taskId: 't2', meetingId: 'm2' } }, update: {}, create: { taskId: 't2', meetingId: 'm2' } });
  await prisma.taskMeeting.upsert({ where: { taskId_meetingId: { taskId: 't3', meetingId: 'm2' } }, update: {}, create: { taskId: 't3', meetingId: 'm2' } });

  await prisma.pullRequest.upsert({ where: { id: '!42' }, update: { taskId: 't2', status: PrStatus.opened }, create: { id: '!42', taskId: 't2', status: PrStatus.opened } });
  await prisma.pullRequest.upsert({ where: { id: '!51' }, update: { taskId: 't3', status: PrStatus.merged }, create: { id: '!51', taskId: 't3', status: PrStatus.merged } });
  await prisma.pullRequest.upsert({ where: { id: '!57' }, update: { taskId: 't4', status: PrStatus.merged }, create: { id: '!57', taskId: 't4', status: PrStatus.merged } });

  await prisma.release.upsert({ where: { id: 'r1' }, update: { epochId: 'e1', name: 'Release Epoch 1', tasksDone: 3, total: 4 }, create: { id: 'r1', epochId: 'e1', name: 'Release Epoch 1', tasksDone: 3, total: 4 } });

  await prisma.notification.upsert({
    where: { id: 'n1' },
    update: { projectId: 'p1', type: 'doc', text: '@dev изменил d2 -> review', entityType: 'doc', entityId: 'd2', role: MemberRole.manager },
    create: { id: 'n1', projectId: 'p1', type: 'doc', text: '@dev изменил d2 -> review', entityType: 'doc', entityId: 'd2', role: MemberRole.manager },
  });
  await prisma.notification.upsert({
    where: { id: 'n2' },
    update: { projectId: 'p1', type: 'pr', text: 'PR !42 opened → task t2 linked', entityType: 'pr', entityId: '!42', role: MemberRole.developer },
    create: { id: 'n2', projectId: 'p1', type: 'pr', text: 'PR !42 opened → task t2 linked', entityType: 'pr', entityId: '!42', role: MemberRole.developer },
  });
  await prisma.notification.upsert({
    where: { id: 'n3' },
    update: { projectId: 'p1', type: 'pr', text: 'PR !51 merged → task t3 auto-moved to done', entityType: 'pr', entityId: '!51', role: MemberRole.developer },
    create: { id: 'n3', projectId: 'p1', type: 'pr', text: 'PR !51 merged → task t3 auto-moved to done', entityType: 'pr', entityId: '!51', role: MemberRole.developer },
  });
  await prisma.notification.upsert({
    where: { id: 'n4' },
    update: { projectId: 'p1', type: 'meeting', text: 'Summary added to meeting "Tech sync"', entityType: 'meeting', entityId: 'm2', role: null },
    create: { id: 'n4', projectId: 'p1', type: 'meeting', text: 'Summary added to meeting "Tech sync"', entityType: 'meeting', entityId: 'm2', role: null },
  });

  console.log(`Seed complete. Admin: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
