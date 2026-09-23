/* Calls to /api/v1/admin. The API decides who is an admin; nothing here does. */
import { cognitoGetIdToken } from '../aws'

// Same rule as the workspace client, without pulling its sample data into this chunk.
const apiBase = () => (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class AdminApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

/** Authenticated admin request. A 401 or 403 is retried once with a fresh
    token: someone just added to the admins group only carries the claim after
    their token is reissued. */
export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = await cognitoGetIdToken()
  if (!token) throw new AdminApiError('Sign in to use the admin portal.', 401)
  const send = () => fetch(`${apiBase()}/api/v1/admin${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${token}` },
  })
  let response = await send()
  if (response.status === 401 || response.status === 403) {
    token = await cognitoGetIdToken(true)
    if (!token) throw new AdminApiError('Your session expired. Please sign in again.', 401)
    response = await send()
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : 'The request could not be completed.'
    throw new AdminApiError(detail, response.status)
  }
  return body as T
}

export type AdminSession = { sub: string; username: string; email: string; name: string }

export type AuditEntry = {
  at: string
  actor_id: string
  actor_email: string
  action: string
  target: string
  detail: string
}

export type Overview = {
  users: { total: number; enabled: number; disabled: number; federated: number; admins: number }
  data: { workspaces: number; documents: number; conversations: number; lawyers_verified: number; lawyers_locked: number }
  recent_actions: AuditEntry[]
}

export type AdminUser = {
  username: string
  sub: string
  email: string
  name: string
  status: string
  enabled: boolean
  created_at: string
  updated_at: string
  is_admin: boolean
  provider: string
}

export type LawyerStatus = {
  verified: boolean
  attempts_used: number
  attempts_remaining: number
  max_attempts: number
  bar_number: string
  jurisdiction: string
  name: string
  status: string
  admitted_on: string
  verified_at: string
}

export type UserDetail = AdminUser & {
  display_name: string
  documents: number
  conversations: number
  workspaces: Array<{ id: string; name: string; role: string }>
  lawyer_verification: LawyerStatus
}

export type AdminWorkspace = {
  id: string
  name: string
  owner_id: string
  owner_email: string
  created_at: string
  member_count: number
  linked_document_title: string | null
}

export type AdminWorkspaceMember = { user_id: string; email: string; name: string; role: string; joined_at: string }

const user = (username: string) => `/users/${encodeURIComponent(username)}`
const json = (body: unknown) => JSON.stringify(body)

export const adminApi = {
  session: () => adminRequest<AdminSession>('/session'),
  overview: () => adminRequest<Overview>('/overview'),
  users: (q = '', nextToken = '') =>
    adminRequest<{ users: AdminUser[]; next_token: string }>(`/users?${new URLSearchParams({ q, next_token: nextToken })}`),
  user: (username: string) => adminRequest<UserDetail>(user(username)),
  disable: (username: string) => adminRequest(`${user(username)}/disable`, { method: 'POST' }),
  enable: (username: string) => adminRequest(`${user(username)}/enable`, { method: 'POST' }),
  signOut: (username: string) => adminRequest(`${user(username)}/sign-out`, { method: 'POST' }),
  setAdmin: (username: string, admin: boolean) => adminRequest(`${user(username)}/admin`, { method: 'PUT', body: json({ admin }) }),
  deleteUser: (username: string) => adminRequest(user(username), { method: 'DELETE' }),
  resetLawyer: (username: string) => adminRequest<LawyerStatus>(`${user(username)}/lawyer-verification`, { method: 'DELETE' }),
  verifyLawyer: (username: string, body: { bar_number: string; jurisdiction: string; name: string; note: string }) =>
    adminRequest<LawyerStatus>(`${user(username)}/lawyer-verification`, { method: 'POST', body: json(body) }),
  workspaces: () => adminRequest<AdminWorkspace[]>('/workspaces'),
  workspaceMembers: (id: string) => adminRequest<AdminWorkspaceMember[]>(`/workspaces/${encodeURIComponent(id)}/members`),
  deleteWorkspace: (id: string) => adminRequest(`/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  removeMember: (id: string, userId: string) =>
    adminRequest(`/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  audit: (limit = 200) => adminRequest<AuditEntry[]>(`/audit?limit=${limit}`),
}

const ACTION_LABELS: Record<string, string> = {
  'user.disable': 'Disabled account',
  'user.enable': 'Enabled account',
  'user.sign_out': 'Signed out everywhere',
  'user.grant_admin': 'Granted admin access',
  'user.revoke_admin': 'Removed admin access',
  'user.delete': 'Deleted account',
  'lawyer.reset': 'Reset bar verification',
  'lawyer.verify': 'Verified bar record',
  'workspace.delete': 'Deleted workspace',
  'workspace.remove_member': 'Removed workspace member',
}

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action

export function formatDate(value: string, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}
