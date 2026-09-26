import { useEffect, useState } from 'react'
import { ArrowUpRight, Building2, LayoutDashboard, LogOut, ScrollText, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { cognitoGetCurrentUser, cognitoSignOut } from '../aws'
import { AdminApiError, adminApi, type AdminSession } from './api'
import { AdminLogin } from './AdminLogin'
import { useNotice } from './hooks'
import { ErrorNote, Spinner } from './ui'
import { AuditView } from './views/AuditView'
import { OverviewView } from './views/OverviewView'
import { UsersView } from './views/UsersView'
import { WorkspacesView } from './views/WorkspacesView'
import './admin.css'

type Section = 'overview' | 'users' | 'workspaces' | 'audit'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Users; blurb: string }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, blurb: 'Accounts, data, and recent admin activity at a glance.' },
  { id: 'users', label: 'Accounts', icon: Users, blurb: 'Find a person or change their access.' },
  { id: 'workspaces', label: 'Workspaces', icon: Building2, blurb: 'Every shared workspace, its host, and its members.' },
  { id: 'audit', label: 'Audit log', icon: ScrollText, blurb: 'Who changed what, and when.' },
]

const sectionFromHash = (): Section => {
  const hash = window.location.hash.replace('#', '')
  return SECTIONS.some((section) => section.id === hash) ? hash as Section : 'overview'
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden'; email: string; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready'; session: AdminSession }

/** Work out who is here and whether the API accepts them as an admin. */
async function identify(): Promise<Phase> {
  const user = await cognitoGetCurrentUser()
  if (!user) return { kind: 'signed-out' }
  try {
    return { kind: 'ready', session: await adminApi.session() }
  } catch (caught) {
    if (caught instanceof AdminApiError && caught.status === 403) return { kind: 'forbidden', email: user.email, message: caught.message }
    if (caught instanceof AdminApiError && caught.status === 401) return { kind: 'signed-out' }
    return { kind: 'unavailable', message: (caught as Error).message || 'The admin API could not be reached.' }
  }
}

export default function AdminPortal() {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })

  useEffect(() => {
    document.title = 'Admin · LexisGuide'
    let live = true
    void identify().then((next) => { if (live) setPhase(next) })
    return () => { live = false }
  }, [])

  const check = () => {
    setPhase({ kind: 'checking' })
    void identify().then(setPhase)
  }

  const signOut = async () => {
    await cognitoSignOut().catch(() => {})
    setPhase({ kind: 'signed-out' })
  }

  if (phase.kind === 'checking') return <main className="adm-gate"><Spinner label="Checking admin access" /></main>
  if (phase.kind === 'signed-out') return <AdminLogin onSignedIn={check} />
  if (phase.kind === 'forbidden' || phase.kind === 'unavailable') {
    return (
      <main className="adm-gate">
        <section className="adm-gate-card" aria-labelledby="adm-refused-title">
          <div className="adm-gate-mark is-warn" aria-hidden="true"><ShieldAlert size={22} /></div>
          <h1 id="adm-refused-title">{phase.kind === 'forbidden' ? 'No admin access' : 'Admin portal unavailable'}</h1>
          {phase.kind === 'forbidden'
            ? <p className="adm-muted">You are signed in as <strong>{phase.email}</strong>, which is not in the admins group. Ask an existing admin to grant access, then sign in again.</p>
            : <ErrorNote message={phase.message} onRetry={check} />}
          <div className="adm-actions is-center">
            <button type="button" className="adm-btn is-primary" onClick={signOut}>Sign in with another account</button>
            <a className="adm-btn" href={import.meta.env.BASE_URL}>Back to LexisGuide</a>
          </div>
        </section>
      </main>
    )
  }
  return <AdminDashboard session={phase.session} onSignOut={signOut} />
}

function AdminDashboard({ session, onSignOut }: { session: AdminSession; onSignOut: () => void }) {
  const [section, setSection] = useState<Section>(sectionFromHash)
  const [notice, notify] = useNotice()

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: Section) => {
    setSection(next)
    window.history.replaceState(null, '', `#${next}`)
  }
  const current = SECTIONS.find((item) => item.id === section)!

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="adm-brand-mark" aria-hidden="true"><ShieldCheck size={17} /></span>
          <span>
            <span className="adm-brand-name">LexisGuide</span>
            <span className="adm-brand-sub">Admin</span>
          </span>
        </div>
        <nav aria-label="Admin sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`adm-nav${section === id ? ' is-active' : ''}`}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="adm-side-foot">
          <a className="adm-nav" href={import.meta.env.BASE_URL}><ArrowUpRight size={16} aria-hidden="true" /><span>Open LexisGuide</span></a>
          <div className="adm-me">
            <span className="adm-me-email" title={session.email}>{session.email}</span>
            <button type="button" className="adm-icon-btn" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-head">
          <h1>{current.label}</h1>
          <p className="adm-muted">{current.blurb}</p>
        </header>
        <div className="adm-content">
          {section === 'overview' && <OverviewView onOpen={go} />}
          {section === 'users' && <UsersView session={session} notify={notify} />}
          {section === 'workspaces' && <WorkspacesView notify={notify} />}
          {section === 'audit' && <AuditView />}
        </div>
      </main>
      {notice}
    </div>
  )
}
