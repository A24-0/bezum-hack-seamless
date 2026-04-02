import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import type {
  User,
  Project,
  ProjectMember,
  Epoch,
  Task,
  Document,
  DocumentVersion,
  Meeting,
  PullRequest,
  Release,
  Notification,
  Comment,
  TimeSlot,
  PaginatedResponse,
  CabinetMe,
  CabinetMatchResponse,
  CabinetUser,
} from '../types'

export const api = axios.create({
  baseURL: '/api',
  // IMPORTANT:
  // For JSON requests axios will set the correct Content-Type automatically.
  // For FormData uploads we must not force `application/json`, otherwise FastAPI
  // won't parse the multipart body and returns 422.
  headers: {},
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; user: User }>('/auth/login', { email, password }),
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post<{ access_token: string; user: User }>('/auth/register', data),
  me: () => api.get<User>('/auth/me'),
}

// Projects
export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  get: (id: string) => api.get<Project>(`/projects/${id}`),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  members: (id: string) => api.get<ProjectMember[]>(`/projects/${id}/members`),
  addMember: (id: string, data: { user_id: string; role: string }) =>
    api.post<ProjectMember>(`/projects/${id}/members`, data),
  removeMember: (id: string, userId: string) =>
    api.delete(`/projects/${id}/members/${userId}`),
  updateMember: (id: string, userId: string, data: { role: string }) =>
    api.put<ProjectMember>(`/projects/${id}/members/${userId}`, data),
}

// Epochs
export const epochsApi = {
  list: (projectId: string) => api.get<Epoch[]>(`/projects/${projectId}/epochs`),
  get: (projectId: string, epochId: string) =>
    api.get<Epoch>(`/projects/${projectId}/epochs/${epochId}`),
  create: (projectId: string, data: Partial<Epoch>) =>
    api.post<Epoch>(`/projects/${projectId}/epochs`, data),
  update: (projectId: string, epochId: string, data: Partial<Epoch>) =>
    api.put<Epoch>(`/projects/${projectId}/epochs/${epochId}`, data),
  delete: (projectId: string, epochId: string) =>
    api.delete(`/projects/${projectId}/epochs/${epochId}`),
  createRelease: (projectId: string, epochId: string, data: Partial<Release>) =>
    api.post<Release>(`/projects/${projectId}/epochs/${epochId}/release`, data),
}

// Tasks
export const tasksApi = {
  list: (projectId: string, params?: Record<string, string>) =>
    api.get<Task[]>(`/projects/${projectId}/tasks`, { params }),
  get: (projectId: string, taskId: string) =>
    api.get<Task>(`/projects/${projectId}/tasks/${taskId}`),
  create: (projectId: string, data: Partial<Task>) =>
    api.post<Task>(`/projects/${projectId}/tasks`, data),
  update: (projectId: string, taskId: string, data: Partial<Task>) =>
    api.put<Task>(`/projects/${projectId}/tasks/${taskId}`, data),
  delete: (projectId: string, taskId: string) =>
    api.delete(`/projects/${projectId}/tasks/${taskId}`),
  updateStatus: (projectId: string, taskId: string, status: string) =>
    api.patch<Task>(`/projects/${projectId}/tasks/${taskId}/status`, { status }),
  addWatcher: (projectId: string, taskId: string) =>
    api.post(`/projects/${projectId}/tasks/${taskId}/watch`),
  removeWatcher: (projectId: string, taskId: string) =>
    api.delete(`/projects/${projectId}/tasks/${taskId}/watch`),
  linkedDocuments: (projectId: string, taskId: string) =>
    api.get<Document[]>(`/projects/${projectId}/tasks/${taskId}/documents`),
  linkedPRs: (projectId: string, taskId: string) =>
    api.get<PullRequest[]>(`/projects/${projectId}/tasks/${taskId}/prs`),
  linkedMeetings: (projectId: string, taskId: string) =>
    api.get<Meeting[]>(`/projects/${projectId}/tasks/${taskId}/meetings`),
  activity: (projectId: string, taskId: string) =>
    api.get(`/projects/${projectId}/tasks/${taskId}/activity`),
  comments: (projectId: string, taskId: string) =>
    api.get<Comment[]>(`/projects/${projectId}/tasks/${taskId}/comments`),
  addComment: (projectId: string, taskId: string, content: string) =>
    api.post<Comment>(`/projects/${projectId}/tasks/${taskId}/comments`, { content }),
}

// Documents
export const documentsApi = {
  list: (projectId: string, params?: Record<string, string>) =>
    api.get<Document[]>(`/projects/${projectId}/documents`, { params }),
  get: (projectId: string, docId: string) =>
    api.get<Document>(`/projects/${projectId}/documents/${docId}`),
  create: (projectId: string, data: Partial<Document>) =>
    api.post<Document>(`/projects/${projectId}/documents`, data),
  update: (projectId: string, docId: string, data: Partial<Document>) =>
    api.put<Document>(`/projects/${projectId}/documents/${docId}`, data),
  delete: (projectId: string, docId: string) =>
    api.delete(`/projects/${projectId}/documents/${docId}`),
  approve: (projectId: string, docId: string) =>
    api.post<Document>(`/projects/${projectId}/documents/${docId}/approve`),
  saveVersion: (projectId: string, docId: string, data: { content: Record<string, unknown>; change_summary: string }) =>
    api.post<DocumentVersion>(`/projects/${projectId}/documents/${docId}/versions`, data),
  versions: (projectId: string, docId: string) =>
    api.get<DocumentVersion[]>(`/projects/${projectId}/documents/${docId}/versions`),
  restoreVersion: (projectId: string, docId: string, versionId: string) =>
    api.post<Document>(`/projects/${projectId}/documents/${docId}/versions/${versionId}/restore`),
  linkedTasks: (projectId: string, docId: string) =>
    api.get<Task[]>(`/projects/${projectId}/documents/${docId}/tasks`),
  linkTask: (projectId: string, docId: string, taskId: string) =>
    api.post(`/projects/${projectId}/documents/${docId}/tasks/${taskId}`),
  unlinkTask: (projectId: string, docId: string, taskId: string) =>
    api.delete(`/projects/${projectId}/documents/${docId}/tasks/${taskId}`),
  uploadAttachment: (projectId: string, docId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/projects/${projectId}/documents/${docId}/attachments`, fd)
  },
  downloadAttachment: (projectId: string, docId: string, attachmentId: string) =>
    api.get(`/projects/${projectId}/documents/${docId}/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    }),
  deleteAttachment: (projectId: string, docId: string, attachmentId: string) =>
    api.delete(`/projects/${projectId}/documents/${docId}/attachments/${attachmentId}`),
  exportPlain: (projectId: string, docId: string) =>
    api.get(`/projects/${projectId}/documents/${docId}/export-plain`, { responseType: 'blob' }),
}

// Meetings
export const meetingsApi = {
  list: (projectId: string) => api.get<Meeting[]>(`/projects/${projectId}/meetings`),
  get: (projectId: string, meetingId: string) =>
    api.get<Meeting>(`/projects/${projectId}/meetings/${meetingId}`),
  create: (projectId: string, data: Partial<Meeting> & { time_slots?: string[] }) =>
    api.post<Meeting>(`/projects/${projectId}/meetings`, data),
  update: (projectId: string, meetingId: string, data: Partial<Meeting>) =>
    api.put<Meeting>(`/projects/${projectId}/meetings/${meetingId}`, data),
  delete: (projectId: string, meetingId: string) =>
    api.delete(`/projects/${projectId}/meetings/${meetingId}`),
  proposeTimes: (projectId: string, meetingId: string, slots: string[]) =>
    api.post(`/projects/${projectId}/meetings/${meetingId}/time-proposals`, { slots }),
  voteSlot: (projectId: string, meetingId: string, proposalId: string, available = true) =>
    api.post(`/projects/${projectId}/meetings/${meetingId}/time-proposals/${proposalId}/vote`, { available }),
  finalizeTime: (projectId: string, meetingId: string, proposalId?: string) =>
    api.post<Meeting>(`/projects/${projectId}/meetings/${meetingId}/finalize-time`, { proposal_id: proposalId }),
  uploadTranscript: (projectId: string, meetingId: string, transcript: string) =>
    api.post<Meeting>(`/projects/${projectId}/meetings/${meetingId}/transcript`, { transcript }),
  summarize: (projectId: string, meetingId: string) =>
    api.post<Meeting>(`/projects/${projectId}/meetings/${meetingId}/summarize`),
  updateRsvp: (projectId: string, meetingId: string, rsvp: string) =>
    api.post(`/projects/${projectId}/meetings/${meetingId}/rsvp`, { rsvp }),
}

// CI/CD
export const cicdApi = {
  listPRs: (projectId: string) => api.get<PullRequest[]>(`/projects/${projectId}/prs`),
  getPR: (projectId: string, prId: string) =>
    api.get<PullRequest>(`/projects/${projectId}/prs/${prId}`),
  linkPRToTask: (projectId: string, prId: string, taskId: string) =>
    api.post(`/projects/${projectId}/prs/${prId}/link`, { task_id: taskId }),
  listReleases: (projectId: string) =>
    api.get<Release[]>(`/projects/${projectId}/releases`),
  syncGitHub: (projectId: string) =>
    api.post<{ status: string; message?: string; synced: number; total_from_gitlab: number }>(
      `/projects/${projectId}/sync`
    ),
}

// Admin (роль admin)
export const adminApi = {
  stats: () =>
    api.get<{
      users: number
      projects: number
      tasks: number
      epochs: number
      documents: number
      meetings: number
      tasks_by_status?: Record<string, number>
      documents_by_status?: Record<string, number>
      epochs_by_status?: Record<string, number>
    }>('/admin/stats'),
  users: () =>
    api.get<
      {
        id: number
        email: string
        name: string
        role: string
        is_active: boolean
        created_at: string
      }[]
    >('/admin/users'),
  updateUser: (
    userId: number,
    data: { name?: string; role?: string; is_active?: boolean }
  ) => api.patch(`/admin/users/${userId}`, data),
}

// Notifications
export const notificationsApi = {
  list: () => api.get<Notification[]>('/notifications'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
}

// Cabinet (personal profile + tech stack)
export const cabinetApi = {
  me: () => api.get<CabinetMe>('/cabinet/me'),
  updateMe: (data: { name?: string; git_repo_url?: string | null; techs: string[] }) =>
    api.put<CabinetMe>('/cabinet/me', data),
  user: (userId: number) => api.get<CabinetUser>(`/cabinet/users/${userId}`),
  techs: () => api.get<{ techs: string[] }>('/cabinet/techs'),
  matchByTech: (techs: string) =>
    api.get<CabinetMatchResponse>('/cabinet/match', {
      params: { techs },
    }),
}

// AI assistant
export const aiApi = {
  chat: (message: string, projectId?: number) =>
    api.post<{ answer: string }>('/ai/chat', { message, project_id: projectId }),
  summarizeDocument: (text: string) => api.post<{ summary: string }>('/ai/summarize-document', { text }),
}

// Users (for member search)
export const usersApi = {
  search: (query: string) => api.get<User[]>('/users/search', { params: { q: query } }),
}
