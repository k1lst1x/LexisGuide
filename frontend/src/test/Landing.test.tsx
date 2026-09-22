import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Landing } from '../landing/Landing'

describe('Landing', () => {
  it('opens the workspace from the hero and switches product preview tabs', async () => {
    const user = userEvent.setup()
    const onOpenWorkspace = vi.fn()
    render(<Landing onOpenWorkspace={onOpenWorkspace} onSignIn={vi.fn()} onSignOut={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1, name: /plain-language guide to legal documents/i })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Explain' }))
    expect(screen.getByRole('tab', { name: 'Explain' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('In plain language')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /review a document free/i })[0])
    expect(onOpenWorkspace).toHaveBeenCalledOnce()
  })

  it('shows account actions for a signed-in visitor', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    render(<Landing userEmail="person@example.com" onOpenWorkspace={vi.fn()} onSignIn={vi.fn()} onSignOut={onSignOut} />)

    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('expands answers in the FAQ', async () => {
    const user = userEvent.setup()
    render(<Landing onOpenWorkspace={vi.fn()} onSignIn={vi.fn()} onSignOut={vi.fn()} />)

    const question = screen.getByRole('button', { name: 'Is this legal advice?' })
    expect(question).toHaveAttribute('aria-expanded', 'false')
    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
  })
})
