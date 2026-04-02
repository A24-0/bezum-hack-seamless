import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { cn } from '../../lib/utils'

const ICON_MAP = {
  success: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
  info: <Info className="w-4 h-4 text-blue-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
}

const COLOR_MAP = {
  success: 'border-green-500/30 bg-white dark:bg-slate-800',
  error: 'border-red-500/30 bg-white dark:bg-slate-800',
  info: 'border-blue-500/30 bg-white dark:bg-slate-800',
  warning: 'border-yellow-500/30 bg-white dark:bg-slate-800',
}

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-16 right-4 z-[150] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 p-3 rounded-lg border shadow-xl animate-in slide-in-from-bottom-2',
            COLOR_MAP[toast.type]
          )}
        >
          <div className="mt-0.5">{ICON_MAP[toast.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{toast.title}</p>
            {toast.body && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{toast.body}</p>
            )}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
