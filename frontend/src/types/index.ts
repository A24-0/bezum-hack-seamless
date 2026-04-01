export interface User {
  id: string
  email: string
  name: string
  role: 'manager' | 'developer' | 'customer'
  avatar_url?: string
}

export interface Project {
  id: string
  name: string
  description: string
  status: 'active' | 'archived' | 'completed'
  gitlab_repo_url?: string
  created_at: string
  updated_at: string
  member_count?: number
  epoch_count?: number
  progress?: number
}

export interface ProjectMember {
  id: string
  project_id: string
  user: User
  role: 'manager' | 'developer' | 'customer'
  joined_at: string
}

export type EpochStatus = 'planning' | 'active' | 'completed' | 'cancelled'

export interface Epoch {
  id: string
  project_id: string
  name: string
  goals: string
  start_date: string
  end_date: string
  status: EpochStatus
  progress?: number
  task_count?: number
  completed_task_count?: number
}

export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'needs_info'
  | 'review'
  | 'done'

export interface TaskLabel {
  id: string
  name: string
  color: string
}

export interface Task {
  id: string
  project_id: string
  epoch_id?: string
  title: string
  description?: string
  status: TaskStatus
  assignee?: User
  reporter: User
  due_date?: string
  labels: TaskLabel[]
  watcher_count?: number
  watchers?: User[]
  linked_pr_count?: number
  linked_meeting_count?: number
  created_at: string
  updated_at: string
}

export type DocumentVisibility = 'public' | 'managers_devs' | 'managers_only'
export type DocumentStatus = 'draft' | 'review' | 'approved' | 'archived'

export interface Document {
  id: string
  project_id: string
  epoch_id?: string
  title: string
  content: Record<string, unknown>
  visibility: DocumentVisibility
  status: DocumentStatus
  current_version: number
  created_by: User
  updated_at: string
  created_at: string
}

export interface DocumentVersion {
  id: string
  document_id: string
  version_num: number
  content: Record<string, unknown>
  created_by: User
  created_at: string
  change_summary: string
  meeting?: Meeting
}

export type MeetingStatus =
  | 'scheduling'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export interface MeetingParticipant {
  id: string
  user: User
  rsvp: 'accepted' | 'declined' | 'tentative' | 'pending'
}

export interface TimeSlot {
  id: string
  meeting_id: string
  proposed_at: string
  vote_count: number
  has_voted?: boolean
}

export interface Meeting {
  id: string
  project_id: string
  task_id?: string
  title: string
  description?: string
  status: MeetingStatus
  scheduled_at?: string
  duration_minutes?: number
  summary?: string
  transcript?: string
  jitsi_room_id: string
  participants: MeetingParticipant[]
  linked_documents?: Document[]
  time_slots?: TimeSlot[]
  created_by: User
  created_at: string
}

export type PRStatus = 'open' | 'merged' | 'closed' | 'draft'

export interface PullRequest {
  id: string
  project_id: string
  task_id?: string
  task?: Task
  gitlab_pr_id: number
  title: string
  url: string
  status: PRStatus
  source_branch: string
  target_branch: string
  author: User
  created_at: string
  updated_at: string
}

export interface Release {
  id: string
  project_id: string
  epoch_id?: string
  epoch?: Epoch
  version_tag: string
  description: string
  gitlab_release_url?: string
  created_at: string
  created_by: User
}

export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'document_updated'
  | 'document_approved'
  | 'meeting_scheduled'
  | 'meeting_reminder'
  | 'pr_merged'
  | 'comment_added'
  | 'mention'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  entity_type: string
  entity_id: string
  is_read: boolean
  created_at: string
}

export interface ActivityItem {
  id: string
  type: 'status_change' | 'document_update' | 'pr_update' | 'comment' | 'assignment'
  user: User
  description: string
  created_at: string
  metadata?: Record<string, unknown>
}

export interface Comment {
  id: string
  task_id: string
  user: User
  content: string
  created_at: string
  updated_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}
