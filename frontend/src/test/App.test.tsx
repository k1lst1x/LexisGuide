import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'

const authMocks = vi.hoisted(() => ({
  cognitoGetCurrentUser: vi.fn(),
  cognitoSignOut: vi.fn(),
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
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByText('person@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign Out & Exit' }))

    expect(authMocks.cognitoSignOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('restores the last workspace even when local sign-in has no Cognito session', async () => {
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)
    window.localStorage.setItem('lexisguide:workspace', 'open')
    window.localStorage.setItem('lexisguide:workspace-user', JSON.stringify({ email: 'saved@example.com', username: 'saved@example.com' }))
    window.localStorage.setItem('lexisguide:last-section', 'documents')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument()
  })

  it('renders the landing page for an unknown hosted route', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)
    window.history.pushState({}, '', '/missing-page')

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Complete splash' }))

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('opens the local workspace after a valid email sign-in', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Complete splash' }))
    await user.click(await screen.findByRole('button', { name: 'Sign In' }))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(window.localStorage.getItem('lexisguide:workspace')).toBe('open')
    expect(JSON.parse(window.localStorage.getItem('lexisguide:workspace-user') ?? '{}')).toEqual({
      email: 'user@lexisguide.gov',
      username: 'user@lexisguide.gov',
    })
  })

})
