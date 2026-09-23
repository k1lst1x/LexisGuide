import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronRight, LogOut, Search, ShieldCheck, ShieldOff, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { adminApi, formatDate, type AdminSession, type AdminUser, type UserDetail } from '../api'
import { useAdminData } from '../hooks'
import { Badge, ConfirmDialog, Empty, ErrorNote, Spinner } from '../ui'

type Props = { session: AdminSession; notify: (message: string) => void }

function StatusBadges({ user }: { user: AdminUser }) {
  return (
    <span className="adm-badges">
      {user.is_admin && <Badge tone="ink">Admin</Badge>}
      {!user.enabled && <Badge tone="red">Disabled</Badge>}
      {user.provider !== 'Email' && <Badge>{user.provider}</Badge>}
      {user.status === 'UNCONFIRMED' && <Badge tone="amber">Unconfirmed</Badge>}
      {user.status === 'FORCE_CHANGE_PASSWORD' && <Badge tone="amber">Temporary password</Badge>}
      {user.status === 'RESET_REQUIRED' && <Badge tone="amber">Reset required</Badge>}
    </span>
  )
}

export function UsersView({ session, notify }: Props) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [nextToken, setNextToken] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback((search: string) => {
    setError('')
    setUsers(null)
    adminApi.users(search)
      .then((page) => { setUsers(page.users); setNextToken(page.next_token) })
      .catch((caught: Error) => setError(caught.message))
  }, [])

  // Cognito matches an email prefix; wait for a pause in typing before asking.
  useEffect(() => {
    const timer = window.setTimeout(() => load(query.trim()), query ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [query, load])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const page = await adminApi.users(query.trim(), nextToken)
      setUsers((current) => [...(current ?? []), ...page.users])
      setNextToken(page.next_token)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  // Stable, because the open account panel reloads whenever this changes.
  const refreshRow = useCallback((updated: AdminUser | null, username: string) => {
    setUsers((current) => current && (updated
      ? current.map((user) => (user.username === username ? { ...user, ...updated } : user))
      : current.filter((user) => user.username !== username)))
  }, [])

  return (
    <div className="adm-split">
      <section className="adm-panel adm-grow">
        <div className="adm-panel-head">
          <div>
            <h2>Accounts</h2>
            <p className="adm-muted">Everyone who can sign in to LexisGuide.</p>
          </div>
          <label className="adm-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by email"
              aria-label="Search accounts by email"
              value={query}
              onChange={(event) => setQuery(event.target.value.replace(/["\\]/g, ''))}
            />
          </label>
        </div>

        {error && <ErrorNote message={error} onRetry={() => load(query.trim())} />}
        {!users && !error && <Spinner label="Loading accounts" />}
        {users && !users.length && <Empty>{query ? `No account email starts with “${query}”.` : 'No accounts yet.'}</Empty>}
        {users && users.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Account</th><th>Status</th><th className="adm-hide-sm">Created</th><th aria-label="Open" /></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.username}
                    className={selected === user.username ? 'is-selected' : undefined}
                    onClick={() => setSelected(user.username)}
                  >
                    <td>
                      <button type="button" className="adm-row-btn" onClick={() => setSelected(user.username)}>
                        <span className="adm-strong">{user.email || user.username}</span>
                        {user.name && <span className="adm-muted">{user.name}</span>}
                      </button>
                    </td>
                    <td><StatusBadges user={user} /></td>
                    <td className="adm-hide-sm adm-muted">{formatDate(user.created_at)}</td>
                    <td className="adm-chevron"><ChevronRight size={16} aria-hidden="true" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nextToken && (
          <button type="button" className="adm-btn adm-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>

      {selected && (
        <UserPanel
          key={selected}
          username={selected}
          session={session}
          notify={notify}
          onClose={() => setSelected(null)}
          onChanged={refreshRow}
        />
      )}
    </div>
  )
}

type Pending = {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  typeToConfirm?: string
  run: () => Promise<void>
}

type PanelProps = {
  username: string
  session: AdminSession
  notify: (message: string) => void
  onClose: () => void
  onChanged: (user: AdminUser | null, username: string) => void
}

function UserPanel({ username, session, notify, onClose, onChanged }: PanelProps) {
  const fetchUser = useCallback(() => adminApi.user(username), [username])
  const { data: detail, error, reload, setData } = useAdminData(fetchUser)
  const [pending, setPending] = useState<Pending | null>(null)
  const [verifying, setVerifying] = useState(false)

  /** Re-read the account after a change, and carry it into the list row too. */
  const load = async () => {
    const fresh = await adminApi.user(username)
    setData(() => fresh)
    onChanged(fresh, username)
  }

  const isSelf = detail?.sub === session.sub
  const label = detail?.email || username

  const act = (next: Omit<Pending, 'run'> & { run: () => Promise<unknown>; done: string; removed?: boolean }) => {
    setPending({
      ...next,
      run: async () => {
        await next.run()
        notify(next.done)
        if (next.removed) {
          onChanged(null, username)
          onClose()
        } else {
          await load()
        }
      },
    })
  }

  return (
    <aside className="adm-drawer" aria-label={`Account ${label}`}>
      <div className="adm-drawer-head">
        <div>
          <p className="adm-eyebrow">Account</p>
          <h2>{label}</h2>
        </div>
        <button type="button" className="adm-icon-btn" aria-label="Close account" onClick={onClose}><X size={16} /></button>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {!detail && !error && <Spinner />}
      {detail && (
        <div className="adm-drawer-body">
          <StatusBadges user={detail} />
          {isSelf && <p className="adm-hint">This is your account. Another admin must disable, delete, or demote it.</p>}

          <dl className="adm-facts">
            <div><dt>Display name</dt><dd>{detail.display_name || detail.name || '—'}</dd></div>
            <div><dt>Sign-in</dt><dd>{detail.provider === 'Email' ? 'Email and password' : detail.provider}</dd></div>
            <div><dt>Cognito status</dt><dd>{detail.status.replaceAll('_', ' ').toLowerCase()}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(detail.created_at, true)}</dd></div>
            <div><dt>Last changed</dt><dd>{formatDate(detail.updated_at, true)}</dd></div>
            <div><dt>Saved documents</dt><dd>{detail.documents}</dd></div>
            <div><dt>Conversations</dt><dd>{detail.conversations}</dd></div>
            <div><dt>User ID</dt><dd className="adm-mono">{detail.sub}</dd></div>
          </dl>

          <h3>Workspaces</h3>
          {detail.workspaces.length
            ? <ul className="adm-list">{detail.workspaces.map((workspace) => (
                <li key={workspace.id}><span>{workspace.name || workspace.id}</span><Badge tone={workspace.role === 'owner' ? 'green' : 'neutral'}>{workspace.role === 'owner' ? 'Host' : workspace.role}</Badge></li>
              ))}</ul>
            : <Empty>Not in any shared workspace.</Empty>}

          <h3>Lawyer verification</h3>
          <LawyerSection
            detail={detail}
            verifying={verifying}
            setVerifying={setVerifying}
            onReset={() => act({
              title: 'Reset bar verification?',
              body: <p>This clears {label}’s verification and gives back all {detail.lawyer_verification.max_attempts} attempts, so they can check their bar number again.</p>,
              confirmLabel: 'Reset verification',
              run: () => adminApi.resetLawyer(username),
              done: `Bar verification reset for ${label}.`,
            })}
            onVerified={async (message) => { notify(message); setVerifying(false); await load() }}
          />

          <h3>Account actions</h3>
          <div className="adm-actions">
            {detail.enabled ? (
              <button type="button" className="adm-btn" disabled={isSelf} onClick={() => act({
                title: 'Disable this account?',
                body: <p>{label} will be signed out everywhere and unable to sign in until an admin enables the account again. Their data is kept.</p>,
                confirmLabel: 'Disable account',
                danger: true,
                run: () => adminApi.disable(username),
                done: `${label} is disabled.`,
              })}><UserX size={15} aria-hidden="true" /> Disable</button>
            ) : (
              <button type="button" className="adm-btn" onClick={() => act({
                title: 'Enable this account?',
                body: <p>{label} will be able to sign in again.</p>,
                confirmLabel: 'Enable account',
                run: () => adminApi.enable(username),
                done: `${label} is enabled.`,
              })}><UserCheck size={15} aria-hidden="true" /> Enable</button>
            )}
            <button type="button" className="adm-btn" onClick={() => act({
              title: 'Sign out everywhere?',
              body: <p>Revokes every refresh token {label} holds. Each browser must sign in again within the hour.</p>,
              confirmLabel: 'Sign out everywhere',
              run: () => adminApi.signOut(username),
              done: `${label} was signed out everywhere.`,
            })}><LogOut size={15} aria-hidden="true" /> Sign out everywhere</button>
            {detail.is_admin ? (
              <button type="button" className="adm-btn" disabled={isSelf} onClick={() => act({
                title: 'Remove admin access?',
                body: <p>{label} will lose access to this portal immediately.</p>,
                confirmLabel: 'Remove admin access',
                danger: true,
                run: () => adminApi.setAdmin(username, false),
                done: `${label} is no longer an admin.`,
              })}><ShieldOff size={15} aria-hidden="true" /> Remove admin</button>
            ) : (
              <button type="button" className="adm-btn" onClick={() => act({
                title: 'Make this account an admin?',
                body: <p>{label} will be able to manage every account and workspace, including yours. Only grant this to people you trust fully.</p>,
                confirmLabel: 'Grant admin access',
                danger: true,
                run: () => adminApi.setAdmin(username, true),
                done: `${label} is now an admin.`,
              })}><ShieldCheck size={15} aria-hidden="true" /> Make admin</button>
            )}
          </div>

          <div className="adm-danger-zone">
            <div>
              <h3>Delete account</h3>
              <p className="adm-muted">Removes the sign-in, saved documents, conversations, bar verification, and any workspace this person hosts. This cannot be undone.</p>
            </div>
            <button type="button" className="adm-btn is-danger" disabled={isSelf} onClick={() => act({
              title: 'Delete this account permanently?',
              body: (
                <p>
                  {label}’s account and everything stored for it will be erased
                  {detail.workspaces.some((w) => w.role === 'owner') ? ', including the workspaces they host' : ''}.
                  This cannot be undone.
                </p>
              ),
              confirmLabel: 'Delete account',
              danger: true,
              typeToConfirm: detail.email || username,
              run: () => adminApi.deleteUser(username),
              done: `${label} was deleted.`,
              removed: true,
            })}><Trash2 size={15} aria-hidden="true" /> Delete account</button>
          </div>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.title}
          body={pending.body}
          confirmLabel={pending.confirmLabel}
          danger={pending.danger}
          typeToConfirm={pending.typeToConfirm}
          onConfirm={pending.run}
          onClose={() => setPending(null)}
        />
      )}
    </aside>
  )
}

type LawyerProps = {
  detail: UserDetail
  verifying: boolean
  setVerifying: (open: boolean) => void
  onReset: () => void
  onVerified: (message: string) => Promise<void>
}

function LawyerSection({ detail, verifying, setVerifying, onReset, onVerified }: LawyerProps) {
  const lawyer = detail.lawyer_verification
  const [barNumber, setBarNumber] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminApi.verifyLawyer(detail.username, { bar_number: barNumber.trim(), jurisdiction: jurisdiction.trim().toUpperCase(), name: name.trim(), note: note.trim() })
      await onVerified(`Bar record recorded as verified for ${detail.email || detail.username}.`)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const locked = !lawyer.verified && lawyer.attempts_remaining === 0 && lawyer.attempts_used > 0

  return (
    <div className="adm-card">
      <div className="adm-card-row">
        <div>
          {lawyer.verified
            ? <p><Badge tone="green">Verified</Badge> {lawyer.jurisdiction} {lawyer.bar_number}{lawyer.name ? ` · ${lawyer.name}` : ''}</p>
            : locked
              ? <p><Badge tone="red">Locked</Badge> All {lawyer.max_attempts} attempts used. This person is waiting on support.</p>
              : <p className="adm-muted">{lawyer.attempts_used ? `Not verified · ${lawyer.attempts_used} of ${lawyer.max_attempts} attempts used` : 'Has not tried to verify.'}</p>}
          {lawyer.verified && lawyer.verified_at && <p className="adm-muted">{lawyer.status ? `${lawyer.status} · ` : ''}{formatDate(lawyer.verified_at, true)}</p>}
        </div>
        <div className="adm-card-actions">
          {(lawyer.verified || lawyer.attempts_used > 0) && <button type="button" className="adm-btn is-small" onClick={onReset}>Reset</button>}
          {!lawyer.verified && !verifying && <button type="button" className="adm-btn is-small" onClick={() => setVerifying(true)}>Verify by hand</button>}
        </div>
      </div>

      {verifying && !lawyer.verified && (
        <form className="adm-form adm-inline-form" onSubmit={submit}>
          <p className="adm-muted">Only after checking the record with the state bar yourself.</p>
          <div className="adm-form-row">
            <label className="adm-field">
              <span>State</span>
              <input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2))} placeholder="FL" required minLength={2} maxLength={2} />
            </label>
            <label className="adm-field adm-grow">
              <span>Bar number</span>
              <input value={barNumber} onChange={(event) => setBarNumber(event.target.value.replace(/[^A-Za-z0-9-]/g, ''))} required maxLength={40} />
            </label>
          </div>
          <label className="adm-field">
            <span>Name on the bar record</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
          </label>
          <label className="adm-field">
            <span>Note for the audit log</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="How you confirmed it" />
          </label>
          {error && <ErrorNote message={error} />}
          <div className="adm-actions">
            <button type="button" className="adm-btn" onClick={() => setVerifying(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="adm-btn is-primary" disabled={busy}>{busy ? 'Saving…' : 'Mark verified'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
