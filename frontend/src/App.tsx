import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { Hub } from 'aws-amplify/utils'
import AuthSectionOne from '@/components/ui/auth-section-1'
import { DashboardV2 } from './DashboardV2'
import { SplashScreen } from './SplashScreen'
import { TransitionLoader } from './TransitionLoader'
import { cognitoGetCurrentUser, cognitoSignOut } from './aws'
import { Landing } from './landing/Landing'

const WORKSPACE_KEY = 'lexisguide:workspace'
const WORKSPACE_USER_KEY = 'lexisguide:workspace-user'
const ACCOUNT_WORKSPACE_STORAGE_KEYS = [
  WORKSPACE_KEY,
  WORKSPACE_USER_KEY,
  'lexisguide:last-section',
  'lexisguide:document-tutorial-seen',
  'lexisguide:space-messages',
  'lexisguide:resolved-findings',
  'lexisguide:local-workspaces',
  'lexisguide:local-workspace-invites',
]

function clearAccountWorkspaceStorage() {
  for (const key of ACCOUNT_WORKSPACE_STORAGE_KEYS) window.localStorage.removeItem(key)
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith('lexisguide:chat-')) window.localStorage.removeItem(key)
  }
}

function readWorkspaceUser() {
  try {
    const value = window.localStorage.getItem(WORKSPACE_USER_KEY)
    if (!value) return null
    const user = JSON.parse(value) as { email?: unknown; username?: unknown }
    return typeof user.email === 'string' && typeof user.username === 'string'
      ? { email: user.email, username: user.username }
      : null
  } catch {
    return null
  }
}

/* ═════════════════════════════════════════════════════════════════
   APP
   ═════════════════════════════════════════════════════════════════ */
export function App() {
  const [splashDone, setSplashDone] = useState(() => window.localStorage.getItem(WORKSPACE_KEY) === 'open' || window.location.pathname.endsWith('/dashboard') || window.location.hash === '#dashboard')
  const [revealed, setRevealed] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [dashOpen, setDashOpen] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionMsg, setTransitionMsg] = useState('')
  const [currentUser, setCurrentUser] = useState<{ email: string; username: string } | null>(null)
  const [toast, setToast] = useState('')

  // Check existing session on mount
  useEffect(() => {
    let mounted = true
    const wantsWorkspace = window.location.pathname.endsWith('/dashboard') || window.location.hash === '#dashboard' || window.localStorage.getItem(WORKSPACE_KEY) === 'open'
    const savedUser = readWorkspaceUser()
    cognitoGetCurrentUser()
      .then((user) => {
        if (!mounted) return
        // Only a live Cognito session opens the workspace. Local storage says
        // what this browser last did, never who it is, so it cannot stand in
        // for a session: the workspace holds the person's own documents.
        if (user) {
          const restoredUser = { email: user.email, username: user.username }
          const shouldOpenWorkspace = window.localStorage.getItem(WORKSPACE_KEY) !== 'closed'
          if (!savedUser || savedUser.email !== restoredUser.email) clearAccountWorkspaceStorage()
          setCurrentUser(restoredUser)
          window.localStorage.setItem(WORKSPACE_USER_KEY, JSON.stringify(restoredUser))
          if (shouldOpenWorkspace) setDashOpen(true)
        } else {
          // Never treat browser storage as proof of an authenticated identity.
          // Clear stale workspace data even if its cached user marker is absent or invalid.
          clearAccountWorkspaceStorage()
          if (wantsWorkspace) setAuthOpen(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setSessionReady(true)
      })
    return () => { mounted = false }
  }, [])

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 3500)
      return () => clearTimeout(t)
    }
  }, [toast])

  const handleAuthSuccess = (email: string) => {
    const savedUser = readWorkspaceUser()
    if (savedUser?.email !== email) clearAccountWorkspaceStorage()
    setAuthOpen(false)
    setCurrentUser({ email, username: email })
    setDashOpen(true)
    window.localStorage.setItem(WORKSPACE_KEY, 'open')
    window.localStorage.setItem(WORKSPACE_USER_KEY, JSON.stringify({ email, username: email }))
    setToast(`Signed in as ${email}`)
  }

  const handleSignOut = async () => {
    await cognitoSignOut().catch(() => {})
    setCurrentUser(null)
    setDashOpen(false)
    clearAccountWorkspaceStorage()
    setToast('Signed out of AWS session.')
  }

  // Google/Apple sign-in returns to /auth/callback; Amplify exchanges the code, then tells us here.
  useEffect(() => {
    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect') {
        void cognitoGetCurrentUser().then((user) => {
          if (user) handleAuthSuccess(user.email)
        })
      }
      if (payload.event === 'signInWithRedirect_failure') setToast('Sign-in was cancelled or failed. Please try again.')
      if (payload.event === 'signInWithRedirect' || payload.event === 'signInWithRedirect_failure') {
        const base = import.meta.env.BASE_URL
        if (window.location.pathname.endsWith('/auth/callback')) window.history.replaceState({}, '', base)
      }
    })
  }, [])

  // The loader sheet fully covers the screen at ~600ms; swap screens underneath, then let it sweep away.
  const openDashboard = useCallback(() => {
    // Without a session there is no workspace to open, so ask them to sign in
    // rather than play the transition and land back on the homepage.
    if (!currentUser) {
      setAuthOpen(true)
      return
    }
    window.localStorage.setItem(WORKSPACE_KEY, 'open')
    setTransitionMsg('Opening your workspace')
    setTransitioning(true)
    window.setTimeout(() => setDashOpen(true), 650)
    window.setTimeout(() => setTransitioning(false), 1500)
  }, [currentUser])

  const closeDashboard = useCallback(() => {
    window.localStorage.setItem(WORKSPACE_KEY, 'closed')
    setTransitionMsg('Back to the homepage')
    setTransitioning(true)
    window.setTimeout(() => setDashOpen(false), 650)
    window.setTimeout(() => setTransitioning(false), 1300)
  }, [])

  // The splash lifts to reveal the app, so the page mounts (and animates in) just before it fades.
  const showApp = revealed || splashDone

  let screen: ReactNode = null
  if (showApp && !sessionReady) {
    screen = <TransitionLoader visible message="Restoring your workspace" />
  } else if (showApp && authOpen) {
    screen = (
      <AuthSectionOne
        onSuccess={handleAuthSuccess}
        onCancel={() => setAuthOpen(false)}
        initialMode="sign-in"
      />
    )
  } else if (showApp && dashOpen && currentUser) {
    screen = <DashboardV2 onClose={closeDashboard} onSignOut={handleSignOut} userEmail={currentUser.email} />
  } else if (showApp) {
    screen = (
      <Landing
        userEmail={currentUser?.email}
        onOpenWorkspace={openDashboard}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={handleSignOut}
      />
    )
  }

  return (
    <>
      {screen}
      {showApp && sessionReady && <TransitionLoader visible={transitioning} message={transitionMsg} />}
      {toast && <div className="toast-notification">{toast}</div>}
      {!splashDone && (
        <SplashScreen ready={sessionReady} onReveal={() => setRevealed(true)} onComplete={() => setSplashDone(true)} />
      )}
    </>
  )
}

export default App
