import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TransitionLoader } from '../TransitionLoader'

describe('TransitionLoader', () => {
  afterEach(() => vi.useRealTimers())

  it('does not render while hidden', () => {
    render(<TransitionLoader visible={false} />)

    expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument()
  })

  it('renders the supplied progress message while visible', () => {
    render(<TransitionLoader visible message="Preparing your legal audit..." />)

    expect(screen.getByText('Preparing your legal audit...')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })

  it('plays its exit before unmounting', () => {
    vi.useFakeTimers()
    const { rerender } = render(<TransitionLoader visible message="Opening your workspace" />)

    rerender(<TransitionLoader visible={false} message="" />)
    expect(screen.getByRole('status')).toHaveClass('is-leaving')
    expect(screen.getByText('Opening your workspace')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
