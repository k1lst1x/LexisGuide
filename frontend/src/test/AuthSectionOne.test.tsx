import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AuthSectionOne from '../components/ui/auth-section-1'

const cognito = vi.hoisted(() => ({
  configured: true,
  cognitoSignIn: vi.fn(),
  cognitoSignUp: vi.fn(),
  cognitoResetPassword: vi.fn(),
  cognitoConfirmResetPassword: vi.fn(),
  cognitoGoogleSignIn: vi.fn(),
  cognitoGetCurrentUser: vi.fn(),
  setRememberDevice: vi.fn(),
}))

vi.mock('../aws', () => ({
  get authConfigured() { return cognito.configured },
  cognitoSignIn: cognito.cognitoSignIn,
  cognitoSignUp: cognito.cognitoSignUp,
  cognitoResetPassword: cognito.cognitoResetPassword,
  cognitoConfirmResetPassword: cognito.cognitoConfirmResetPassword,
  cognitoGoogleSignIn: cognito.cognitoGoogleSignIn,
  cognitoGetCurrentUser: cognito.cognitoGetCurrentUser,
  setRememberDevice: cognito.setRememberDevice,
}))

const cognitoError = (name: string, message = '') => Object.assign(new Error(message), { name })
const STRONG = 'Meadow-Paper-42!'

beforeEach(() => {
  vi.clearAllMocks()
  cognito.configured = true
  cognito.cognitoGetCurrentUser.mockResolvedValue({ email: 'person@example.com' })
})

async function fillSignIn(user: ReturnType<typeof userEvent.setup>, password = STRONG) {
  await user.type(screen.getByLabelText('Email address'), 'person@example.com')
  await user.type(screen.getByLabelText('Password'), password)
}

describe('AuthSectionOne', () => {
  it('signs in with Cognito and reports the account email', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    cognito.cognitoSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })
    render(<AuthSectionOne initialMode="sign-in" onSuccess={onSuccess} />)

    await fillSignIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(cognito.cognitoSignIn).toHaveBeenCalledWith('person@example.com', STRONG)
    expect(cognito.setRememberDevice).toHaveBeenCalledWith(true)
    expect(onSuccess).toHaveBeenCalledWith('person@example.com')
  })

  it('explains a wrong password in plain language', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    cognito.cognitoSignIn.mockRejectedValue(cognitoError('NotAuthorizedException', 'Incorrect username or password.'))
    render(<AuthSectionOne initialMode="sign-in" onSuccess={onSuccess} />)

    await fillSignIn(user, 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("That email and password don't match")
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('creates an account and goes straight in, with no code to enter', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    // The pool's pre-sign-up trigger confirms the account, so Cognito reports
    // it done rather than asking for a code.
    cognito.cognitoSignUp.mockResolvedValue({ nextStep: { signUpStep: 'DONE' } })
    cognito.cognitoSignIn.mockResolvedValue({ isSignedIn: true })
    render(<AuthSectionOne onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText('First Name'), 'Maya')
    await user.type(screen.getByLabelText('Last Name'), 'Reyes')
    await fillSignIn(user)
    await user.click(screen.getByLabelText(/By creating an account/i))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(cognito.cognitoSignUp).toHaveBeenCalledWith('person@example.com', STRONG, 'Maya Reyes')
    expect(onSuccess).toHaveBeenCalledWith('person@example.com')
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()
  })

  it('reports a problem rather than inventing a code step if sign-up is not confirmed', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    // Only reachable if the trigger is missing or failed.
    cognito.cognitoSignUp.mockResolvedValue({ nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } })
    render(<AuthSectionOne onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText('First Name'), 'Maya')
    await fillSignIn(user)
    await user.click(screen.getByLabelText(/By creating an account/i))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('support@lexisguide.app')
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows the live password checklist while creating an account', async () => {
    const user = userEvent.setup()
    render(<AuthSectionOne />)
    const rules = screen.getByRole('list', { name: 'Password requirements' })

    await user.type(screen.getByLabelText('Password'), 'short')
    expect(rules.querySelectorAll('.is-met')).toHaveLength(1)

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), STRONG)
    expect(rules.querySelectorAll('.is-met')).toHaveLength(5)
  })

  it('points an old unconfirmed account at support, since no code can be sent', async () => {
    const user = userEvent.setup()
    cognito.cognitoSignIn.mockRejectedValue(cognitoError('UserNotConfirmedException'))
    render(<AuthSectionOne initialMode="sign-in" />)

    await fillSignIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('support@lexisguide.app')
    expect(screen.queryByRole('button', { name: 'Send a new code' })).not.toBeInTheDocument()
  })

  it('resets a forgotten password and signs in with the new one', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    cognito.cognitoResetPassword.mockResolvedValue({})
    cognito.cognitoConfirmResetPassword.mockResolvedValue({})
    cognito.cognitoSignIn.mockResolvedValue({ isSignedIn: true })
    render(<AuthSectionOne initialMode="sign-in" onSuccess={onSuccess} />)

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset code' }))
    await user.type(await screen.findByLabelText('Verification code'), '654321')
    await user.type(screen.getByLabelText('New password'), STRONG)
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(cognito.cognitoConfirmResetPassword).toHaveBeenCalledWith('person@example.com', '654321', STRONG)
    expect(cognito.cognitoSignIn).toHaveBeenCalledWith('person@example.com', STRONG)
    expect(onSuccess).toHaveBeenCalledWith('person@example.com')
  })

  it('offers Google as the only social sign-in', async () => {
    const user = userEvent.setup()
    render(<AuthSectionOne />)

    await user.click(screen.getByRole('button', { name: 'Sign up with Google' }))

    expect(cognito.cognitoGoogleSignIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /Apple/i })).not.toBeInTheDocument()
  })

  it('requires the terms and supports returning to the landing page', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<AuthSectionOne onCancel={onCancel} />)

    await fillSignIn(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(cognito.cognitoSignUp).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Return to LexisGuide/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('offers no way in when sign-in is not configured in this build', async () => {
    const user = userEvent.setup()
    cognito.configured = false
    render(<AuthSectionOne initialMode="sign-in" />)

    expect(screen.getByText(/Sign-in isn't available in this build yet/)).toBeInTheDocument()
    // There is no demo workspace to fall back to: the workspace is real data.
    expect(screen.queryByRole('button', { name: /demo/i })).not.toBeInTheDocument()

    await fillSignIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(cognito.cognitoSignIn).not.toHaveBeenCalled()
  })

  it('switches between sign-in and sign-up from the side panel', async () => {
    const user = userEvent.setup()
    render(<AuthSectionOne initialMode="sign-in" />)

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
    expect(screen.getByLabelText('First Name')).toBeInTheDocument()
  })
})
