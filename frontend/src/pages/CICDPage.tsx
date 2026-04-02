import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GitPullRequest,
  RefreshCw,
  ExternalLink,
  Link2,
  Shield,
  Copy,
  CheckCircle2,
  Rocket,
  AlertCircle,
  Lock,
} from 'lucide-react'
import { cicdApi, tasksApi, projectsApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useUIStore } from '../stores/uiStore'
import type { PullRequest, Release, Task, Project } from '../types'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import { invalidateProjectScopedData } from '../lib/invalidateProjectQueries'

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text)
}

export default function CICDPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const [linkByPrId, setLinkByPrId] = useState<Record<number, string>>({})
  const [githubRepo, setGithubRepo] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then((r) => r.data as Project),
    enabled: !!projectId,
  })

  useEffect(() => {
    if (project?.gitlab_repo_url != null && project.gitlab_repo_url !== undefined) {
      setGithubRepo(String(project.gitlab_repo_url))
    } else {
      setGithubRepo('')
    }
  }, [project?.gitlab_repo_url])

  const { data: prs = [], isLoading, isError } = useQuery({
    queryKey: ['prs', projectId],
    queryFn: () => cicdApi.listPRs(projectId!).then((r) => r.data as PullRequest[]),
    enabled: !!projectId,
  })
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', projectId],
    queryFn: () => cicdApi.listReleases(projectId!).then((r) => r.data as Release[]),
    enabled: !!projectId,
  })
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!).then((r) => r.data as Task[]),
    enabled: !!projectId,
  })

  const saveGithubRepo = useMutation({
    mutationFn: () => {
      const v = githubRepo.trim()
      if (!v) throw new Error('bad-repo')
      // В БД сейчас поле называется `gitlab_repo_url`, но используем его для GitHub repo URL/full_name.
      return projectsApi.update(projectId!, { gitlab_repo_url: v }).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      addToast({ type: 'success', title: 'GitHub repo сохранён' })
    },
    onError: (e: any) => {
      if (e?.message === 'bad-repo') {
        addToast({ type: 'error', title: 'Введите GitHub repo (owner/repo или URL)' })
        return
      }
      addToast({ type: 'error', title: 'Не удалось сохранить' })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => cicdApi.syncGitHub(projectId!),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['prs', projectId] })
      // После CI/CD синка данные по задачам/релизам/документам должны обновиться в UI
      invalidateProjectScopedData(qc, projectId)
      // Обновить прогресс в основном списке проектов (main menu)
      qc.invalidateQueries({ queryKey: ['projects'] })
      const d = res.data
      addToast({
        type: 'success',
        title: d.message || 'Синхронизация выполнена',
        body: `Обработано PR: ${d.synced} из ${d.total_from_gitlab}`,
      })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : 'Проверьте GITHUB_TOKEN на сервере и GitHub repo'
      addToast({ type: 'error', title: msg })
    },
  })

  const linkMutation = useMutation({
    mutationFn: ({ prId, taskId }: { prId: number; taskId: string }) =>
      cicdApi.linkPRToTask(projectId!, String(prId), taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prs', projectId] })
      addToast({ type: 'success', title: 'PR привязан к задаче' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось привязать' }),
  })

  const webhookUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/github` : '/api/webhooks/github'

  const autoSyncDoneRef = useRef(false)
  useEffect(() => {
    autoSyncDoneRef.current = false
  }, [projectId])

  useEffect(() => {
    const repo = project?.gitlab_repo_url?.trim()
    if (!projectId || !repo || autoSyncDoneRef.current) return
    autoSyncDoneRef.current = true
    syncMutation.mutate(undefined, {
      onError: () => {
        /* тихо: нет токена / сеть — пользователь нажмёт «Синхронизировать» */
      },
    })
  }, [projectId, project?.gitlab_repo_url])

  if (!projectId) return null

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <GitPullRequest className="w-7 h-7 text-indigo-400" />
          CI/CD и GitHub
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Список PR берётся из <strong className="text-slate-300 font-medium">GitHub API</strong> (не из «фейкового» сида): при открытии страницы и по кнопке синхронизации записи в БД
          приводятся к ответу GitHub — лишние строки удаляются.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4 border-indigo-500/20">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-2">
            <Link2 className="w-4 h-4 text-indigo-400" />
            Интеграция GitHub
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Введите <strong>GitHub repo</strong> в формате <strong>owner/repo</strong> или URL.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="GitHub repo (например org/my-repo)"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={saveGithubRepo.isPending}
              onClick={() => saveGithubRepo.mutate()}
            >
              Сохранить
            </button>
          </div>
          {project?.gitlab_repo_url && (
            <a
              href={project.gitlab_repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-400 mt-2 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Репозиторий в GitHub
            </a>
          )}
        </div>

        <div className="card p-4 border-slate-700">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-2">
            <Shield className="w-4 h-4 text-amber-400" />
            Webhook (опционально)
          </div>
          <p className="text-xs text-slate-500 mb-2">
            В GitHub → <strong>Webhooks</strong>: URL ниже, событие <strong>Pull requests</strong>.
            Секрет задаётся на сервере как <code className="text-indigo-300">GITHUB_WEBHOOK_SECRET</code>.
          </p>
          <div className="flex items-center gap-2 bg-slate-900/50 rounded-md px-2 py-1.5 text-xs font-mono text-slate-300 break-all">
            <span className="flex-1">{webhookUrl}</span>
            <button
              type="button"
              className="btn-ghost p-1 shrink-0"
              title="Копировать"
              onClick={() => {
                copyToClipboard(webhookUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
                addToast({ type: 'info', title: 'URL скопирован' })
              }}
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4 border-amber-500/20 bg-amber-500/5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-2">
          <Lock className="w-4 h-4 text-amber-400" />
          Секреты, vault и проверки безопасности (SAST / DAST)
        </div>
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-disc pl-4">
          <li>
            <strong className="text-slate-200">Пароли и токены:</strong> храни в{' '}
            <strong>GitHub Actions → Secrets and variables</strong> или в переменных окружения на сервере (Docker / хостинг).{' '}
            Файлы <code className="text-indigo-300">.env</code> не коммить в репозиторий. Для команды — корпоративный менеджер паролей
            (1Password, Bitwarden, Vault и т.п.).
          </li>
          <li>
            <strong className="text-slate-200">SAST (статический анализ):</strong> подключи в репозитории{' '}
            <strong>CodeQL</strong> (GitHub Advanced Security) или <strong>Semgrep</strong> / SonarQube в CI — ищет уязвимости в коде на этапе сборки.
          </li>
          <li>
            <strong className="text-slate-200">DAST (динамический анализ):</strong> после деплоя стенда — прогон{' '}
            <strong>OWASP ZAP</strong> (в CI или вручную) или интеграция с Burp Suite Enterprise; проверяет работающее приложение снаружи.
          </li>
        </ul>
      </div>

      <div className="card p-4 flex flex-wrap items-center justify-between gap-3 bg-slate-800/30 border-indigo-500/20">
        <div className="flex items-start gap-2 text-sm text-slate-400 max-w-xl">
          <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <span>
            Для приватных репозиториев на сервере задайте <strong className="text-slate-200">GITHUB_TOKEN</strong> (scope <code className="text-indigo-300">repo</code>).
            Публичные репо доступны без токена с лимитом API. После синка в списке только реальные PR из GitHub.
          </span>
        </div>
        <button
          type="button"
          className={cn('btn-primary', syncMutation.isPending && 'opacity-80')}
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={cn('w-4 h-4', syncMutation.isPending && 'animate-spin')} />
          {syncMutation.isPending ? 'Синхронизация…' : 'Синхронизировать с GitHub'}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <GitPullRequest className="w-5 h-5 text-indigo-400" />
          Pull requests
        </h2>
        {isLoading ? (
          <p className="text-slate-400">Загрузка…</p>
        ) : isError ? (
          <div className="card p-4 text-red-300">Не удалось загрузить PR.</div>
        ) : prs.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            Нет записей PR. Укажите GitHub repo, задайте токен на сервере и нажмите «Синхронизировать», либо подключите webhook.
          </div>
        ) : (
          <ul className="space-y-3">
            {prs.map((pr) => (
              <li key={pr.id} className="card p-4 space-y-3 border-slate-700 hover:border-indigo-500/30 transition-colors">
                <div className="flex flex-wrap items-start gap-3">
                  <GitPullRequest className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-900 dark:text-white font-medium hover:text-indigo-300 inline-flex items-center gap-1"
                    >
                      {pr.title}
                      <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                    </a>
                    <div className="text-xs text-slate-500 mt-1 font-mono">
                      {pr.source_branch} → {pr.target_branch}
                      {pr.task_id ? (
                        <span className="text-indigo-400 ml-2">· задача #{pr.task_id}</span>
                      ) : (
                        <span className="text-slate-600 ml-2">· нет привязки к задаче</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={pr.status} size="sm" />
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-8">
                  <select
                    className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs px-2 py-1.5 text-slate-800 dark:text-slate-200 min-w-[200px]"
                    value={linkByPrId[Number(pr.id)] ?? ''}
                    onChange={(e) => setLinkByPrId((prev) => ({ ...prev, [Number(pr.id)]: e.target.value }))}
                  >
                    <option value="">Привязать к задаче…</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        #{t.id} {t.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={!linkByPrId[Number(pr.id)] || linkMutation.isPending}
                    onClick={() =>
                      linkMutation.mutate({ prId: Number(pr.id), taskId: linkByPrId[Number(pr.id)] })
                    }
                  >
                    Привязать
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-emerald-400" />
          Релизы (спринты)
        </h2>
        {releases.length === 0 ? (
          <p className="text-slate-400 text-sm">Релизы создаются на странице «Спринты» при закрытии спринта.</p>
        ) : (
          <ul className="space-y-2">
            {releases.map((r) => (
              <li
                key={r.id}
                className="card p-4 flex flex-wrap items-center justify-between gap-3 border-slate-700"
              >
                <div>
                  <div className="text-sm text-slate-900 dark:text-white font-medium">{r.name ?? r.version_tag}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {r.epoch?.name && <span>{r.epoch.name} · </span>}
                    {r.description || 'Без описания'}
                  </div>
                </div>
                <span className="text-xs font-mono px-2 py-1 rounded bg-slate-800 text-indigo-300">{r.version_tag}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
