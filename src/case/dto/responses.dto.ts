export type MemberRole = 'customer' | 'developer' | 'manager';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type PrStatus = 'opened' | 'merged' | 'closed';

export interface ContextResponseDto {
  projects: Array<{ id: string; name: string }>;
  epochs: Array<{ id: string; name: string; projectId: string }>;
}

export interface OverviewResponseDto {
  docs: number;
  tasks: number;
  meetings: number;
  projectId: string;
  epochId: string;
  role: MemberRole;
}

export interface GraphResponseDto {
  role: MemberRole;
  projectId: string;
  epochId: string;
  links: {
    docs_to_tasks: Array<{ doc: string; tasks: string[] }>;
    docs_to_meetings: Array<{ doc: string; meeting: string | null }>;
    tasks_to_prs: Array<{ task: string; pr: string | null }>;
    meetings_to_summary: Array<{ meeting: string; summary: string }>;
  };
}

export interface ScenarioResponseDto {
  action: string;
  result: Record<string, string | number | boolean>;
}

export interface CicdResponseDto {
  prs: Array<{ id: string; taskId: string; status: PrStatus }>;
  releases: Array<{ id: string; name: string; epochId: string; tasksDone: number; total: number }>;
}

export interface KanbanItemDto {
  id: string;
  title: string;
  epochId: string;
  status: TaskStatus;
  docQuote: string;
  pr: { id: string } | null;
}

export interface MeetingDto {
  id: string;
  title: string;
  epochId: string;
  slots: string[];
  pickedSlot: string;
  summary: string;
  transcript: string | null;
  recording: string | null;
  taskLinks: Array<{ taskId: string }>;
  docs: Array<{ id: string }>;
}

export interface NotificationDto {
  id: string;
  projectId: string;
  type: string;
  text: string;
  entityType: string | null;
  entityId: string | null;
  role: MemberRole | null;
  read: boolean;
  createdAt: Date;
}

export interface PrWebhookResponseDto {
  pr: { id: string; status: PrStatus };
  task: { id: string; status: TaskStatus } | null;
  notification: NotificationDto;
}

export interface CreateMeetingResponseDto {
  meeting: MeetingDto;
  inheritedLinks: { taskId?: string; docId?: string };
}
