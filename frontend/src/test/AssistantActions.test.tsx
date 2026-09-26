import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatWidget } from '../chat/ChatWidget'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('token-1') }))

function agentReplies(body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })))
}

async function ask(question: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open LexisGuide assistant' }))
  await user.type(screen.getByRole('textbox', { name: 'Ask LexisGuide' }), question)
  await user.click(screen.getByRole('button', { name: 'Send question' }))
  return user
}

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('Assistant actions', () => {
  it('does what the person told it to, once, and says so', async () => {
    agentReplies({
      reply: 'Done: the notice period now says 30 days.',
      workspace_actions: ['apply_rewrite'],
      auto_apply: true,
      tasks: [{ title: 'Send the revised lease to Maya', priority: 'high' }],
    })
    const onWorkspaceAction = vi.fn()
    const onTasks = vi.fn()
    render(<ChatWidget storageKey="auto-chat" onWorkspaceAction={onWorkspaceAction} onTasks={onTasks} />)

    await ask('Fix this clause and add a task to send it to Maya')

    expect(await screen.findByText('Done: the notice period now says 30 days.')).toBeInTheDocument()
    await waitFor(() => expect(onWorkspaceAction).toHaveBeenCalledWith('apply_rewrite'))
    expect(onWorkspaceAction).toHaveBeenCalledTimes(1)
    expect(onTasks).toHaveBeenCalledWith([{ title: 'Send the revised lease to Maya', priority: 'high' }])
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Applied the fix · Added 1 task')
    expect(screen.queryByRole('button', { name: 'Apply the fix' })).not.toBeInTheDocument()
  })

  it('only offers actions and tasks when the person did not ask for them', async () => {
    agentReplies({
      reply: 'Maya asked you to confirm October 14.',
      workspace_actions: ['apply_rewrite'],
      tasks: [{ title: 'Reply to Maya', priority: 'high' }, { title: 'Check the filing fee', priority: 'low' }],
    })
    const onWorkspaceAction = vi.fn()
    const onTasks = vi.fn()
    render(<ChatWidget storageKey="offer-chat" onWorkspaceAction={onWorkspaceAction} onTasks={onTasks} />)

    const user = await ask('What did I miss in my messages?')

    expect(await screen.findByText('Maya asked you to confirm October 14.')).toBeInTheDocument()
    expect(onWorkspaceAction).not.toHaveBeenCalled()
    expect(onTasks).not.toHaveBeenCalled()
    expect(screen.getByText('Reply to Maya')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add these 2 tasks' }))
    expect(onTasks).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Added to Tasks' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Apply the fix' }))
    expect(onWorkspaceAction).toHaveBeenCalledWith('apply_rewrite')
  })

  it('never re-runs an action from a conversation restored after a reload', async () => {
    window.localStorage.setItem('restored-chat', JSON.stringify({
      conversationId: 'conv-restored',
      turns: [
        { id: 'welcome', role: 'assistant', content: 'Hi' },
        { id: 't-1', role: 'user', content: 'Fix it' },
        { id: 't-2', role: 'assistant', content: 'Fixed.', workspaceActions: ['apply_rewrite'], autoApply: true },
      ],
    }))
    const onWorkspaceAction = vi.fn()
    render(<ChatWidget storageKey="restored-chat" onWorkspaceAction={onWorkspaceAction} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open LexisGuide assistant' }))

    expect(await screen.findByText('Fixed.')).toBeInTheDocument()
    expect(onWorkspaceAction).not.toHaveBeenCalled()
  })
})
