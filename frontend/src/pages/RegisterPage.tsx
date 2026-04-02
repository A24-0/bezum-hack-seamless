import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layers } from 'lucide-react'
import { ThemeToggleButton } from '../components/common/ThemeToggleButton'
import { authApi } from '../api'
import { useAuthStore } from '../stores/authStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'developer' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.register(form)
      login(res.data.access_token, res.data.user)
      navigate('/projects')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось зарегистрироваться')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggleButton />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Layers className="w-8 h-8 text-indigo-400" />
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Seamless</span>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Создать аккаунт</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Имя и фамилия</label>
              <input type="text" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
            </div>
            <div>
              <label className="label">Роль</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="manager">Менеджер</option>
                <option value="developer">Разработчик</option>
                <option value="customer">Заказчик</option>
              </select>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Создание…' : 'Создать аккаунт'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-slate-400">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300">Войти</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
