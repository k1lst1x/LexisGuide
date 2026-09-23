import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AssistantConsole } from '../chat/AssistantConsole'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('token-1') }))

const props = {
  storageKey: 'test:assistant',
  greeting: 'Hi, I have your lease in context.',
  suggestions: ['What should I review first?', 'Explain the highest-impact finding'],
  fallback: (question: string) => `Offline answer for ${question}`,
}

const reply = (text: string) => vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ reply: text }),
})

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('AssistantConsole', () => {
  it('shows one chat box and a greeting, with no empty transcript panel', () => {
    vi.stubGlobal('fetch', reply('unused'))
    const { container } = render(<AssistantConsole {...props} />)

    expect(screen.getByText('Hi, I have your lease in context.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask LexisGuide' })).toBeInTheDocument()
    // The transcript only exists once there is something in it.
    expect(container.querySelector('.ac-thread')).toBeNull()
  })

  it('answers a question and keeps the greeting as the transcript opener', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', reply('A lien is a claim against property.'))
    const { container } = render(<AssistantConsole {...props} />)

    await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))
    await user.type(document.querySelector('textarea')!, 'What is a lien?')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('A lien is a claim against property.')).toBeInTheDocument()
    expect(screen.getByText('What is a lien?')).toBeInTheDocument()
    // The greeting becomes the first message rather than disappearing, so the
    // conversation reads continuously.
    const thread = container.querySelector('.ac-thread')!
    expect(thread).not.toBeNull()
    expect(thread).toHaveTextContent('Hi, I have your lease in context.')
    expect(container.querySelector('.ac-greeting')).toBeNull()
  })

  it('sends a suggestion straight to the agent', async () => {
    const user = userEvent.setup()
    const fetchMock = reply('Start with the termination clause.')
    vi.stubGlobal('fetch', fetchMock)
    render(<AssistantConsole {...props} />)

    await user.click(screen.getByRole('button', { name: 'What should I review first?' }))

    expect(await screen.findByText('Start with the termination clause.')).toBeInTheDocument()
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages).toEqual([{ role: 'user', content: 'What should I review first?' }])
  })

  it('falls back to the local guide when the agent fails, and says so', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<AssistantConsole {...props} />)

    await user.click(screen.getByRole('button', { name: 'Explain the highest-impact finding' }))

    expect(await screen.findByText(/Offline answer for Explain the highest-impact finding/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('answering from the built-in guide')
  })

  it('hides the suggestions once a conversation is under way', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', reply('Answered.'))
    render(<AssistantConsole {...props} />)

    await user.click(screen.getByRole('button', { name: 'What should I review first?' }))
    await screen.findByText('Answered.')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'What should I review first?' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /New conversation/ })).toBeInTheDocument()
  })
})
