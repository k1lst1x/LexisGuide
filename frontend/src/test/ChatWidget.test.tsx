import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatWidget } from '../chat/ChatWidget'

const auth = vi.hoisted(() => ({ cognitoGetIdToken: vi.fn() }))
vi.mock('../aws', () => auth)

beforeEach(() => {
  window.localStorage.clear()
  auth.cognitoGetIdToken.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

async function openAndAsk(question: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open LexisGuide assistant' }))
  await user.type(screen.getByRole('textbox', { name: 'Ask LexisGuide' }), question)
  await user.click(screen.getByRole('button', { name: 'Send question' }))
  return user
}

describe('ChatWidget', () => {
  it('stays closed until the launcher is used', () => {
    render(<ChatWidget storageKey="test-chat" />)
    expect(screen.queryByRole('dialog', { name: 'Ask LexisGuide' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open LexisGuide assistant' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('answers signed-out visitors from the built-in guide and offers sign-in', async () => {
    auth.cognitoGetIdToken.mockResolvedValue(null)
    const onSignIn = vi.fn()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<ChatWidget storageKey="test-chat" onSignIn={onSignIn} />)

    const user = await openAndAsk('How do I upload a PDF?')

    expect(await screen.findByText(/choose/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sign in to chat' }))
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('sends the conversation and page context to the agent and renders its reply', async () => {
    auth.cognitoGetIdToken.mockResolvedValue('token-1')
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reply: 'A lien is a claim.\n- Check the amount\n- Ask for proof', tools_used: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    render(<ChatWidget storageKey="test-chat" context={{ page: 'Review', document_title: 'Lease' }} />)

    await openAndAsk('What is a lien?')

    expect(await screen.findByText('A lien is a claim.')).toBeInTheDocument()
    expect(screen.getByText('Check the amount').tagName).toBe('LI')
    expect(screen.getByText('AI agent · online')).toBeInTheDocument()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/chat$/)
    expect(init.headers.Authorization).toBe('Bearer token-1')
    const body = JSON.parse(init.body)
    expect(body.messages).toEqual([{ role: 'user', content: 'What is a lien?' }])
    expect(body.context).toMatchObject({ page: 'Review', document_title: 'Lease' })
    expect(body.conversation_id).toMatch(/^[A-Za-z0-9-]{8,64}$/)
  })

  it('falls back to the guide when the agent errors', async () => {
    auth.cognitoGetIdToken.mockResolvedValue('token-1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 502 })))
    render(<ChatWidget storageKey="test-chat" fallback={() => 'Grounded fallback answer.'} />)

    await openAndAsk('Explain this')

    expect(await screen.findByText('Grounded fallback answer.')).toBeInTheDocument()
    expect(screen.getByText(/AI agent is unavailable right now/)).toBeInTheDocument()
  })

  it('keeps the conversation across reloads', async () => {
    auth.cognitoGetIdToken.mockResolvedValue(null)
    const first = render(<ChatWidget storageKey="test-chat" />)
    await openAndAsk('Is my data private?')
    await screen.findByText(/signed-in account/)
    first.unmount()

    render(<ChatWidget storageKey="test-chat" open />)
    await waitFor(() => expect(screen.getByText('Is my data private?')).toBeInTheDocument())
  })
})

describe('built-in guide', () => {
  it('defines legal terms and flags risky wording offline', async () => {
    const { defaultGuide } = await import('../chat/guide')
    expect(defaultGuide('What does “indemnify” mean?')).toMatch(/\*\*Indemnify\*\* means to promise to pay/)
    expect(defaultGuide('Is this risky: “Either party may terminate this agreement.”')).toMatch(/No notice period/)
    expect(defaultGuide('Is this risky: “Either party may terminate with 30 days notice.”')).not.toMatch(/No notice period/)
  })
})
