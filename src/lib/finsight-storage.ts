type UserRecord = {
  password: string
  displayName: string
}

const STORAGE_USERS = 'finsight_ai_users'
const STORAGE_CURRENT_USER = 'finsight_ai_current_user'

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function getUsers(): Record<string, UserRecord> {
  if (typeof window === 'undefined') return {}
  return safeParse<Record<string, UserRecord>>(localStorage.getItem(STORAGE_USERS), {})
}

export function saveUsers(users: Record<string, UserRecord>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_USERS, JSON.stringify(users))
}

export function getCurrentUser(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_CURRENT_USER)
}

export function setCurrentUser(username: string | null) {
  if (typeof window === 'undefined') return
  if (!username) localStorage.removeItem(STORAGE_CURRENT_USER)
  else localStorage.setItem(STORAGE_CURRENT_USER, username)
}

const STORAGE_TRANSACTIONS_PREFIX = 'finsight_ai_transactions_'
const STORAGE_GOALS_PREFIX = 'finsight_ai_goals_'

export function getTransactions(user: string) {
  if (typeof window === 'undefined') return []
  return safeParse<any[]>(localStorage.getItem(`${STORAGE_TRANSACTIONS_PREFIX}${user}`), [])
}

export function saveTransactions(user: string, data: any[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${STORAGE_TRANSACTIONS_PREFIX}${user}`, JSON.stringify(data))
}

export function getGoals(user: string) {
  if (typeof window === 'undefined') return []
  return safeParse<any[]>(localStorage.getItem(`${STORAGE_GOALS_PREFIX}${user}`), [])
}

export function saveGoals(user: string, data: any[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${STORAGE_GOALS_PREFIX}${user}`, JSON.stringify(data))
}

export function loginUser(username: string, password: string) {
  const users = getUsers()
  const existing = users[username]
  if (!existing) return 'User not found.'
  if (existing.password !== password) return 'Incorrect password.'
  setCurrentUser(username)
  return null
}

export function registerUser(username: string, password: string, displayName: string) {
  const users = getUsers()
  if (!username || !password || !displayName) return 'All fields are required.'
  if (users[username]) return 'Username already exists.'

  const next = { ...users, [username]: { password, displayName } }
  saveUsers(next)
  setCurrentUser(username)
  return null
}