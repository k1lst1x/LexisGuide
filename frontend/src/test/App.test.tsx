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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    expect(await screen.findByText('person@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))

    expect(authMocks.cognitoSignOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
