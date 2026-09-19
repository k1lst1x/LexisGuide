import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TransitionLoader } from '../TransitionLoader'

describe('TransitionLoader', () => {
  it('does not render while hidden', () => {
    render(<TransitionLoader visible={false} />)

    expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument()
  })

  it('renders the supplied progress message while visible', () => {
    render(<TransitionLoader visible message="Preparing your legal audit..." />)

    expect(screen.getByText('Preparing your legal audit...')).toBeInTheDocument()
  })
})
