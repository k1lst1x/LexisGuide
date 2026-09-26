import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardV2 } from '../DashboardV2'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('id-token') }))

let members: Array<{ user_id: string; email: string; name: string; role: string; joined_at: string }>
let myRole: string
let workspaces: Array<Record<string, string>>
let calls: Array<{ method: string; path: string; body: unknown }>

beforeEach(() => {
  window.localStorage.clear()
  calls = []
  myRole = 'owner'
  workspaces = [{ id: 'ws-1', name: 'Lease review', owner_id: 'u-ada', created_at: '2026-09-01T00:00:00Z', role: 'owner' }]
  members = [
    { user_id: 'u-ada', email: 'ada@example.com', name: 'Ada', role: 'owner', joined_at: '' },
    { user_id: 'u-bob', email: 'bob@example.com', name: 'Bob', role: 'member', joined_at: '' },
  ]
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0]
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method, path, body })
    const json = (data: unknown, status = 200) => Promise.resolve(new Response(status === 204 ? null : JSON.stringify(data), { status }))
    if (path === '/workspaces') return json(workspaces.map((item) => ({ ...item, role: myRole })))
    if (path === '/workspaces/ws-1/members') return json(members)
    const role = path.match(/^\/workspaces\/ws-1\/members\/([^/]+)\/role$/)
    if (role) { members = members.map((m) => (m.user_id === role[1] ? { ...m, role: body.role } : m)); return json(members.find((m) => m.user_id === role[1])) }
    const member = path.match(/^\/workspaces\/ws-1\/members\/([^/]+)$/)
    if (member && method === 'DELETE') { members = members.filter((m) => m.user_id !== member[1]); return json(null, 204) }
    if (path === '/workspaces/ws-1' && method === 'DELETE') { workspaces = []; return json(null, 204) }
    if (path === '/workspaces/ws-1/channels') return json([{ id: 'general', name: 'General', created_at: '', member_count: 2, is_member: true }])
    if (path.startsWith('/workspaces/ws-1/channels/general/members')) return json(members)
    if (path === '/workspaces/ws-1/messages') return json([])
    return Promise.reject(new Error('offline'))
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function openSettings(email: string) {
  const user = userEvent.setup()
  render(<DashboardV2 onClose={vi.fn()} userEmail={email} />)
  await user.click(screen.getByRole('button', { name: 'Messages' }))
  await user.click(await screen.findByRole('button', { name: /^L\s*Lease review/ }))
  await user.click(await screen.findByRole('button', { name: 'Settings for Lease review' }))
  const dialog = screen.getByRole('dialog', { name: 'Lease review' })
  await within(dialog).findByText('Bob')
  return { user, dialog }
}

describe('Workspace admin rights', () => {
  it('lets the owner make someone an admin and take it back', async () => {
    const { user, dialog } = await openSettings('ada@example.com')

    await user.click(within(dialog).getByRole('button', { name: 'Make Bob an admin' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Remove admin rights from Bob' })).toBeInTheDocument())
    expect(calls).toContainEqual({ method: 'PUT', path: '/workspaces/ws-1/members/u-bob/role', body: { role: 'admin' } })

    await user.click(within(dialog).getByRole('button', { name: 'Remove admin rights from Bob' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Make Bob an admin' })).toBeInTheDocument())
  })

  it('gives a member no admin controls and no way to delete the workspace', async () => {
    myRole = 'member'
    const { user, dialog } = await openSettings('bob@example.com')

    expect(within(dialog).queryByRole('button', { name: /Make .* an admin/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Remove .* from the workspace/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: 'Settings' }))
    expect(within(dialog).queryByRole('button', { name: 'Delete workspace' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('Only admins can delete this workspace.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Leave Lease review' })).toBeInTheDocument()
  })

  it('lets an admin remove a member after confirming', async () => {
    const { user, dialog } = await openSettings('ada@example.com')

    await user.click(within(dialog).getByRole('button', { name: 'Remove Bob from the workspace' }))
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(calls).toContainEqual({ method: 'DELETE', path: '/workspaces/ws-1/members/u-bob', body: null }))
    await waitFor(() => expect(within(dialog).queryByText('Bob')).not.toBeInTheDocument())
  })

  it('deletes the workspace only once its name is typed', async () => {
    const { user, dialog } = await openSettings('ada@example.com')
    await user.click(within(dialog).getByRole('tab', { name: 'Settings' }))

    const remove = within(dialog).getByRole('button', { name: 'Delete workspace' })
    expect(remove).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Type the workspace name to confirm'), 'Lease review')
    await user.click(remove)

    await waitFor(() => expect(calls).toContainEqual({ method: 'DELETE', path: '/workspaces/ws-1', body: null }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^L\s*Lease review/ })).not.toBeInTheDocument()
  })
})
