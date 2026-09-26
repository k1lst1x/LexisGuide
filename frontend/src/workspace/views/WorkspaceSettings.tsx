/* Workspace settings, Slack-style: the roster with each person's role, where
   the owner hands out and takes back admin rights and admins remove people;
   and the workspace itself, which members can leave and admins can delete. */
import { useEffect, useState, type FormEvent } from 'react'
import { Crown, LogOut, Search, ShieldCheck, ShieldOff, Trash2, UserMinus, X } from 'lucide-react'
import { useWorkspace } from '../store'
import { workspaceRequest } from '../api'
import type { WorkspaceMember } from '../data'

type Tab = 'members' | 'settings'

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

export function WorkspaceSettingsDialog({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace()
  const workspace = ws.activeWorkspace
  const [tab, setTab] = useState<Tab>('members')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState('')
  const { refreshMembers } = ws

  useEffect(() => { void refreshMembers() }, [refreshMembers])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!workspace) return null
  const role = workspace.role ?? 'member'
  const isOwner = role === 'owner'
  const isAdmin = role === 'owner' || role === 'admin'
  const me = (member: WorkspaceMember) => Boolean(ws.userEmail) && member.email.toLowerCase() === ws.userEmail!.toLowerCase()
  const needle = query.trim().toLowerCase()
  const order = { owner: 0, admin: 1, member: 2 } as Record<string, number>
  const members = [...ws.members]
    .sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || (a.name || a.email).localeCompare(b.name || b.email))
    .filter((member) => !needle || `${member.name} ${member.email}`.toLowerCase().includes(needle))
  const admins = ws.members.filter((member) => member.role === 'admin' || member.role === 'owner').length

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    setError('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'That did not work.') } finally { setBusy(null) }
  }
  const setRole = (member: WorkspaceMember, next: 'admin' | 'member') => run(member.user_id, async () => {
    await workspaceRequest(`/workspaces/${workspace.id}/members/${encodeURIComponent(member.user_id)}/role`, { method: 'PUT', body: JSON.stringify({ role: next }) })
    await ws.refreshMembers()
    ws.setNotice(next === 'admin' ? `${member.name || member.email} is now an admin.` : `${member.name || member.email} is no longer an admin.`)
  })
  const remove = (member: WorkspaceMember) => run(member.user_id, async () => {
    await workspaceRequest<void>(`/workspaces/${workspace.id}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' })
    setConfirmRemove(null)
    await ws.refreshMembers()
    ws.setNotice(`${member.name || member.email} was removed from ${workspace.name}.`)
  })
  const leave = () => run('leave', async () => {
    const mine = ws.members.find(me)
    if (!mine) throw new Error('Your membership could not be found. Refresh and try again.')
    await workspaceRequest<void>(`/workspaces/${workspace.id}/members/${encodeURIComponent(mine.user_id)}`, { method: 'DELETE' })
    ws.forgetWorkspace(workspace.id)
    ws.setNotice(`You left ${workspace.name}.`)
    onClose()
  })
  const destroy = (event: FormEvent) => {
    event.preventDefault()
    if (confirmName.trim() !== workspace.name) return
    void run('delete', async () => {
      await workspaceRequest<void>(`/workspaces/${workspace.id}`, { method: 'DELETE' })
      ws.forgetWorkspace(workspace.id)
      ws.setNotice(`${workspace.name} was deleted.`)
      onClose()
    })
  }

  return (
    <div className="ws-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="ws-dialog ws-channel-dialog is-wide" role="dialog" aria-modal="true" aria-labelledby="workspace-settings-title">
        <header className="ws-dialog-head">
          <div>
            <h2 id="workspace-settings-title">{workspace.name}</h2>
            <p>Workspace settings · you are {role === 'owner' ? 'the owner' : role === 'admin' ? 'an admin' : 'a member'}</p>
          </div>
          <button type="button" className="ws-icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>

        <div className="ws-segment ws-segment-full" role="tablist" aria-label="Workspace settings">
          <button type="button" role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'is-active' : ''} onClick={() => setTab('members')}>Members <em>{ws.members.length}</em></button>
          <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}>Settings</button>
        </div>

        {tab === 'members' && (
          <div className="ws-member-panel">
            <p className="ws-muted ws-role-note">
              {isOwner
                ? 'As the owner, you decide who is an admin. Admins can delete channels, remove members, and delete the workspace.'
                : isAdmin
                  ? 'As an admin you can remove members and delete channels. Only the owner can change who is an admin.'
                  : `${admins} admin${admins === 1 ? '' : 's'} manage this workspace. Ask the owner if you need admin rights.`}
            </p>
            <label className="ws-browse-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a member" aria-label="Find a workspace member" /></label>
            <ul className="ws-member-list">
              {members.map((member) => {
                const self = me(member)
                const canChangeRole = isOwner && !self && member.role !== 'owner'
                const canRemove = isAdmin && !self && member.role !== 'owner' && (member.role !== 'admin' || isOwner)
                return (
                  <li key={member.user_id}>
                    <i className="ws-avatar">{(member.name || member.email || '?')[0].toUpperCase()}</i>
                    <span><strong>{member.name || member.email}{self && <em className="ws-you"> (you)</em>}</strong>{member.name && <small>{member.email}</small>}</span>
                    <span className={`ws-role ws-role-${member.role}`}>{member.role === 'owner' && <Crown size={12} aria-hidden="true" />}{member.role === 'admin' && <ShieldCheck size={12} aria-hidden="true" />}{ROLE_LABEL[member.role] ?? member.role}</span>
                    {(canChangeRole || canRemove) && (
                      <span className="ws-member-actions">
                        {confirmRemove === member.user_id ? <>
                          <button type="button" className="ws-btn ws-btn-sm" onClick={() => setConfirmRemove(null)}>Cancel</button>
                          <button type="button" className="ws-btn ws-btn-sm ws-btn-danger" disabled={busy === member.user_id} onClick={() => void remove(member)}>Remove</button>
                        </> : <>
                          {canChangeRole && (member.role === 'admin'
                            ? <button type="button" className="ws-btn ws-btn-sm" disabled={busy === member.user_id} onClick={() => void setRole(member, 'member')} aria-label={`Remove admin rights from ${member.name || member.email}`}><ShieldOff size={13} /> Remove admin</button>
                            : <button type="button" className="ws-btn ws-btn-sm ws-btn-green" disabled={busy === member.user_id} onClick={() => void setRole(member, 'admin')} aria-label={`Make ${member.name || member.email} an admin`}><ShieldCheck size={13} /> Make admin</button>)}
                          {canRemove && <button type="button" className="ws-icon-btn ws-member-remove" onClick={() => setConfirmRemove(member.user_id)} aria-label={`Remove ${member.name || member.email} from the workspace`} title="Remove from workspace"><UserMinus size={15} /></button>}
                        </>}
                      </span>
                    )}
                  </li>
                )
              })}
              {!members.length && <li className="ws-muted">{needle ? `No member matches “${query}”.` : 'Loading members…'}</li>}
            </ul>
          </div>
        )}

        {tab === 'settings' && (
          <div className="ws-channel-settings">
            {!isOwner && (
              <section className="ws-about-card">
                <header><strong>Leave workspace</strong></header>
                <p className="ws-muted">You’ll lose access to its channels and messages. Someone will need to invite you again to rejoin.</p>
                <button type="button" className="ws-btn ws-btn-sm" disabled={busy === 'leave'} onClick={() => void leave()}><LogOut size={13} /> Leave {workspace.name}</button>
              </section>
            )}
            {isAdmin ? (
              <section className="ws-about-card ws-danger-card">
                <header><strong>Delete workspace</strong></header>
                <p className="ws-muted">Deletes {workspace.name} for everyone: every channel, message, and membership. This can’t be undone.</p>
                <form className="ws-about-edit" onSubmit={destroy}>
                  <label className="ws-field">
                    <span>Type <strong>{workspace.name}</strong> to confirm</span>
                    <input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" aria-label="Type the workspace name to confirm" />
                  </label>
                  <button type="submit" className="ws-btn ws-btn-sm ws-btn-danger" disabled={confirmName.trim() !== workspace.name || busy === 'delete'}><Trash2 size={13} /> Delete workspace</button>
                </form>
              </section>
            ) : (
              <p className="ws-muted">Only admins can delete this workspace.</p>
            )}
          </div>
        )}
        {error && <p className="ws-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
