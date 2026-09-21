import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIWorkflowProgress } from '../components/AIWorkflowProgress'

describe('AIWorkflowProgress', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('renders the task workflow with in-progress, completed and pending badges', () => {
    render(
      <AIWorkflowProgress
        isOpen={true}
        onClose={vi.fn()}
        mode="document-audit"
        autoCloseDelay={0}
      />
    )

    expect(screen.getByText('Review in progress')).toBeInTheDocument()
    expect(screen.getByText('Read the document and identify its context')).toBeInTheDocument()
    expect(screen.getByText('Extract key parties, dates, and terms')).toBeInTheDocument()
    expect(screen.getByText('Flag potentially unfair or unclear clauses')).toBeInTheDocument()
    expect(screen.getByText('Compare findings with applicable guidance')).toBeInTheDocument()

    const inProgressBadges = screen.getAllByText('Working')
    expect(inProgressBadges.length).toBeGreaterThan(0)

    const pendingBadges = screen.getAllByText('Next')
    expect(pendingBadges.length).toBeGreaterThan(0)
  })

  it('renders the project-plan preset when that workflow was requested', () => {
    render(
      <AIWorkflowProgress
        isOpen={true}
        onClose={vi.fn()}
        mode="project-plan"
        autoCloseDelay={0}
      />
    )

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

  it('completes the workflow once and auto-closes after the configured delay', async () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    const onClose = vi.fn()
    render(
      <AIWorkflowProgress
        isOpen={true}
        onComplete={onComplete}
        onClose={onClose}
        autoCloseDelay={300}
        speedMultiplier={10}
      />
    )

    for (let step = 0; step < 6; step += 1) {
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(onComplete).toHaveBeenCalledOnce()
    expect(screen.getByText('Review complete')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(300)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
