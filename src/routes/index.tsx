import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { db } from '../db/index'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { loginUser, registerUser, setCurrentUser } from '../lib/finsight-storage'

const registerUserApi = createServerFn({ method: 'POST' })
  .inputValidator((data: { username: string; password: string; displayName: string }) => data)
  .handler(async ({ data }) => {
    const existing = await db.query.users.findFirst({ where: eq(users.username, data.username) })
    if (existing) {
      return { error: 'Username already exists.' }
    }

    await db.insert(users).values({
      username: data.username,
      password: data.password,
      displayName: data.displayName,
    })

    return { error: null }
  })

const loginUserApi = createServerFn({ method: 'POST' })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const existing = await db.query.users.findFirst({ where: eq(users.username, data.username) })
    if (!existing) {
      return { error: 'User not found.' }
    }
    if (existing.password !== data.password) {
      return { error: 'Incorrect password.' }
    }
    return { error: null }
  })

export const Route = createFileRoute('/')({ component: App })

function App() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmedUsername = username.trim()

    if (!trimmedUsername || !password || (mode === 'register' && !displayName.trim())) {
      setError('All fields are required.')
      return
    }

    if (mode === 'register') {
      let result: { error: string | null } | null = null

      try {
        result = await registerUserApi({
          data: {
            username: trimmedUsername,
            password,
            displayName: displayName.trim(),
          },
        })
      } catch (err) {
        console.warn('Server auth failed, falling back to local storage.', err)
      }

      if (result) {
        if (result.error) {
          setError(result.error)
          return
        }
        setCurrentUser(trimmedUsername)
        navigate({ to: '/dashboard' })
        return
      }

      const message = registerUser(trimmedUsername, password, displayName.trim())
      if (message) {
        setError(message)
        return
      }
      navigate({ to: '/dashboard' })
      return
    }

    let result: { error: string | null } | null = null

    try {
      result = await loginUserApi({
        data: {
          username: trimmedUsername,
          password,
        },
      })
    } catch (err) {
      console.warn('Server auth failed, falling back to local storage.', err)
    }

    if (result) {
      if (result.error) {
        setError(result.error)
        return
      }
      setCurrentUser(trimmedUsername)
      navigate({ to: '/dashboard' })
      return
    }

    const message = loginUser(trimmedUsername, password)
    if (message) {
      setError(message)
      return
    }

    navigate({ to: '/dashboard' })
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(77,125,255,0.18),transparent_20%),radial-gradient(circle_at_100%_15%,rgba(25,218,255,0.14),transparent_22%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_48%,#f7fbff_100%)] py-14">
      <div className="page-wrap mx-auto flex min-h-[calc(100vh-5rem)] flex-col justify-center">
        <section className="grid gap-8 lg:grid-cols-[480px_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/92 p-8 shadow-[0_30px_80px_rgba(33,72,157,0.12)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-16 top-12 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(77,125,255,0.28),transparent_60%)] blur-3xl" />
            <div className="pointer-events-none absolute left-1/2 bottom-10 h-36 w-36 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,208,255,0.26),transparent_60%)] blur-3xl" />

            <span className="inline-flex rounded-full bg-[#eef3ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#4f71ff] shadow-[0_12px_30px_rgba(77,125,255,0.08)]">
              FinSight AI
            </span>

            <div className="mt-8">
              <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">Welcome!</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
                Sign in or register to access your premium financial AI dashboard, budgets, and goals.
              </p>
            </div>

            <div className="mt-10 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_26px_56px_rgba(70,103,176,0.08)]">
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-[#4d7dff] focus:ring-2 focus:ring-[#d8e6ff]"
                  />
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Display Name</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-[#4d7dff] focus:ring-2 focus:ring-[#d8e6ff]"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="Password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-[#4d7dff] focus:ring-2 focus:ring-[#d8e6ff]"
                  />
                </div>

                {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#4d7dff] to-[#5dd7ff] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(77,125,255,0.22)] transition duration-200 hover:-translate-y-0.5"
                >
                  {mode === 'login' ? 'Log In' : 'Register'}
                </button>
              </form>

              <div className="mt-5 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-slate-500">{mode === 'login' ? 'No account yet?' : 'Already registered?'}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login')
                    setError(null)
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-700 transition hover:border-[#4d7dff] hover:text-[#1f3bb3]"
                >
                  {mode === 'login' ? 'Create account' : 'Sign in instead'}
                </button>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-gradient-to-br from-[#eef4ff] via-[#f9fcff] to-[#eff8ff] p-8 shadow-[0_30px_80px_rgba(33,72,157,0.1)]">
            <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,rgba(77,125,255,0.24),transparent_34%)]" />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#4d7dff]">One place for everything</p>
                <h2 className="mt-4 text-3xl font-bold text-slate-950">A premium finance workspace with AI-powered insights.</h2>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Track spending, set goals, receive intelligent recommendations, and see your money move with clarity.
                </p>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(77,125,255,0.1)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4d7dff]">Smart stats</p>
                  <p className="mt-3 text-sm text-slate-700">Instant income and expense insights with rich visuals.</p>
                </div>
                <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(77,125,255,0.1)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4d7dff]">Budget clarity</p>
                  <p className="mt-3 text-sm text-slate-700">Organized budgets, smarter saving, and a more confident financial path.</p>
                </div>
                <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(77,125,255,0.1)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4d7dff]">Goal tracking</p>
                  <p className="mt-3 text-sm text-slate-700">Visual progress tracking keeps your savings goals on course.</p>
                </div>
                <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(77,125,255,0.1)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4d7dff]">Insights AI</p>
                  <p className="mt-3 text-sm text-slate-700">AI-generated suggestions that simplify your financial decisions.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
