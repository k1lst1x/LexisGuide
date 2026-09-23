import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminPortal from '../admin/AdminPortal'
import { isAdminPath } from '../admin/route'

const authMocks = vi.hoisted(() => ({
  authConfigured: true,
  cognitoGetCurrentUser: vi.fn(),
  cognitoGetIdToken: vi.fn().mockResolvedValue('id-token'),
  cognitoSignIn: vi.fn(),
  cognitoSignOut: vi.fn().mockResolvedValue(undefined),
  cognitoConfirmNewPassword: vi.fn(),
  cognitoGoogleSignIn: vi.fn(),
}))

vi.mock('../aws', () => authMocks)

const SESSION = { sub: 'admin-sub', username: 'admin-user', email: 'admin@example.com', name: '' }
const PERSON = {
  username: 'person-user',
  sub: 'person-sub',
  email: 'person@example.com',
  name: 'Person',
  status: 'CONFIRMED',
  enabled: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  is_admin: false,
  provider: 'Email',
}
const OVERVIEW = {
  users: { total: 12, enabled: 11, disabled: 1, federated: 4, admins: 2 },
  data: { workspaces: 3, documents: 40, conversations: 9, lawyers_verified: 2, lawyers_locked: 1 },
  recent_actions: [],
}

type Route = { status?: number; body: unknown }
let routes: Record<string, Route | ((init?: RequestInit) => Route)>
const calls: Array<{ path: string; method: string }> = []

function reply({ status = 200, body }: Route) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  window.history.pushState({}, '', '/admin')
  authMocks.cognitoGetIdToken.mockResolvedValue('id-token')
  routes = {
    'GET /session': { body: SESSION },
    'GET /overview': { body: OVERVIEW },
  }
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1\/admin/, '').split('?')[0]
    const method = init?.method ?? 'GET'
    calls.push({ path, method })
    const route = routes[`${method} ${path}`]
    if (!route) return reply({ status: 404, body: { detail: `No fake for ${method} ${path}` } })
    return reply(typeof route === 'function' ? route(init) : route)
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('AdminPortal', () => {
  it('recognises its own path, with or without the Pages base', () => {
    expect(isAdminPath('/admin')).toBe(true)
    expect(isAdminPath('/admin/')).toBe(true)
    expect(isAdminPath('/dashboard')).toBe(false)
    expect(isAdminPath('/administrator')).toBe(false)
  })

  it('asks a signed-out visitor to sign in, then opens the dashboard', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValueOnce(null).mockResolvedValue({ email: SESSION.email, username: 'admin-user' })
    authMocks.cognitoSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })

    render(<AdminPortal />)

    await user.type(await screen.findByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(authMocks.cognitoSignIn).toHaveBeenCalledWith('admin@example.com', 'correct horse battery staple')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(await screen.findByText('12')).toBeInTheDocument()
  })

  it('asks for a new password when the account has a temporary one', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue(null)
    authMocks.cognitoSignIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' } })

    render(<AdminPortal />)
    await user.type(await screen.findByLabelText('Email'), 'new-admin@example.com')
    await user.type(screen.getByLabelText('Password'), 'Temp-Password-1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByLabelText(/New password/)).toBeInTheDocument()
  })

  it('refuses a signed-in account outside the admins group', async () => {
    authMocks.cognitoGetCurrentUser.mockResolvedValue({ email: 'person@example.com', username: 'person-user' })
    routes['GET /session'] = { status: 403, body: { detail: 'This account does not have admin access.' } }

    render(<AdminPortal />)

    expect(await screen.findByRole('heading', { name: 'No admin access' })).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()
    // Retried once with a refreshed token, in case the group was just granted.
    expect(authMocks.cognitoGetIdToken).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument()
  })

  it('disables an account only after confirmation', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue({ email: SESSION.email, username: 'admin-user' })
    let enabled = true
    routes['GET /users'] = { body: { users: [PERSON], next_token: '' } }
    routes['GET /users/person-user'] = () => ({
      body: {
        ...PERSON,
        enabled,
        display_name: '',
        documents: 2,
        conversations: 1,
        workspaces: [],
        lawyer_verification: { verified: false, attempts_used: 0, attempts_remaining: 3, max_attempts: 3, bar_number: '', jurisdiction: '', name: '', status: '', admitted_on: '', verified_at: '' },
      },
    })
    routes['POST /users/person-user/disable'] = () => { enabled = false; return { body: { ok: true } } }

    render(<AdminPortal />)
    await user.click(await screen.findByRole('button', { name: 'Accounts' }))
    await user.click(await screen.findByRole('button', { name: /person@example.com/ }))

    const drawer = await screen.findByRole('complementary', { name: 'Account person@example.com' })
    await user.click(await within(drawer).findByRole('button', { name: 'Disable' }))
    expect(calls.some((call) => call.method === 'POST')).toBe(false)

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Disable account' }))

    await waitFor(() => expect(calls).toContainEqual({ path: '/users/person-user/disable', method: 'POST' }))
    expect(await screen.findByText('person@example.com is disabled.')).toBeInTheDocument()
    expect(await within(drawer).findByRole('button', { name: 'Enable' })).toBeInTheDocument()
  })

  it('will not delete an account until its email is typed', async () => {
    const user = userEvent.setup()
    authMocks.cognitoGetCurrentUser.mockResolvedValue({ email: SESSION.email, username: 'admin-user' })
    routes['GET /users'] = { body: { users: [PERSON], next_token: '' } }
    routes['GET /users/person-user'] = {
      body: {
        ...PERSON,
        display_name: '',
        documents: 0,
        conversations: 0,
        workspaces: [],
        lawyer_verification: { verified: false, attempts_used: 0, attempts_remaining: 3, max_attempts: 3, bar_number: '', jurisdiction: '', name: '', status: '', admitted_on: '', verified_at: '' },
      },
    }
    routes['DELETE /users/person-user'] = { body: { ok: true } }
    window.history.replaceState(null, '', '/admin#users')

    render(<AdminPortal />)
    await user.click(await screen.findByRole('button', { name: /person@example.com/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete account' }))

    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'person@example.com')
    await user.click(confirm)

    await waitFor(() => expect(calls).toContainEqual({ path: '/users/person-user', method: 'DELETE' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /person@example.com/ })).not.toBeInTheDocument())
  })
})
