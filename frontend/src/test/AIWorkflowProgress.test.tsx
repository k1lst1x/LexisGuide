import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AIWorkflowProgress } from '../components/AIWorkflowProgress'

describe('AIWorkflowProgress', () => {
  it('renders the task workflow with in-progress, completed and pending badges', () => {
    render(
      <AIWorkflowProgress
        isOpen={true}
        onClose={vi.fn()}
        mode="document-audit"
        autoCloseDelay={0}
      />
    )

    expect(screen.getByText('AI Autonomous Engine Active')).toBeInTheDocument()
    expect(screen.getByText('Research Document & Notice Requirements')).toBeInTheDocument()
    expect(screen.getByText('Extract agency details & case references')).toBeInTheDocument()
    expect(screen.getByText('Design System Architecture & Rule Packs')).toBeInTheDocument()
    expect(screen.getByText('Implementation Planning & Plain-Language Audit')).toBeInTheDocument()

    const inProgressBadges = screen.getAllByText('in-progress')
    expect(inProgressBadges.length).toBeGreaterThan(0)

    const pendingBadges = screen.getAllByText('pending')
    expect(pendingBadges.length).toBeGreaterThan(0)
  })

  it('switches to Project Tasks preset matching the user screenshot', async () => {
    const user = userEvent.setup()
    render(
      <AIWorkflowProgress
        isOpen={true}
        onClose={vi.fn()}
        mode="document-audit"
        autoCloseDelay={0}
      />
    )

    await user.click(screen.getByRole('button', { name: /Project Tasks/i }))

    expect(screen.getByText('Research Project Requirements')).toBeInTheDocument()
    expect(screen.getByText('Interview stakeholders')).toBeInTheDocument()
    expect(screen.getByText('Review existing documentation')).toBeInTheDocument()
    expect(screen.getByText('Compile findings report')).toBeInTheDocument()
    expect(screen.getByText('Design System Architecture')).toBeInTheDocument()
    expect(screen.getByText('Implementation Planning')).toBeInTheDocument()
    expect(screen.getByText('Development Environment Setup')).toBeInTheDocument()
    expect(screen.getByText('Initial Development Sprint')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <AIWorkflowProgress
        isOpen={true}
        onClose={onClose}
        autoCloseDelay={0}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Close workflow modal' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <AIWorkflowProgress
        isOpen={false}
      />
    )

    expect(container.firstChild).toBeNull()
  })
})
