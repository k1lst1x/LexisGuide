import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'

const authMocks = vi.hoisted(() => ({
  authConfigured: true,
  cognitoGetCurrentUser: vi.fn(),
  cognitoGetIdToken: vi.fn().mockResolvedValue(undefined),
  cognitoSignOut: vi.fn(),
  cognitoSignIn: vi.fn(),
  setRememberDevice: vi.fn(),
}))

vi.mock('../aws', () => authMocks)
vi.mock('../SplashScreen', () => ({
  SplashScreen: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Complete splash</button>
  ),
}))
vi.mock('@paper-design/shaders-react', () => ({
  GrainGradient: () => <div data-testid="grain-gradient" />,
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('restores an existing Cognito session and signs the user out', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue({
      email: 'person@example.com',
      username: 'person@example.com',
    })
    authMocks.cognitoSignOut.mockResolvedValue(undefined)

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Complete splash' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    window.localStorage.setItem('lexisguide:chat-workspace:person@example.com', JSON.stringify({ turns: [{ role: 'user', content: 'Sensitive question' }] }))
    window.localStorage.setItem('lexisguide:space-messages', JSON.stringify({ personal: [{ text: 'Sensitive message' }] }))
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByText('person@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign Out & Exit' }))

    expect(authMocks.cognitoSignOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('lexisguide:chat-workspace:person@example.com')).toBeNull()
    expect(window.localStorage.getItem('lexisguide:space-messages')).toBeNull()
  })

  it('does not restore a cached workspace identity when no Cognito session exists', async () => {
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)
    window.localStorage.setItem('lexisguide:workspace', 'open')
    window.localStorage.setItem('lexisguide:workspace-user', JSON.stringify({ email: 'saved@example.com', username: 'saved@example.com' }))
    window.localStorage.setItem('lexisguide:last-section', 'documents')

    render(<App />)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('lexisguide:workspace-user')).toBeNull()
    expect(window.localStorage.getItem('lexisguide:last-section')).toBeNull()
  })

  it('clears stale workspace data without relying on a cached identity marker', async () => {
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)
    window.localStorage.setItem('lexisguide:workspace', 'open')
    window.localStorage.setItem('lexisguide:space-messages', JSON.stringify({ personal: [{ text: 'Prior user message' }] }))
    window.localStorage.setItem('lexisguide:chat-workspace:prior@example.com', JSON.stringify({ turns: [{ role: 'user', content: 'Prior user chat' }] }))

    render(<App />)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('lexisguide:space-messages')).toBeNull()
    expect(window.localStorage.getItem('lexisguide:chat-workspace:prior@example.com')).toBeNull()
  })

  it('clears unscoped workspace data before opening a different Cognito user session', async () => {
    authMocks.cognitoGetCurrentUser.mockResolvedValue({ email: 'new@example.com', username: 'new@example.com' })
    window.localStorage.setItem('lexisguide:workspace', 'open')
    window.localStorage.setItem('lexisguide:space-messages', JSON.stringify({ personal: [{ text: 'Prior user message' }] }))
    window.localStorage.setItem('lexisguide:chat-workspace:prior@example.com', JSON.stringify({ turns: [{ role: 'user', content: 'Prior user chat' }] }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(window.localStorage.getItem('lexisguide:space-messages')).toBeNull()
    expect(window.localStorage.getItem('lexisguide:chat-workspace:prior@example.com')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('lexisguide:workspace-user') ?? '{}')).toEqual({
      email: 'new@example.com',
      username: 'new@example.com',
    })
  })

  it('renders the landing page for an unknown hosted route', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)
    window.history.pushState({}, '', '/missing-page')

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Complete splash' }))

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('opens the workspace after signing in with Cognito', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)
    authMocks.cognitoSignIn.mockResolvedValue({ isSignedIn: true })

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Complete splash' }))
    await user.click(await screen.findByRole('button', { name: 'Sign In' }))
    authMocks.cognitoGetCurrentUser.mockResolvedValue({ email: 'person@example.com', username: 'person@example.com' })
    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.type(screen.getByLabelText('Password'), 'Meadow-Paper-42!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(authMocks.cognitoSignIn).toHaveBeenCalledWith('person@example.com', 'Meadow-Paper-42!')
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(window.localStorage.getItem('lexisguide:workspace')).toBe('open')
    expect(JSON.parse(window.localStorage.getItem('lexisguide:workspace-user') ?? '{}')).toEqual({
      email: 'person@example.com',
      username: 'person@example.com',
    })
  })
})
