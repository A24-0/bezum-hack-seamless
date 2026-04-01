import { MemberRole, PrStatus, TaskStatus } from '@prisma/client';

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
