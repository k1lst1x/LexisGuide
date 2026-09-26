import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardV2 } from '../DashboardV2'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('id-token') }))

type Reaction = { emoji: string; count: number; names: string[]; mine: boolean }
type Message = { id: string; user: string; author_id: string; author_email: string; text: string; created_at: string; channel_id: string; attachment?: string; attachment_title?: string; mentions?: unknown[]; reactions: Reaction[]; saved: boolean }

const PEOPLE = [
  { user_id: 'u-ada', email: 'ada@example.com', name: 'Ada', role: 'owner', joined_at: '2026-09-20T00:00:00Z' },
  { user_id: 'u-bob', email: 'bob@example.com', name: 'Bob', role: 'member', joined_at: '2026-09-21T00:00:00Z' },
]
const CHANNELS = [
  { id: 'general', name: 'general', description: 'Everyone.', created_at: '', member_count: 2, is_member: true, can_manage: false, last_message_at: '' },
  { id: 'ch-deadlines', name: 'deadlines', description: 'Dates we must not miss.', created_at: '', member_count: 2, is_member: true, can_manage: false, last_message_at: '' },
]

let messages: Message[]
let sharedText: string
let calls: Array<{ method: string; path: string; body: Record<string, unknown> | null }>

beforeEach(() => {
  window.localStorage.clear()
  calls = []
  sharedText = 'The tenant must give 60 days notice before moving out.'
  messages = [{
    id: 'm-1', user: 'Ada', author_id: 'u-ada', author_email: 'ada@example.com', text: 'Please check the notice clause.',
    created_at: '2026-09-26T10:00:00Z', channel_id: 'general', attachment: 'doc-lease', attachment_title: 'Fremont lease',
    reactions: [{ emoji: '🎉', count: 1, names: ['Ada'], mine: false }], saved: false,
  }]
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0]
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method, path, body })
    const json = (data: unknown, status = 200) => Promise.resolve(new Response(status === 204 ? null : JSON.stringify(data), { status }))
    if (path === '/workspaces' && method === 'GET') return json([{ id: 'ws-1', name: 'Lease review', owner_id: 'u-ada', created_at: '', role: 'member' }])
    if (path === '/workspaces/ws-1/members') return json(PEOPLE)
    if (path === '/workspaces/ws-1/channels') return json(CHANNELS)
    if (/^\/workspaces\/ws-1\/channels\/[^/]+\/members$/.test(path)) return json(PEOPLE)
    if (path === '/workspaces/ws-1/messages' && method === 'GET') return json(messages)
    if (path === '/workspaces/ws-1/messages' && method === 'POST') {
      const created: Message = { id: `m-${messages.length + 1}`, user: 'Bob', author_id: 'u-bob', author_email: 'bob@example.com', text: String(body!.text), created_at: '2026-09-26T10:05:00Z', channel_id: 'general', mentions: body!.mentions as unknown[], reactions: [], saved: false }
      messages = [...messages, created]
      return json(created, 201)
    }
    if (path === '/workspaces/ws-1/messages/m-1/reactions') {
      const emoji = String(body!.emoji)
      const message = messages[0]
      const existing = message.reactions.find((item) => item.emoji === emoji)
      message.reactions = existing
        ? message.reactions.map((item) => (item.emoji === emoji ? { ...item, count: item.count + 1, names: [...item.names, 'Bob'], mine: true } : item))
        : [...message.reactions, { emoji, count: 1, names: ['Bob'], mine: true }]
      return json(message)
    }
    if (path === '/workspaces/ws-1/messages/m-1/saved') return json(null, 204)
    if (/^\/workspaces\/ws-1\/files\/[0-9a-f]{64}$/.test(path)) {
      if (method === 'PUT') { sharedText = String(body!.text); return json({ document_key: 'k', document_id: 'doc-lease', title: 'Fremont lease' }) }
      return json({ document_key: 'k', document_id: 'doc-lease', title: 'Fremont lease', shared_by_name: 'Ada', updated_at: '2026-09-26T10:00:00Z', document: { id: 'doc-lease', title: 'Fremont lease', type: 'Residential lease', text: sharedText, score: 72, findings: [{ title: 'Long notice period', severity: 'warning', category: 'Notice', explanation: 'Sixty days is longer than usual.', evidence: '60 days notice' }] } })
    }
    return Promise.reject(new Error('offline'))
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function openWorkspace() {
  const user = userEvent.setup()
  render(<DashboardV2 onClose={vi.fn()} userEmail="bob@example.com" />)
  await user.click(screen.getByRole('button', { name: 'Messages' }))
  await user.click(await screen.findByRole('button', { name: /^L\s*Lease review/ }))
  await screen.findByText('Please check the notice clause.')
  return user
}

describe('Real-time messaging', () => {
  it('shows everyone’s reactions and saves yours to the server', async () => {
    const user = await openWorkspace()
    expect(screen.getByRole('button', { name: '🎉 1: Ada' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'React 👍' }))
    expect(await screen.findByRole('button', { name: '👍 1: Bob' })).toHaveAttribute('aria-pressed', 'true')
    expect(calls).toContainEqual({ method: 'POST', path: '/workspaces/ws-1/messages/m-1/reactions', body: { emoji: '👍', channel_id: 'general' } })

    // Any emoji, from the picker.
    await user.click(screen.getByRole('button', { name: 'Add a reaction' }))
    await user.type(within(screen.getByRole('dialog', { name: 'Choose a reaction' })).getByRole('textbox'), 'rocket')
    await user.click(screen.getByRole('button', { name: '🚀' }))
    expect(await screen.findByRole('button', { name: '🚀 1: Bob' })).toBeInTheDocument()
  })

  it('suggests people and channels while typing and sends them as mentions', async () => {
    const user = await openWorkspace()
    const box = screen.getByRole('textbox', { name: 'Message' })

    await user.type(box, 'Thanks @Ad')
    const people = screen.getByRole('listbox', { name: 'People and documents' })
    expect(within(people).getByText('Ada')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(box).toHaveValue('Thanks @Ada ')

    await user.type(box, 'see #dead')
    await user.click(within(screen.getByRole('listbox', { name: 'Channels' })).getByText('deadlines'))
    await user.keyboard('{Enter}')

    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === '/workspaces/ws-1/messages')).toBe(true))
    const sent = calls.find((call) => call.method === 'POST' && call.path === '/workspaces/ws-1/messages')!
    expect(sent.body).toMatchObject({
      text: 'Thanks @Ada see #deadlines',
      mentions: [{ type: 'user', id: 'u-ada', label: 'Ada' }, { type: 'channel', id: 'ch-deadlines', label: 'deadlines' }],
    })
    // The channel mention is a link to the channel.
    expect(await screen.findByRole('button', { name: 'Open #deadlines' })).toBeInTheDocument()
  })

  it('opens a shared document beside the chat, and shares edits', async () => {
    const user = await openWorkspace()
    expect(screen.queryByRole('complementary', { name: 'Details' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Fremont lease/ }))
    const panel = await screen.findByRole('complementary', { name: 'Document: Fremont lease' })
    expect(await within(panel).findByText(sharedText)).toBeInTheDocument()
    expect(within(panel).getByText(/shared by Ada/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /Open in Review/ })).toBeEnabled()

    await user.click(within(panel).getByRole('button', { name: /Edit/ }))
    const editor = within(panel).getByRole('textbox', { name: 'Document text' })
    await user.clear(editor)
    await user.type(editor, 'The tenant must give 30 days notice.')
    await user.click(within(panel).getByRole('button', { name: /Save & share/ }))

    await waitFor(() => expect(calls.some((call) => call.method === 'PUT' && call.path.startsWith('/workspaces/ws-1/files/'))).toBe(true))
    expect(sharedText).toBe('The tenant must give 30 days notice.')
    expect(await within(panel).findByText('The tenant must give 30 days notice.')).toBeInTheDocument()
  })
})
