import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AuthSectionOne from '../components/ui/auth-section-1'

vi.mock('@paper-design/shaders-react', () => ({
  GrainGradient: () => <div data-testid="grain-gradient" />,
}))

describe('AuthSectionOne', () => {
  it('submits the edited email to the parent after accepting the terms', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<AuthSectionOne onSuccess={onSuccess} onCancel={vi.fn()} />)

    const email = screen.getByLabelText('Email address')
    await user.clear(email)
    await user.type(email, 'student@example.com')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(onSuccess).toHaveBeenCalledWith('student@example.com')
  })

  it('honors browser terms validation and supports returning to the landing page', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onCancel = vi.fn()
    render(<AuthSectionOne onSuccess={onSuccess} onCancel={onCancel} />)

    await user.click(screen.getByLabelText(/By creating an account/i))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(onSuccess).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Return to LexisGuide/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('uses the same parent callback for social buttons', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<AuthSectionOne onSuccess={onSuccess} />)

    await user.click(screen.getByRole('button', { name: 'Sign up with Google' }))
    expect(onSuccess).toHaveBeenCalledWith('user@lexisguide.gov')
  })

  it('switches from sign-in to sign-up from the right-side panel', async () => {
    const user = userEvent.setup()
    render(<AuthSectionOne initialMode="sign-in" />)

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create an account' }))

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
    expect(screen.getByLabelText('First Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument()
  })
})
