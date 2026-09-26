/* Slack-style channels for shared workspaces: a channel list with unread
   marks, creating a channel with a description, browsing and joining
   channels, and a details view (About, Members, Settings) for editing,
   leaving, or deleting one. Personal and on-device workspaces keep simple
   local channels that only this browser sees. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Compass, Hash, LogOut, PencilLine, Plus, Search, Settings, Trash2, UsersRound, X } from 'lucide-react'
import type { WorkspaceChannel } from '../data'
import { GENERAL_ID, channelSlug, type Channels } from '../channels'

const initial = (person: { name?: string; email?: string }) => (person.name || person.email || '?').trim()[0]?.toUpperCase() ?? '?'
const displayName = (person: { name?: string; email?: string }) => person.name || person.email || 'Workspace member'
const formatDate = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

/* ─── Sidebar ─── */

export function ChannelList({ channels, onCreate, onBrowse }: { channels: Channels; onCreate: () => void; onBrowse: () => void }) {
  const joined = channels.channels.filter((channel) => channel.is_member)
  return (
    <nav className="ws-channels" aria-label="Channels">
      <div className="ws-channel-label">
        <span className="ws-rail-label">Channels</span>
        <span className="ws-channel-tools">
          {channels.shared && <button type="button" className="ws-icon-btn" aria-label="Browse channels" title="Browse channels" onClick={onBrowse}><Compass size={15} /></button>}
          <button type="button" className="ws-icon-btn" aria-label="Create a channel" title="Create a channel" onClick={onCreate}><Plus size={15} /></button>
        </span>
      </div>
      {joined.map((channel) => {
        const active = channel.id === channels.active?.id
        const unread = channels.isUnread(channel)
        return (
          <ChannelLink key={channel.id} channel={channel} active={active} unread={unread} onSelect={channels.select} />
        )
      })}
      {channels.active && !channels.active.is_member && (
        <ChannelLink channel={channels.active} active unread={false} preview onSelect={channels.select} />
      )}
      <button type="button" className="ws-channel ws-channel-add" onClick={channels.shared ? onBrowse : onCreate}>
        <Plus size={15} /><span>{channels.shared ? 'Add channels' : 'New channel'}</span>
      </button>
    </nav>
  )
}

function ChannelLink({ channel, active, unread, preview, onSelect }: { channel: WorkspaceChannel; active: boolean; unread: boolean; preview?: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      className={`ws-channel ${active ? 'is-active' : ''} ${unread ? 'is-unread' : ''} ${preview ? 'is-preview' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(channel.id)}
      title={channel.description || `#${channel.name}`}
    >
      <Hash size={15} aria-hidden="true" />
      <span>{channel.name}</span>
      {unread && <i className="ws-unread-dot" aria-label="Unread messages" />}
      {preview && <small>Preview</small>}
    </button>
  )
}

/* ─── Dialog shell ─── */

export function Dialog({ title, subtitle, onClose, children, labelledBy, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; labelledBy: string; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="ws-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`ws-dialog ws-channel-dialog ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <header className="ws-dialog-head">
          <div><h2 id={labelledBy}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="ws-icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        {children}
      </div>
    </div>
  )
}

/* ─── Create ─── */

export function CreateChannelDialog({ channels, onClose, onCreated }: { channels: Channels; onClose: () => void; onCreated: (channel: WorkspaceChannel) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const slug = channelSlug(name)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!slug) return
    setBusy(true)
    setError('')
    try {
      const channel = await channels.create(slug, description.trim())
      if (channel) onCreated(channel)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The channel could not be created.')
      setBusy(false)
    }
  }
  return (
    <Dialog title="Create a channel" subtitle="Channels are where your team talks about one topic: a filing, a deadline, a case." onClose={onClose} labelledBy="create-channel-title">
      <form onSubmit={submit}>
        <label className="ws-field">
          <span>Name</span>
          <span className="ws-hash-input"><Hash size={15} aria-hidden="true" /><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. appeal-deadlines" maxLength={70} aria-label="Channel name" /></span>
          {name && slug !== name.trim().replace(/^#+/, '') && <small className="ws-field-hint">Will be created as <strong>#{slug || '…'}</strong></small>}
        </label>
        <label className="ws-field">
          <span>Description <em>(optional)</em></span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={250} placeholder="What is this channel about?" aria-label="Channel description" />
          <small className="ws-field-hint">{250 - description.length} characters left</small>
        </label>
        {error && <p className="ws-error" role="alert">{error}</p>}
        <div className="ws-dialog-actions">
          <button type="button" className="ws-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ws-btn ws-btn-dark" disabled={!slug || busy}>{busy ? 'Creating…' : 'Create channel'}</button>
        </div>
      </form>
    </Dialog>
  )
}

/* ─── Browse ─── */

export function BrowseChannelsDialog({ channels, onClose, onOpen, onCreate }: { channels: Channels; onClose: () => void; onOpen: (channel: WorkspaceChannel) => void; onCreate: () => void }) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  const shown = channels.channels.filter((channel) => !needle || channel.name.toLowerCase().includes(needle) || (channel.description ?? '').toLowerCase().includes(needle))
  const act = async (channel: WorkspaceChannel, action: 'join' | 'leave') => {
    setBusy(channel.id)
    try { await channels[action](channel) } catch (caught) { window.alert(caught instanceof Error ? caught.message : 'That did not work.') } finally { setBusy(null) }
  }
  return (
    <Dialog title="Browse channels" subtitle={`${channels.channels.length} channel${channels.channels.length === 1 ? '' : 's'} in this workspace`} onClose={onClose} labelledBy="browse-channels-title" wide>
      <div className="ws-browse-bar">
        <label className="ws-browse-search"><Search size={15} aria-hidden="true" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or description" aria-label="Search channels" /></label>
        <button type="button" className="ws-btn ws-btn-dark" onClick={onCreate}><Plus size={14} /> Create channel</button>
      </div>
      <ul className="ws-browse-list">
        {shown.map((channel) => (
          <li key={channel.id}>
            <button type="button" className="ws-browse-main" onClick={() => onOpen(channel)}>
              <strong><Hash size={14} aria-hidden="true" />{channel.name}{channel.is_member && <span className="ws-pill ws-tone-good">Joined</span>}</strong>
              {channel.description && <p>{channel.description}</p>}
              <small><UsersRound size={12} aria-hidden="true" /> {channel.member_count ?? 0} member{channel.member_count === 1 ? '' : 's'}{channel.created_by_name ? ` · created by ${channel.created_by_name}` : ''}</small>
            </button>
            <span className="ws-browse-actions">
              <button type="button" className="ws-btn ws-btn-sm" onClick={() => onOpen(channel)}>View</button>
              {channel.id !== GENERAL_ID && (channel.is_member
                ? <button type="button" className="ws-btn ws-btn-sm" disabled={busy === channel.id} onClick={() => void act(channel, 'leave')}>Leave</button>
                : <button type="button" className="ws-btn ws-btn-sm ws-btn-green" disabled={busy === channel.id} onClick={() => void act(channel, 'join')}>Join</button>)}
            </span>
          </li>
        ))}
        {!shown.length && <li className="ws-browse-empty">No channel matches “{query}”. <button type="button" className="ws-link" onClick={onCreate}>Create #{channelSlug(query) || 'channel'}</button></li>}
      </ul>
    </Dialog>
  )
}

/* ─── Details ─── */

export type DetailsTab = 'about' | 'members' | 'settings'

export function ChannelDetailsDialog({ channels, tab: initialTab, canManage, canDelete, onClose, about }: { channels: Channels; tab: DetailsTab; canManage: boolean; canDelete: boolean; onClose: () => void; about?: ReactNode }) {
  const channel = channels.active
  const [tab, setTab] = useState<DetailsTab>(initialTab)
  const [editing, setEditing] = useState<'name' | 'description' | null>(null)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!channel) return null
  const general = channel.id === GENERAL_ID
  const members = channels.activeMembers
  const needle = query.trim().toLowerCase()
  const shownMembers = (members ?? []).filter((person) => !needle || `${person.name} ${person.email}`.toLowerCase().includes(needle))

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'That did not work.') } finally { setBusy(false) }
  }
  const startEdit = (field: 'name' | 'description') => { setEditing(field); setDraft(field === 'name' ? channel.name : channel.description ?? ''); setError('') }
  const saveEdit = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const value = editing === 'name' ? channelSlug(draft) : draft.trim()
    if (editing === 'name' && !value) return
    void run(async () => { await channels.update(channel, { [editing]: value }); setEditing(null) })
  }

  return (
    <Dialog title={<><Hash size={20} aria-hidden="true" />{channel.name}</>} onClose={onClose} labelledBy="channel-details-title" wide>
      <div className="ws-segment ws-segment-full" role="tablist" aria-label="Channel details">
        <button type="button" role="tab" aria-selected={tab === 'about'} className={tab === 'about' ? 'is-active' : ''} onClick={() => setTab('about')}>About</button>
        <button type="button" role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'is-active' : ''} onClick={() => setTab('members')}>Members <em>{channel.member_count ?? members?.length ?? 0}</em></button>
        <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}>Settings</button>
      </div>

      {tab === 'about' && (
        <div className="ws-about">
          {(['name', 'description'] as const).map((field) => (
            <section key={field} className="ws-about-card">
              <header>
                <strong>{field === 'name' ? 'Channel name' : 'Description'}</strong>
                {canManage && editing !== field && !(field === 'name' && general) && (
                  <button type="button" className="ws-link" onClick={() => startEdit(field)}><PencilLine size={13} /> Edit</button>
                )}
              </header>
              {editing === field ? (
                <form className="ws-about-edit" onSubmit={saveEdit}>
                  {field === 'name'
                    ? <span className="ws-hash-input"><Hash size={15} aria-hidden="true" /><input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={70} aria-label="New channel name" /></span>
                    : <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={250} aria-label="New channel description" />}
                  <span className="ws-about-edit-actions">
                    <button type="button" className="ws-btn ws-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" className="ws-btn ws-btn-sm ws-btn-dark" disabled={busy}>Save</button>
                  </span>
                </form>
              ) : field === 'name'
                ? <p>#{channel.name}</p>
                : <p className={channel.description ? '' : 'ws-muted'}>{channel.description || (canManage ? 'Add a description so people know what this channel is for.' : 'No description yet.')}</p>}
            </section>
          ))}
          <section className="ws-about-card">
            <header><strong>Created</strong></header>
            <p>{general ? 'Created with the workspace. Everyone is a member.' : `${channel.created_by_name ? `By ${channel.created_by_name}` : 'Created'}${formatDate(channel.created_at) ? ` on ${formatDate(channel.created_at)}` : ''}`}</p>
          </section>
          {about}
        </div>
      )}

      {tab === 'members' && (
        <div className="ws-member-panel">
          <label className="ws-browse-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a member" aria-label="Find a member" /></label>
          {!channels.shared && <p className="ws-muted">This channel is on this device only. Share a workspace to add people.</p>}
          {channels.shared && members === null && <p className="ws-muted">Loading members…</p>}
          <ul className="ws-member-list">
            {shownMembers.map((person) => (
              <li key={person.user_id}>
                <i className="ws-avatar">{initial(person)}</i>
                <span><strong>{displayName(person)}</strong>{person.name && person.email && <small>{person.email}</small>}</span>
                <span className="ws-member-badges">
                  {person.user_id === channel.created_by && <span className="ws-pill">Channel creator</span>}
                  {(person.role === 'owner' || person.role === 'admin') && <span className="ws-pill ws-tone-good">{person.role === 'owner' ? 'Workspace owner' : 'Admin'}</span>}
                </span>
              </li>
            ))}
            {members !== null && !shownMembers.length && channels.shared && <li className="ws-muted">{needle ? `No member matches “${query}”.` : 'Nobody is in this channel yet.'}</li>}
          </ul>
        </div>
      )}

      {tab === 'settings' && (
        <div className="ws-channel-settings">
          {general ? (
            <p className="ws-muted"><Settings size={14} aria-hidden="true" /> General always includes everyone in the workspace, so it can’t be left or deleted.</p>
          ) : <>
            {channels.shared && channel.is_member && (
              <section className="ws-about-card">
                <header><strong>Leave channel</strong></header>
                <p className="ws-muted">You’ll stop seeing it in your sidebar. You can rejoin from Browse channels.</p>
                <button type="button" className="ws-btn ws-btn-sm" disabled={busy} onClick={() => void run(async () => { await channels.leave(channel); onClose() })}><LogOut size={13} /> Leave #{channel.name}</button>
              </section>
            )}
            {canDelete && (
              <section className="ws-about-card ws-danger-card">
                <header><strong>Delete channel</strong></header>
                <p className="ws-muted">Removes the channel and every message in it for everyone. This can’t be undone.</p>
                {confirmDelete ? (
                  <span className="ws-about-edit-actions">
                    <button type="button" className="ws-btn ws-btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                    <button type="button" className="ws-btn ws-btn-sm ws-btn-danger" disabled={busy} onClick={() => void run(async () => { await channels.remove(channel); onClose() })}><Trash2 size={13} /> Yes, delete #{channel.name}</button>
                  </span>
                ) : (
                  <button type="button" className="ws-btn ws-btn-sm ws-btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete channel</button>
                )}
              </section>
            )}
            {!canDelete && <p className="ws-muted">Only workspace admins can delete channels.{!channel.is_member ? ' Join this channel to take part.' : ''}</p>}
          </>}
        </div>
      )}
      {error && <p className="ws-error" role="alert">{error}</p>}
    </Dialog>
  )
}

/* ─── Join bar, shown in place of the composer when previewing ─── */

export function JoinBar({ channels }: { channels: Channels }) {
  const [busy, setBusy] = useState(false)
  const channel = channels.active
  if (!channel) return null
  return (
    <div className="ws-join-bar">
      <p>You’re viewing <strong>#{channel.name}</strong>{channel.description ? ` · ${channel.description}` : ''}</p>
      <button type="button" className="ws-btn ws-btn-green" disabled={busy} onClick={async () => { setBusy(true); try { await channels.join(channel) } finally { setBusy(false) } }}>
        {busy ? 'Joining…' : 'Join channel'}
      </button>
    </div>
  )
}
