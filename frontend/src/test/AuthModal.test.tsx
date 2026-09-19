import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModal } from '../AuthModal'

const authMocks = vi.hoisted(() => ({
  cognitoResetPassword: vi.fn(),
  cognitoSignIn: vi.fn(),
}))

vi.mock('../aws', () => ({
  cognitoAppleSignIn: vi.fn(),
  cognitoConfirmResetPassword: vi.fn(),
  cognitoConfirmSignUp: vi.fn(),
  cognitoGoogleSignIn: vi.fn(),
  cognitoResetPassword: authMocks.cognitoResetPassword,
  cognitoSignIn: authMocks.cognitoSignIn,
  cognitoSignUp: vi.fn(),
}))

describe('AuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits trimmed credentials and notifies its parent after sign-in', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    authMocks.cognitoSignIn.mockResolvedValue({ isSignedIn: true })

    render(<AuthModal onClose={vi.fn()} onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText('Email'), '  person@example.com  ')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: /sign in with aws cognito/i }))

    expect(authMocks.cognitoSignIn).toHaveBeenCalledWith(
      'person@example.com',
      'correct-horse-battery-staple',
    )
    expect(onSuccess).toHaveBeenCalledWith('person@example.com')
  })

  it('shows a provider error without reporting a successful sign-in', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    authMocks.cognitoSignIn.mockRejectedValue(new Error('Invalid credentials'))

    render(<AuthModal onClose={vi.fn()} onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Password'), 'incorrect-password')
    await user.click(screen.getByRole('button', { name: /sign in with aws cognito/i }))

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('moves through the password-reset flow', async () => {
    const user = userEvent.setup()
    authMocks.cognitoResetPassword.mockResolvedValue({})

    render(<AuthModal onClose={vi.fn()} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    expect(authMocks.cognitoResetPassword).toHaveBeenCalledWith('person@example.com')
    expect(await screen.findByRole('heading', { name: 'Enter new password.' })).toBeInTheDocument()
  })
})
