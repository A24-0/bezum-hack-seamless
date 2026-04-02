import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { aiApi } from '../../api'
import { useUIStore } from '../../stores/uiStore'

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string }

function extractProjectIdFromPath(pathname: string): number | undefined {
  const m = pathname.match(/^\/projects\/(\d+)\//)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) ? n : undefined
}

export default function ChatBotDock() {
  const location = useLocation()
  const { addToast } = useUIStore()

  const projectId = useMemo(() => extractProjectIdFromPath(location.pathname), [location.pathname])

  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'm1',
      role: 'assistant',
      content:
        'Привет! На странице проекта я вижу снимок задач, документов и встреч (без id). Спроси: «что у нас по задачам?», «где документы?», «как CI/CD?». Пароли и токены сюда не вставляй.',
    },
  ])

  const send = async () => {
    const text = draft.trim()
    if (!text) return

    const userMsg: ChatMsg = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: text,
    }
    setMessages((prev) => [...prev, userMsg])
    setDraft('')
    setLoading(true)

    try {
      const res = await aiApi.chat(text, projectId)
      const botMsg: ChatMsg = {
        id: Math.random().toString(36).slice(2),
        role: 'assistant',
        content: res.data.answer,
      }
      setMessages((prev) => [...prev, botMsg])
    } catch (e: any) {
      addToast({ type: 'error', title: 'Ошибка чата', body: e?.response?.data?.detail || e?.message || 'Unknown' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      id="bot-dock"
      className={`fixed bottom-4 right-4 z-[85] w-[min(420px,calc(100vw-32px))] ${
        open ? '' : 'pointer-events-auto'
      }`}
    >
      {!open ? (
        <button
          type="button"
          className="btn-primary text-sm px-3 py-2 rounded-lg shadow-lg"
          onClick={() => setOpen(true)}
        >
          Бот
        </button>
      ) : (
        <div className="card p-3 shadow-2xl">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                AI
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Помощник</div>
                <div className="text-xs text-slate-500">подсказки по приложению</div>
              </div>
            </div>
            <button type="button" className="btn-ghost p-2" onClick={() => setOpen(false)} title="Свернуть">
              ✕
            </button>
          </div>

          <div className="max-h-[250px] overflow-auto pr-1 space-y-2 mb-2">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                <div
                  className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/60 text-slate-100 border border-slate-700'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 items-end">
            <textarea
              className="input resize-none min-h-[40px] max-h-[90px] flex-1"
              value={draft}
              placeholder="Спроси: «как перейти к части документа?» или «как назначить по стеку?»"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!loading) send()
                }
              }}
            />
            <button type="button" className="btn-primary shrink-0" onClick={send} disabled={loading || !draft.trim()}>
              {loading ? '…' : 'Отправить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

