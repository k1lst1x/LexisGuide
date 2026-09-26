import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AssistantConsole } from '../chat/AssistantConsole'
import { ChatWidget } from '../chat/ChatWidget'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('token-1') }))

type Call = { url: string; method: string; body: Record<string, unknown> }
let calls: Call[]

const chatCalls = () => calls.filter((call) => call.url.endsWith('/api/v1/chat'))
const savedTurns = () => {
  const saves = calls.filter((call) => call.method === 'PUT' && call.url.includes('/me/conversations/'))
  return (saves.at(-1)?.body.turns ?? []) as Array<{ content: string; attachments?: unknown[] }>
}

/** `null` from `answer` means the model never replies until the request is aborted. */
function stubServer(answer: (index: number) => string | null = (index) => `Answer ${index + 1}`) {
  let asked = 0
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, method, body })
    if (url.endsWith('/api/v1/chat')) {
      const next = answer(asked++)
      if (next === null) {
        // Never answers until aborted, like a slow model.
        return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
      }
      return Promise.resolve(new Response(JSON.stringify({ reply: next }), { status: 200 }))
    }
    if (url.includes('/me/conversations/') && method === 'GET') return Promise.resolve(new Response('null', { status: 404 }))
    return Promise.resolve(new Response('{}', { status: 200 }))
  }))
}

const props = {
  storageKey: 'test:files',
  greeting: 'Hi there.',
  fallback: (question: string) => `Offline answer for ${question}`,
}

beforeEach(() => { window.localStorage.clear(); calls = [] })
afterEach(() => vi.unstubAllGlobals())

async function type(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))
  const box = document.querySelector('textarea')!
  // Pasting is how long text arrives; typing 12,000 characters one by one is slow.
  fireEvent.change(box, { target: { value: text } })
  box.focus()
}

describe('Long messages', () => {
  it('sends and keeps a long message in full instead of losing it', async () => {
    const user = userEvent.setup()
    stubServer()
    render(<AssistantConsole {...props} />)
    const long = 'The landlord may enter the premises at any time. '.repeat(240) // ~12,000 characters

    await type(user, long)
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Answer 1')).toBeInTheDocument()
    const sent = chatCalls()[0].body.messages as Array<{ content: string }>
    expect(sent.at(-1)!.content).toHaveLength(long.trim().length)
    await waitFor(() => expect(savedTurns().some((turn) => turn.content.length > 11_000)).toBe(true), { timeout: 3000 })
  })

  it('does not cut pasted text off at 4,000 characters', async () => {
    const user = userEvent.setup()
    stubServer()
    render(<AssistantConsole {...props} />)
    await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))

    expect(document.querySelector('textarea')!.maxLength).toBe(20_000)
  })
})

describe('Attached files', () => {
  it('reads an attached file, sends its text with the question, and keeps it for follow-ups', async () => {
    const user = userEvent.setup()
    stubServer()
    render(<AssistantConsole {...props} />)

    const file = new File(['Section 9: the tenant pays for all repairs.'], 'lease.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('Choose files to attach'), file)
    const staged = await screen.findByRole('list', { name: 'Files to send' })
    expect(within(staged).getByText('lease.txt')).toBeInTheDocument()

    await type(user, 'Who pays for repairs?')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Answer 1')).toBeInTheDocument()

    const first = chatCalls()[0].body.context as { attachments: Array<{ name: string; text: string }> }
    expect(first.attachments).toHaveLength(1)
    expect(first.attachments[0]).toMatchObject({ name: 'lease.txt', text: 'Section 9: the tenant pays for all repairs.' })
    // The question shows the file it carried, and the chip is cleared.
    expect(within(screen.getByRole('list', { name: 'Attached files' })).getByText('lease.txt')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Files to send' })).not.toBeInTheDocument()

    await type(user, 'And the deposit?')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Answer 2')).toBeInTheDocument()
    const followUp = chatCalls()[1].body.context as { attachments: Array<{ name: string }> }
    expect(followUp.attachments.map((item) => item.name)).toEqual(['lease.txt'])
  })

  it('sends an attached file on its own with a default question', async () => {
    const user = userEvent.setup()
    stubServer()
    render(<AssistantConsole {...props} />)

    await user.upload(screen.getByLabelText('Choose files to attach'), new File(['Notice text'], 'notice.txt', { type: 'text/plain' }))
    await screen.findByRole('list', { name: 'Files to send' })
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('Answer 1')).toBeInTheDocument()
    const sent = chatCalls()[0].body.messages as Array<{ content: string }>
    expect(sent.at(-1)!.content).toMatch(/review the attached file/)
  })

  it('attaches a workspace document from the popup without uploading it', async () => {
    const user = userEvent.setup()
    stubServer()
    render(
      <ChatWidget
        {...props}
        open
        documents={[{ id: 'doc-1', title: 'Oak Street lease', type: 'Lease', text: 'Rent is due on the first.' }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Attach files' }))
    await user.click(screen.getByRole('menuitem', { name: /Oak Street lease/ }))
    await user.type(screen.getByRole('textbox', { name: 'Ask LexisGuide' }), 'When is rent due?{Enter}')

    expect(await screen.findByText('Answer 1')).toBeInTheDocument()
    const context = chatCalls()[0].body.context as { attachments: Array<{ name: string; text: string }> }
    expect(context.attachments[0]).toMatchObject({ name: 'Oak Street lease', text: 'Rent is due on the first.' })
  })
})

describe('Stop and regenerate', () => {
  it('stops a slow answer, then regenerates it on request', async () => {
    const user = userEvent.setup()
    stubServer((index) => (index === 0 ? null : 'Fresh answer'))
    render(<ChatWidget {...props} open />)

    await user.type(screen.getByRole('textbox', { name: 'Ask LexisGuide' }), 'Explain clause 4{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Stop answer' }))

    expect(await screen.findByText(/Stopped/)).toBeInTheDocument()
    expect(screen.queryByText(/Offline answer/)).not.toBeInTheDocument()

    // Nothing to regenerate from until an answer exists; ask again instead.
    await user.type(screen.getByRole('textbox', { name: 'Ask LexisGuide' }), 'Explain clause 4 again{Enter}')
    expect(await screen.findByText('Fresh answer')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Regenerate answer' }))
    await waitFor(() => expect(chatCalls()).toHaveLength(3))
    const regenerated = chatCalls()[2].body.messages as Array<{ role: string; content: string }>
    expect(regenerated.at(-1)).toEqual({ role: 'user', content: 'Explain clause 4 again' })
  })
})
