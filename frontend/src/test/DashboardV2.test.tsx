import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DashboardV2 } from '../DashboardV2'

describe('DashboardV2', () => {
  it('navigates to the linter and displays the selected finding', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} userEmail="person@example.com" />)

    await user.click(screen.getByRole('button', { name: 'Audit Linter' }))

    expect(screen.getByRole('heading', { name: 'Procedural Fairness Linter' })).toBeInTheDocument()
    expect(screen.getAllByText('Appeal filing deadline is vague')).toHaveLength(2)
  })

  it('adds a non-empty team discussion message', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Team' }))
    await user.type(screen.getByPlaceholderText('Type a message...'), 'Please cite the appeal rule.')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByText('Please cite the appeal rule.')).toBeInTheDocument()
    expect(screen.getByText('You (Reviewer)')).toBeInTheDocument()
  })

  it('exits through the sidebar control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DashboardV2 onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Exit Dashboard' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
