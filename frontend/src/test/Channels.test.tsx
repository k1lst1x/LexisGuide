import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardV2 } from '../DashboardV2'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('id-token') }))

type Channel = { id: string; name: string; description: string; created_at: string; created_by_name: string; member_count: number; is_member: boolean; can_manage: boolean; last_message_at: string }

let channels: Channel[]
let calls: Array<{ method: string; path: string; body: Record<string, unknown> | null }>

const PEOPLE = [
  { user_id: 'u-ada', email: 'ada@example.com', name: 'Ada', role: 'owner', joined_at: '2026-09-20T00:00:00Z' },
  { user_id: 'u-bob', email: 'bob@example.com', name: 'Bob', role: 'member', joined_at: '2026-09-21T00:00:00Z' },
]

beforeEach(() => {
  window.localStorage.clear()
  calls = []
  channels = [
    { id: 'general', name: 'General', description: 'Everyone in the workspace.', created_at: '', created_by_name: '', member_count: 2, is_member: true, can_manage: false, last_message_at: '' },
    { id: 'ch-deadlines', name: 'deadlines', description: 'Every date we must not miss.', created_at: '2026-09-24T00:00:00Z', created_by_name: 'Ada', member_count: 1, is_member: false, can_manage: false, last_message_at: '' },
  ]
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0]
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method, path, body })
    const json = (data: unknown, status = 200) => Promise.resolve(new Response(status === 204 ? null : JSON.stringify(data), { status }))
    const channel = (id: string) => channels.find((item) => item.id === id)!
    if (path === '/workspaces' && method === 'GET') return json([{ id: 'ws-1', name: 'Lease review', owner_id: 'u-ada', created_at: '', role: 'member' }])
    if (path === '/workspaces/ws-1/members') return json(PEOPLE)
    if (path === '/workspaces/ws-1/channels' && method === 'GET') return json(channels)
    if (path === '/workspaces/ws-1/channels' && method === 'POST') {
      const created = { id: 'ch-new', name: body.name, description: body.description, created_at: '2026-09-26T00:00:00Z', created_by_name: 'You', member_count: 1, is_member: true, can_manage: true, last_message_at: '' }
      channels = [...channels, created]
      return json(created, 201)
    }
    let match = path.match(/^\/workspaces\/ws-1\/channels\/([^/]+)\/(join|leave)$/)
    if (match) {
      const joining = match[2] === 'join'
      Object.assign(channel(match[1]), { is_member: joining, member_count: channel(match[1]).member_count + (joining ? 1 : -1) })
      return json(channel(match[1]))
    }
    match = path.match(/^\/workspaces\/ws-1\/channels\/([^/]+)\/members$/)
    if (match) return json(match[1] === 'general' ? PEOPLE : PEOPLE.slice(0, channel(match[1]).member_count))
    match = path.match(/^\/workspaces\/ws-1\/channels\/([^/]+)$/)
    if (match && method === 'DELETE') { channels = channels.filter((item) => item.id !== match![1]); return json(null, 204) }
    if (path === '/workspaces/ws-1/messages') return json([])
    return Promise.reject(new Error('offline'))
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function openWorkspace() {
  const user = userEvent.setup()
  render(<DashboardV2 onClose={vi.fn()} userEmail="bob@example.com" />)
  await user.click(screen.getByRole('button', { name: 'Messages' }))
  await user.click(await screen.findByRole('button', { name: /Lease review/ }))
  await screen.findByRole('button', { name: 'Browse channels' })
  return user
}

describe('Slack-style channels', () => {
  it('browses, previews, and joins a channel', async () => {
    const user = await openWorkspace()

    await user.click(screen.getByRole('button', { name: 'Browse channels' }))
    const browse = screen.getByRole('dialog', { name: 'Browse channels' })
    expect(within(browse).getByText('Every date we must not miss.')).toBeInTheDocument()
    await user.click(within(browse).getAllByRole('button', { name: 'View' })[1])

    // Previewing: reading is allowed, posting needs joining first.
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join channel' }))

    expect(await screen.findByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Message #deadlines')
    expect(calls).toContainEqual({ method: 'POST', path: '/workspaces/ws-1/channels/ch-deadlines/join', body: null })
  })

  it('shows who is in a channel and lets you leave it', async () => {
    const user = await openWorkspace()
    await user.click(screen.getByRole('button', { name: 'Browse channels' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Join' }))
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: /^deadlines/ }))
    await user.click(screen.getByRole('button', { name: /View members/ }))
    const details = screen.getByRole('dialog')
    await waitFor(() => expect(within(details).getByText('Ada')).toBeInTheDocument())
    expect(within(details).getByText('Workspace owner')).toBeInTheDocument()

    await user.click(within(details).getByRole('tab', { name: 'Settings' }))
    await user.click(within(details).getByRole('button', { name: 'Leave #deadlines' }))

    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/ch-deadlines/leave'))).toBe(true))
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Message #General')
  })

  it('creates a channel with a Slack-style name and a description, then can delete it', async () => {
    const user = await openWorkspace()

    await user.click(screen.getByRole('button', { name: 'Create a channel' }))
    const create = screen.getByRole('dialog', { name: 'Create a channel' })
    await user.type(within(create).getByLabelText('Channel name'), 'Appeal Deadlines!')
    expect(within(create).getByText('#appeal-deadlines')).toBeInTheDocument()
    await user.type(within(create).getByLabelText('Channel description'), 'Dates for the appeal.')
    await user.click(within(create).getByRole('button', { name: 'Create channel' }))

    expect(calls.find((call) => call.method === 'POST' && call.path === '/workspaces/ws-1/channels')?.body)
      .toEqual({ name: 'appeal-deadlines', description: 'Dates for the appeal.' })
    expect(await screen.findByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Message #appeal-deadlines')

    await user.click(screen.getByRole('button', { name: 'Channel details for appeal-deadlines' }))
    const details = screen.getByRole('dialog')
    await user.click(within(details).getByRole('tab', { name: 'Settings' }))
    await user.click(within(details).getByRole('button', { name: 'Delete channel' }))
    await user.click(within(details).getByRole('button', { name: 'Yes, delete #appeal-deadlines' }))

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/channels/ch-new'))).toBe(true))
  })
})
