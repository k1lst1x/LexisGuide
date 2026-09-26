import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardV2 } from '../DashboardV2'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('id-token') }))

const LEASE = {
  id: 'upload-lease.pdf-1-2',
  title: 'Oak Street lease',
  type: 'Lease',
  version: 'Working copy · edited',
  score: 62,
  status: 'Review recommended',
  agency: 'Lease',
  date: 'September 25, 2026',
  hash: 'ab'.repeat(32),
  text: 'The tenant shall pay rent monthly.',
  findings: [{ id: 'f1', title: 'Vague deadline', severity: 'warning', category: 'Deadline', explanation: 'No date.', evidence: 'monthly', rule: 'State a date.' }],
}

type Call = { method: string; path: string; body: Record<string, unknown> | null }
let calls: Call[]
let savedDocuments: unknown[]
let savedState: Record<string, unknown>

beforeEach(() => {
  window.localStorage.clear()
  calls = []
  savedDocuments = [{ document_key: 'k', document_id: LEASE.id, document: LEASE, resolved: ['f1'], updated_at: '2026-09-25T10:00:00Z' }]
  savedState = { selected_document_id: LEASE.id, jurisdiction: 'Florida', hidden_samples: [], tasks: null }
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0]
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
    const json = (body: unknown, status = 200) => Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }))
    if (path === '/me/documents' && method === 'GET') return json(savedDocuments)
    if (path === '/me/workspace-state' && method === 'GET') return json(savedState)
    if (path.startsWith('/me/documents/') && method === 'DELETE') return json(null, 204)
    if (path.startsWith('/me/')) return json(init?.body ? JSON.parse(String(init.body)) : {})
    // Everything else (AI, ledger, shared workspaces) is offline in this test.
    return Promise.reject(new Error('offline'))
  }))
})
afterEach(() => vi.unstubAllGlobals())

const saves = (path: string) => calls.filter((call) => call.method === 'PUT' && call.path.startsWith(path))

describe('Saved workspace', () => {
  it('reopens the workspace where the person left off', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} userEmail="ada@example.com" />)

    await waitFor(() => expect(screen.queryByText('Restoring your workspace…')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByRole('button', { name: /Viewing Oak Street lease/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Legal jurisdiction')).toHaveValue('Florida')
    // Restoring must not immediately write the same data back.
    expect(saves('/me/documents')).toEqual([])
  })

  it('saves an edit shortly after it is made', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} userEmail="ada@example.com" />)
    await waitFor(() => expect(screen.queryByText('Restoring your workspace…')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Review' }))

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Edit document text'), ' Late fees apply.')

    await waitFor(() => expect(saves('/me/documents').length).toBeGreaterThan(0), { timeout: 3000 })
    const last = saves('/me/documents').at(-1)!.body as { document: { text: string }; resolved: string[] }
    expect(last.document.text).toBe('The tenant shall pay rent monthly. Late fees apply.')
    expect(last.resolved).toEqual(['f1'])
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })

  it('deletes a removed document from the server', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} userEmail="ada@example.com" />)
    await waitFor(() => expect(screen.queryByText('Restoring your workspace…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Documents' }))
    await user.click(screen.getByRole('button', { name: 'Select documents to remove' }))
    await user.click(screen.getByRole('checkbox', { name: /Oak Street lease/ }))
    await user.click(screen.getByRole('button', { name: /^Remove 1$/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Remove 1 document/ }))

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path.startsWith('/me/documents/'))).toBe(true))
  })

  it('works as before without an account, saving nothing', async () => {
    render(<DashboardV2 onClose={vi.fn()} />)

    expect(screen.queryByText('Restoring your workspace…')).not.toBeInTheDocument()
    expect(calls.filter((call) => call.path.startsWith('/me/'))).toEqual([])
  })
})
