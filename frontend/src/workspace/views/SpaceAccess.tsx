/* Workspaces: switch between them, create one, join with a code, and invite
   people with a one-time code. Opened from the + beside "Workspaces". */
import { useState, type FormEvent } from 'react'
import { Check, Copy, KeyRound, Plus } from 'lucide-react'
import { useWorkspace } from '../store'
import { Dialog } from './Channels'

export function SpaceAccessDialog({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [invitesByWorkspace, setInvitesByWorkspace] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const create = async (event: FormEvent) => {
    event.preventDefault()
    const workspace = await ws.createWorkspace(name)
    if (!workspace) return
    setName('')
    const newInvite = await ws.createInvite(workspace.id)
    if (newInvite) setInvitesByWorkspace((current) => ({ ...current, [workspace.id]: newInvite }))
  }
  const join = async (event: FormEvent) => {
    event.preventDefault()
    await ws.joinWorkspace(code)
    setCode('')
  }
  const activeInvite = ws.activeWorkspace ? invitesByWorkspace[ws.activeWorkspace.id] : ''
  const renewInvite = async () => {
    const workspace = ws.activeWorkspace
    if (!workspace) return
    const next = await ws.createInvite(workspace.id)
    if (next) { setInvitesByWorkspace((current) => ({ ...current, [workspace.id]: next })); setCopied(false) }
  }
  const copyInvite = async () => {
    if (!activeInvite) return
    try {
      await navigator.clipboard.writeText(activeInvite)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      ws.setNotice('Copy the invite code manually.')
    }
  }

  return (
    <Dialog title="Workspaces" subtitle="Create a workspace for your review, invite teammates, or join one with a code." onClose={onClose} labelledBy="space-access-title">
      <div className="ws-space-access">
        {ws.activeWorkspace && (
          <section className="ws-about-card">
            <header><strong>Invite people to {ws.activeWorkspace.name}</strong></header>
            <p className="ws-muted">{ws.activeWorkspace.id.startsWith('local-') ? 'This workspace is on this device only.' : 'Share a one-time code with a signed-in teammate.'}</p>
            {activeInvite
              ? <div className="ws-invite-card" role="status"><code>{activeInvite}</code><button type="button" className="ws-btn ws-btn-sm" onClick={() => void copyInvite()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div>
              : null}
            <button type="button" className="ws-link" onClick={() => void renewInvite()}><KeyRound size={13} /> {activeInvite ? 'New code' : 'Create an invite code'}</button>
          </section>
        )}
        <section className="ws-about-card">
          <header><strong>Create a workspace</strong></header>
          <form className="ws-inline-form" onSubmit={create}>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name a new workspace" aria-label="New workspace name" maxLength={80} />
            <button type="submit" className="ws-btn ws-btn-sm" disabled={!name.trim()}><Plus size={13} /> Create</button>
          </form>
        </section>
        <section className="ws-about-card">
          <header><strong>Join a workspace</strong></header>
          <form className="ws-inline-form" onSubmit={join}>
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter an invite code" aria-label="Workspace invite code" autoCapitalize="none" />
            <button type="submit" className="ws-btn ws-btn-sm" disabled={!code.trim()}>Join</button>
          </form>
        </section>
        {ws.workspaceNotice && <p className="ws-note" role="status">{ws.workspaceNotice}</p>}
      </div>
    </Dialog>
  )
}
