import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { AtSign, Bookmark, Check, Copy, FileText, Hash, Info, KeyRound, LockKeyhole, Paperclip, Plus, Reply, Search, Send, Smile, UsersRound, X } from 'lucide-react'
import { useWorkspace } from '../store'
import { documentDisplayName, documentKind, openFindings, type SampleDoc } from '../data'
import { Empty } from '../ui'

const EMOJI = ['👍', '✅', '👀', '🙏', '⚠️', '🎉']
const PEOPLE = [
  { name: 'Elena Moritz', role: 'Legal Aid Director', initial: 'E' },
  { name: 'Agency Reviewer', role: 'Compliance Officer', initial: 'A' },
]

const PANE_LIMITS = {
  rail: { min: 208, max: 360 },
  details: { min: 260, max: 420 },
  thread: 360,
  handles: 24,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function initialOf(user: string, userEmail?: string) {
  if (user.startsWith('You')) return (userEmail?.[0] || 'Y').toUpperCase()
  return user[0]?.toUpperCase() ?? '?'
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Turns names such as “Benefits decision · #8942-B” into an in-chat review link. */
function MessageText({ text, documents, onOpen }: { text: string; documents: SampleDoc[]; onOpen: (document: SampleDoc) => void }) {
  const mentions = new Map<string, SampleDoc>()
  documents.forEach((document) => {
    ;[documentDisplayName(document), document.title].filter(Boolean).forEach((name) => mentions.set(name.toLowerCase(), document))
  })
  const names = [...mentions.keys()].sort((a, b) => b.length - a.length)
  if (!names.length) return <p>{text}</p>
  const expression = new RegExp(`(${names.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(expression)
  if (parts.length === 1) return <p>{text}</p>
  return (
    <p>
      {parts.map((part, index) => {
        const document = mentions.get(part.toLowerCase())
        return document ? (
          <button key={`${document.id}-${index}`} type="button" className="ws-document-mention" onClick={() => onOpen(document)} aria-label={`Open ${documentDisplayName(document)} in Review`}>
            <FileText size={12} /> {part}
          </button>
        ) : part
      })}
    </p>
  )
}

function SpaceAccess() {
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
  const activeInvite = ws.activeWorkspace ? invitesByWorkspace[ws.activeWorkspace.id] : ''
  const copyInvite = async () => {
    if (!activeInvite) return
    try {
      await navigator.clipboard.writeText(activeInvite)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      ws.setNotice('Copy the group code manually.')
    }
  }
  return (
    <section className="ws-msg-section" aria-label="Shared workspace access">
      <header className="ws-space-head"><h3>Shared workspace</h3><UsersRound size={14} /></header>
      <p className="ws-muted">Create a group for your review, then share a one-time code with signed-in teammates.</p>
      {ws.workspaces.length > 0 && <select aria-label="Choose workspace" value={ws.activeWorkspace?.id || ''} onChange={(event) => void ws.selectWorkspace(event.target.value)}>
        <option value="">Choose a workspace</option>
        {ws.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.role}</option>)}
      </select>}
      {ws.activeWorkspace && <div className="ws-space-current"><span>Active group</span><strong>{ws.activeWorkspace.name}</strong><button type="button" className="ws-link" onClick={async () => {
        const workspace = ws.activeWorkspace
        if (!workspace) return
        const next = await ws.createInvite(workspace.id)
        if (next) { setInvitesByWorkspace((current) => ({ ...current, [workspace.id]: next })); setCopied(false) }
      }}><KeyRound size={13} /> {activeInvite ? 'Renew code' : 'Generate code'}</button></div>}
      <form className="ws-inline-form" onSubmit={create}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name a new group" aria-label="New workspace name" maxLength={80} />
        <button type="submit" className="ws-btn ws-btn-sm" disabled={!name.trim()}><Plus size={13} /> Create</button>
      </form>
      {activeInvite && ws.activeWorkspace && <div className="ws-invite-card" role="status"><span>Group code · {ws.activeWorkspace.id.startsWith('local-') ? 'local only' : 'share with a teammate'}</span><code>{activeInvite}</code><button type="button" className="ws-btn ws-btn-sm" onClick={() => void copyInvite()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div>}
      <form className="ws-inline-form" onSubmit={(event) => { event.preventDefault(); void ws.joinWorkspace(code); setCode('') }}>
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter a group code" aria-label="Workspace invite code" autoCapitalize="none" />
        <button type="submit" className="ws-btn ws-btn-sm" disabled={!code.trim()}>Join</button>
      </form>
      {ws.members.length > 0 && <p className="ws-muted">{ws.members.length} member{ws.members.length === 1 ? '' : 's'}: {ws.members.slice(0, 4).map((m) => m.email || m.name).join(', ')}</p>}
      {ws.workspaceNotice && <p className="ws-note" role="status">{ws.workspaceNotice}</p>}
    </section>
  )
}

export function MessagesView() {
  const ws = useWorkspace()
  const [filter, setFilter] = useState<'all' | 'mentions' | 'saved'>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachment, setAttachment] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [railWidth, setRailWidth] = useState(240)
  const [detailsWidth, setDetailsWidth] = useState(300)
  const [newTask, setNewTask] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const { refreshWorkspaces } = ws

  useEffect(() => { void refreshWorkspaces() }, [refreshWorkspaces])
  useEffect(() => {
    const refreshSharedState = () => {
      if (document.visibilityState === 'visible') void refreshWorkspaces()
    }
    const poll = window.setInterval(refreshSharedState, 30_000)
    window.addEventListener('focus', refreshSharedState)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener('focus', refreshSharedState)
    }
  }, [refreshWorkspaces])
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [ws.comments.length])
  useEffect(() => { if (ws.composerFocus) inputRef.current?.focus() }, [ws.composerFocus])

  const shown = ws.comments.filter((m) => filter === 'all' || (filter === 'mentions' ? m.text.includes('@') : m.saved))
  const results = query.trim()
    ? [
      ...ws.comments.filter((m) => `${m.user} ${m.text}`.toLowerCase().includes(query.toLowerCase())).map((m) => ({ key: m.id, title: m.user, detail: m.text, kind: 'Message' })),
      ...ws.documents.filter((d) => d.title.toLowerCase().includes(query.toLowerCase())).map((d) => ({ key: d.id, title: documentDisplayName(d), detail: d.type, kind: 'Document' })),
    ]
    : []
  const send = () => { void ws.sendMessage(ws.draft, attachment); setAttachment(null); setEmojiOpen(false) }
  const linked = ws.linkedDocument ?? ws.selected
  const linkedTitle = ws.activeWorkspace?.linked_document_title || documentDisplayName(linked)
  const workspaceName = ws.activeWorkspace?.name ?? 'Personal workspace'

  const beginResize = (pane: 'rail' | 'details', event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !gridRef.current) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = pane === 'rail' ? railWidth : detailsWidth
    const bounds = gridRef.current.getBoundingClientRect()
    const otherWidth = pane === 'rail' ? (detailsOpen ? detailsWidth : 0) : railWidth
    const limits = PANE_LIMITS[pane]
    const availableMax = bounds.width - otherWidth - PANE_LIMITS.thread - PANE_LIMITS.handles
    const maximum = Math.min(limits.max, availableMax)

    const onMove = (move: PointerEvent) => {
      const delta = move.clientX - startX
      const next = pane === 'rail' ? startWidth + delta : startWidth - delta
      const size = clamp(next, limits.min, maximum)
      if (pane === 'rail') setRailWidth(size)
      else setDetailsWidth(size)
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop, { once: true })
  }

  const resizeWithKeyboard = (pane: 'rail' | 'details', event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const limits = PANE_LIMITS[pane]
    const current = pane === 'rail' ? railWidth : detailsWidth
    const next = pane === 'rail' ? current + direction * 16 : current - direction * 16
    if (pane === 'rail') setRailWidth(clamp(next, limits.min, limits.max))
    else setDetailsWidth(clamp(next, limits.min, limits.max))
  }

  return (
    <div className="ws-page ws-messages">
      <div
        ref={gridRef}
        className={`ws-msg-grid ${detailsOpen ? 'is-details-open' : 'is-details-closed'}`}
        style={{ '--ws-rail-width': `${railWidth}px`, '--ws-details-width': `${detailsWidth}px` } as CSSProperties}
      >
        <aside className="ws-msg-rail" aria-label="Conversations">
          <div className="ws-msg-rail-head"><h1>Messages</h1><button type="button" className="ws-icon-btn" aria-label="Search this space" onClick={() => setSearchOpen(true)}><Search size={16} /></button></div>
          {ws.workspaces.length > 0 && <>
            <span className="ws-rail-label">Workspaces</span>
            <div className="ws-workspace-list" aria-label="Your workspaces">
              {ws.workspaces.map((workspace) => {
                const active = workspace.id === ws.activeWorkspace?.id
                return (
                  <button key={workspace.id} type="button" className={`ws-workspace-item ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => void ws.selectWorkspace(workspace.id)} title={`Open ${workspace.name}`}>
                    <i>{workspace.name.trim().slice(0, 1).toUpperCase()}</i>
                    <span><strong>{workspace.name}</strong><small>{workspace.role === 'owner' ? 'Owner' : workspace.role === 'local' ? 'Local group' : 'Member'}</small></span>
                    {active && <Check size={14} aria-label="Active workspace" />}
                  </button>
                )
              })}
            </div>
          </>}
          <span className="ws-rail-label">Channels</span>
          <button type="button" className="ws-channel is-active"><Hash size={15} /><span>Review</span><em>{ws.comments.length}</em></button>
          <button type="button" className="ws-channel" onClick={() => ws.setNotice('Questions is ready for your next discussion.')}><Hash size={15} /><span>Questions</span></button>
          <button type="button" className="ws-channel" onClick={() => ws.setNotice('Your saved updates will appear here.')}><Hash size={15} /><span>Updates</span></button>
        </aside>

        <div
          className="ws-pane-resizer ws-pane-resizer-rail"
          role="separator"
          aria-label="Resize channel list"
          aria-orientation="vertical"
          aria-valuemin={PANE_LIMITS.rail.min}
          aria-valuemax={PANE_LIMITS.rail.max}
          aria-valuenow={Math.round(railWidth)}
          tabIndex={0}
          onPointerDown={(event) => beginResize('rail', event)}
          onKeyDown={(event) => resizeWithKeyboard('rail', event)}
        />

        <section className="ws-thread" aria-label="Review chat">
          <header className="ws-thread-head">
            <div><h2><Hash size={17} /> Review</h2><p>{workspaceName} · {ws.userEmail ? '3 people' : '2 people'} · about {documentDisplayName(linked)}</p></div>
            <div className="ws-thread-tools">
              <button type="button" className="ws-icon-btn" aria-label="Search this conversation" onClick={() => setSearchOpen(true)}><Search size={16} /></button>
              <button type="button" className="ws-icon-btn" aria-label={detailsOpen ? 'Close details' : 'Open details'} title={detailsOpen ? 'Close details' : 'Open details'} aria-pressed={detailsOpen} onClick={() => setDetailsOpen((v) => !v)}><Info size={16} /></button>
            </div>
          </header>
          <div className="ws-tabs" role="tablist" aria-label="Space sections">
            {(['chat', 'files', 'tasks'] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={ws.messageTab === tab} className={ws.messageTab === tab ? 'is-active' : ''} onClick={() => ws.setMessageTab(tab)}>
                {tab === 'chat' ? 'Chat' : tab === 'files' ? `Files ${ws.documents.length}` : `Tasks ${ws.tasks.filter((t) => !t.completed).length}`}
              </button>
            ))}
          </div>

          {ws.messageTab === 'chat' && <>
            <div className="ws-segment ws-thread-filter" role="group" aria-label="Filter messages">
              <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
              <button type="button" className={filter === 'mentions' ? 'is-active' : ''} aria-pressed={filter === 'mentions'} onClick={() => setFilter('mentions')}><AtSign size={12} /> Mentions</button>
              <button type="button" className={filter === 'saved' ? 'is-active' : ''} aria-pressed={filter === 'saved'} onClick={() => setFilter('saved')}><Bookmark size={12} /> Saved</button>
            </div>
            <div className="ws-chat" aria-live="polite">
              <div className="ws-day">Today</div>
              {shown.map((message) => {
                const mine = message.user.startsWith('You') || (!!ws.userEmail && message.authorEmail?.toLowerCase() === ws.userEmail.toLowerCase())
                const reacts = ws.reactions[message.id] ?? []
                return (
                  <article key={message.id} className={`ws-msg ${mine ? 'is-mine' : ''}`}>
                    <i className="ws-avatar">{initialOf(message.user, ws.userEmail)}</i>
                    <div className="ws-msg-body">
                      <header><strong>{message.user}</strong><small>{message.time}</small></header>
                      <MessageText text={message.text} documents={ws.documents} onOpen={ws.openInReview} />
                      {message.attachment && <button type="button" className="ws-attachment" onClick={() => ws.openInReview(message.attachment!)}><FileText size={13} /> {documentDisplayName(ws.documents.find((d) => d.id === message.attachment) ?? ws.selected)}</button>}
                      <div className="ws-msg-actions">
                        {['👍', '✅'].map((emoji) => (
                          <button key={emoji} type="button" aria-pressed={reacts.includes(emoji)} className={reacts.includes(emoji) ? 'is-on' : ''} onClick={() => ws.toggleReaction(message.id, emoji)}>{emoji}{reacts.includes(emoji) ? ' 1' : ''}</button>
                        ))}
                        <button type="button" onClick={() => ws.toggleSaved(message.id)} aria-pressed={!!message.saved}><Bookmark size={12} /> {message.saved ? 'Saved' : 'Save'}</button>
                        <button type="button" onClick={() => { ws.setDraft(`@${message.user.replace(/\s*\(.+\)$/, '').split(' ')[0]} `); ws.focusComposer() }}><Reply size={12} /> Reply</button>
                      </div>
                    </div>
                  </article>
                )
              })}
              {!shown.length && <Empty title={filter === 'all' ? `No messages in ${workspaceName}` : filter === 'mentions' ? 'No mentions yet' : 'Nothing saved yet'}>{filter === 'all' ? 'Start this group conversation by sending the first message.' : filter === 'mentions' ? 'When a teammate uses @, it will appear here.' : 'Save a message to find it here later.'}</Empty>}
              <div ref={endRef} />
            </div>
            <form className="ws-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
              {attachment && <span className="ws-attachment is-draft"><FileText size={13} /> {documentDisplayName(ws.documents.find((d) => d.id === attachment) ?? ws.selected)}<button type="button" aria-label="Remove attached document" onClick={() => setAttachment(null)}><X size={12} /></button></span>}
              <div className="ws-composer-row">
                <div className="ws-menu-anchor">
                  <button type="button" className="ws-icon-btn" aria-label="Add an attachment" aria-expanded={attachOpen} onClick={() => setAttachOpen((v) => !v)}><Paperclip size={16} /></button>
                  {attachOpen && <div className="ws-popover ws-menu ws-menu-up" role="menu">{ws.documents.map((d) => <button key={d.id} type="button" role="menuitem" onClick={() => { setAttachment(d.id); setAttachOpen(false) }}><strong>{documentDisplayName(d)}</strong><small>{d.type}</small></button>)}</div>}
                </div>
                <input
                  ref={inputRef}
                  value={ws.draft}
                  onChange={(event) => ws.setDraft(event.target.value)}
                  placeholder="Type a message..."
                  aria-label="Message"
                />
                <div className="ws-menu-anchor">
                  <button type="button" className="ws-icon-btn" aria-label="Add an emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}><Smile size={16} /></button>
                  {emojiOpen && <div className="ws-popover ws-emoji ws-menu-up" role="menu" aria-label="Emoji picker">{EMOJI.map((e) => <button key={e} type="button" role="menuitem" onClick={() => { ws.setDraft(`${ws.draft}${ws.draft ? ' ' : ''}${e}`); setEmojiOpen(false) }}>{e}</button>)}</div>}
                </div>
                <button type="submit" className="ws-btn ws-btn-dark ws-btn-sm" disabled={!ws.draft.trim()}>Send <Send size={13} /></button>
              </div>
              <small className="ws-muted">Enter to send · use @ to mention a teammate</small>
            </form>
          </>}

          {ws.messageTab === 'files' && (
            <ul className="ws-files" aria-label="Shared files">
              {ws.documents.map((doc) => {
                const open = openFindings(doc, ws.resolved[doc.id]).length
                return (
                  <li key={doc.id}>
                    <span className="ws-doc-icon">{documentKind(doc.type).icon}</span>
                    <span><strong>{documentDisplayName(doc)}</strong><small>{doc.type} · score {doc.score} · {open ? `${open} open` : 'all clear'}</small></span>
                    <button type="button" className="ws-btn ws-btn-sm" onClick={() => ws.openInReview(doc)}>Open review</button>
                  </li>
                )
              })}
            </ul>
          )}

          {ws.messageTab === 'tasks' && (
            <div className="ws-tasks" aria-label="Shared tasks">
              <form className="ws-inline-form" onSubmit={(event) => { event.preventDefault(); if (newTask.trim()) { ws.addTask(newTask.trim(), `Linked to ${documentDisplayName(ws.selected)}`); setNewTask('') } }}>
                <input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add a task…" aria-label="New task" />
                <button type="submit" className="ws-btn ws-btn-sm" disabled={!newTask.trim()}><Plus size={13} /> Add</button>
              </form>
              <ul>
                {ws.tasks.map((task) => (
                  <li key={task.id} className={task.completed ? 'is-done' : ''}>
                    <label>
                      <input type="checkbox" checked={task.completed} onChange={() => ws.toggleTask(task.id)} />
                      <span><strong>{task.title}</strong><small>{task.detail}</small></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div
          className="ws-pane-resizer ws-pane-resizer-details"
          role="separator"
          aria-label="Resize details panel"
          aria-orientation="vertical"
          aria-valuemin={PANE_LIMITS.details.min}
          aria-valuemax={PANE_LIMITS.details.max}
          aria-valuenow={Math.round(detailsWidth)}
          tabIndex={detailsOpen ? 0 : -1}
          onPointerDown={(event) => beginResize('details', event)}
          onKeyDown={(event) => resizeWithKeyboard('details', event)}
        />
        <aside className="ws-msg-details" aria-label="Details" aria-hidden={!detailsOpen}>
          <header className="ws-msg-details-head">
            <span>Details</span>
            <button type="button" className="ws-icon-btn" aria-label="Close details" onClick={() => setDetailsOpen(false)}><X size={15} /></button>
          </header>
          <section className="ws-msg-section">
            <header className="ws-linked-head"><h3>Linked document</h3>{ws.activeWorkspace && <span>{ws.canManageLinkedDocument ? 'Host controls' : 'Host controlled'}</span>}</header>
            <button type="button" className="ws-linked" onClick={() => ws.openInReview(linked)}>
              <span className="ws-doc-icon">{documentKind(linked.type).icon}</span>
              <span><strong>{linkedTitle}</strong><small>{openFindings(linked, ws.resolved[linked.id]).length} items to review</small></span>
            </button>
            {ws.activeWorkspace && ws.canManageLinkedDocument ? <label className="ws-linked-picker">
              <span>Choose a document for this group</span>
              <select value={linked.id} onChange={(event) => {
                const document = ws.documents.find((item) => item.id === event.target.value)
                if (document) void ws.setLinkedDocument(document)
              }} aria-label="Choose linked document">
                {ws.documents.map((document) => <option key={document.id} value={document.id}>{documentDisplayName(document)}</option>)}
              </select>
            </label> : ws.activeWorkspace ? <p className="ws-linked-readonly"><LockKeyhole size={12} /> The host chooses the linked document for this group.</p> : null}
          </section>
          <section className="ws-msg-section">
            <h3>People</h3>
            {PEOPLE.map((p) => <div key={p.name} className="ws-person"><i className="ws-avatar ws-avatar-sm">{p.initial}</i><span><strong>{p.name}</strong><small>{p.role} · Online</small></span></div>)}
          </section>
          <SpaceAccess />
        </aside>
      </div>

      {searchOpen && (
        <div className="ws-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
          <div className="ws-dialog ws-dialog-sm" role="dialog" aria-modal="true" aria-label="Search messages">
            <div className="ws-dialog-search">
              <Search size={16} />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats, people, or documents..." aria-label="Search messages" />
              <button type="button" className="ws-icon-btn" aria-label="Close message search" onClick={() => setSearchOpen(false)}><X size={16} /></button>
            </div>
            <ul className="ws-results">
              {results.map((r) => <li key={r.key}><span className="ws-pill">{r.kind}</span><div><strong>{r.title}</strong><small>{r.detail}</small></div></li>)}
              {query.trim() && !results.length && <li className="ws-muted">No matches for “{query}”.</li>}
              {!query.trim() && <li className="ws-muted">Type to search messages and documents in this space.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
