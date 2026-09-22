import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsView } from '../workspace/views/SettingsView'
import { WorkspaceProvider } from '../workspace/store'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('test-id-token') }))

const UNVERIFIED = {
  verified: false,
  attempts_used: 0,
  attempts_remaining: 3,
  max_attempts: 3,
  bar_number: '',
  jurisdiction: '',
  name: '',
  status: '',
  admitted_on: '',
  verified_at: '',
}

/** Answer the GET with `state`, then each POST from `posts` in order. */
function server(state: Record<string, unknown>, posts: Array<{ status: number; body: unknown }> = []) {
  const queue = [...posts]
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const isPost = init?.method === 'POST'
    if (!isPost) return { ok: true, status: 200, json: async () => state }
    const next = queue.shift() ?? { status: 500, body: { detail: 'unexpected' } }
    if (next.status === 200) state = next.body as Record<string, unknown>
    return { ok: next.status === 200, status: next.status, json: async () => next.body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderSettings = () => render(
  <WorkspaceProvider userEmail="lawyer@example.com"><SettingsView /></WorkspaceProvider>,
)

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('Bar verification in Settings', () => {
  it('offers the form with the remaining attempts to an unverified lawyer', async () => {
    server(UNVERIFIED)
    renderSettings()

    expect(await screen.findByText(/you have 3 of 3 attempts left/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Bar number')).toBeInTheDocument()
    expect(screen.getByLabelText('Jurisdiction')).toBeInTheDocument()
  })

  it('verifies a real bar record and then shows the licence instead of the form', async () => {
    const user = userEvent.setup()
    const fetchMock = server(UNVERIFIED, [{
      status: 200,
      body: {
        ...UNVERIFIED,
        verified: true,
        attempts_used: 1,
        attempts_remaining: 2,
        name: 'Dana Okafor',
        bar_number: '1234567',
        jurisdiction: 'FL',
        admitted_on: '2011-05-02',
        verified_at: '2026-09-22T00:00:00+00:00',
      },
    }])
    renderSettings()

    await user.type(await screen.findByLabelText('Bar number'), '1234567')
    await user.selectOptions(screen.getByLabelText('Jurisdiction'), 'FL')
    await user.click(screen.getByRole('button', { name: 'Verify licence' }))

    expect(await screen.findByText('Verified attorney')).toBeInTheDocument()
    expect(screen.getByText(/Dana Okafor/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify licence' })).not.toBeInTheDocument()

    const posted = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'POST')
    expect(JSON.parse((posted?.[1] as RequestInit).body as string)).toEqual({
      bar_number: '1234567',
      jurisdiction: 'FL',
    })
  })

  it('shows the rejection and the attempts left when the bar has no such record', async () => {
    const user = userEvent.setup()
    server(
      { ...UNVERIFIED, attempts_used: 1, attempts_remaining: 2 },
      [{ status: 404, body: { detail: 'No FL bar record matches number 999. You have 2 attempts left.' } }],
    )
    renderSettings()

    await user.type(await screen.findByLabelText('Bar number'), '999')
    await user.click(screen.getByRole('button', { name: 'Verify licence' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No FL bar record matches number 999')
    expect(alert).toHaveTextContent('2 attempts left')
    expect(alert.className).toContain('is-critical')
  })

  it('treats a spent provider allowance as a caution, never as a rejection', async () => {
    const user = userEvent.setup()
    server(UNVERIFIED, [{
      status: 503,
      body: { detail: 'Bar verification has reached its daily limit. Please try again tomorrow. This attempt was not counted.' },
    }])
    renderSettings()

    await user.type(await screen.findByLabelText('Bar number'), '1234567')
    await user.click(screen.getByRole('button', { name: 'Verify licence' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This attempt was not counted')
    // Styled as a caution, and the form stays open so they can retry.
    expect(alert.className).toContain('is-warning')
    expect(screen.getByRole('button', { name: 'Verify licence' })).toBeInTheDocument()
  })

  it('locks the form after three failures and offers support in the chat', async () => {
    const user = userEvent.setup()
    server(
      { ...UNVERIFIED, attempts_used: 2, attempts_remaining: 1 },
      [{ status: 429, body: { detail: 'You have used all three verification attempts. Ask support to review your bar record in the chat at the bottom right, or email support@lexisguide.app.' } }],
    )
    renderSettings()

    await user.type(await screen.findByLabelText('Bar number'), '999')
    await user.click(screen.getByRole('button', { name: 'Verify licence' }))

    expect(await screen.findByText('Verification locked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contact support in chat' })).toBeInTheDocument()
    expect(screen.getByText(/support@lexisguide.app/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify licence' })).not.toBeInTheDocument()
  })

  it('locks straight away for an account that already spent every attempt', async () => {
    server({ ...UNVERIFIED, attempts_used: 3, attempts_remaining: 0 })
    renderSettings()

    expect(await screen.findByText('Verification locked')).toBeInTheDocument()
    expect(screen.queryByLabelText('Bar number')).not.toBeInTheDocument()
  })

  it('shows the stored licence to an already-verified lawyer without asking again', async () => {
    const fetchMock = server({
      ...UNVERIFIED,
      verified: true,
      attempts_used: 1,
      name: 'Dana Okafor',
      bar_number: '1234567',
      jurisdiction: 'FL',
    })
    renderSettings()

    expect(await screen.findByText('Verified attorney')).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'POST')).toBe(false)
    })
  })
})
