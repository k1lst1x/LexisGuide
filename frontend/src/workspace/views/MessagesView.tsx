import { useEffect, useRef, useState } from 'react'
import { AtSign, Bookmark, FileText, Hash, Info, Paperclip, Plus, Reply, Search, Send, Smile, X } from 'lucide-react'
import { useWorkspace } from '../store'
import { documentDisplayName, documentKind, openFindings } from '../data'
import { Empty } from '../ui'

const EMOJI = ['👍', '✅', '👀', '🙏', '⚠️', '🎉']
const PEOPLE = [
  { name: 'Elena Moritz', role: 'Legal Aid Director', initial: 'E' },
  { name: 'Agency Reviewer', role: 'Compliance Officer', initial: 'A' },
]

function initialOf(user: string, userEmail?: string) {
  if (user.startsWith('You')) return (userEmail?.[0] || 'Y').toUpperCase()
  return user[0]?.toUpperCase() ?? '?'
}

function SpaceAccess() {
  const ws = useWorkspace()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState('')
  return (
    <section className="ws-msg-section" aria-label="Shared workspace access">
      <h3>Space access</h3>
      <p className="ws-muted">Create a shared space, invite signed-in teammates, or join with a code.</p>
      {ws.workspaces.length > 0 && (
        <select aria-label="Choose workspace" value={ws.activeWorkspace?.id || ''} onChange={(event) => void ws.selectWorkspace(event.target.value)}>
          <option value="">No workspace selected</option>
          {ws.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.role}</option>)}
        </select>
      )}
      <form className="ws-inline-form" onSubmit={(event) => { event.preventDefault(); void ws.createWorkspace(name); setName('') }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New workspace name" aria-label="New workspace name" />
        <button type="submit" className="ws-btn ws-btn-sm" disabled={!name.trim()}>Create</button>
      </form>
      <button type="button" className="ws-btn ws-btn-sm ws-btn-block" disabled={!ws.activeWorkspace} onClick={async () => setInvite((await ws.createInvite()) || '')}>Create invite code</button>
      {invite && <code className="ws-invite">{invite}</code>}
      <form className="ws-inline-form" onSubmit={(event) => { event.preventDefault(); void ws.joinWorkspace(code); setCode('') }}>
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste invite code" aria-label="Workspace invite code" />
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
  const [newTask, setNewTask] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { refreshWorkspaces } = ws

  useEffect(() => { void refreshWorkspaces() }, [refreshWorkspaces])
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [ws.comments.length])
  useEffect(() => { if (ws.composerFocus) inputRef.current?.focus() }, [ws.composerFocus])

  const shown = ws.comments.filter((m) => filter === 'all' || (filter === 'mentions' ? m.text.includes('@') : m.saved))
  const results = query.trim()
    ? [
      ...ws.comments.filter((m) => `${m.user} ${m.text}`.toLowerCase().includes(query.toLowerCase())).map((m) => ({ key: m.id, title: m.user, detail: m.text, kind: 'Message' })),
      ...ws.documents.filter((d) => d.title.toLowerCase().includes(query.toLowerCase())).map((d) => ({ key: d.id, title: documentDisplayName(d), detail: d.type, kind: 'Document' })),
    ]
    : []
  const send = () => { ws.sendMessage(ws.draft, attachment); setAttachment(null); setEmojiOpen(false) }
  const linked = ws.selected

  return (
    <div className="ws-page ws-messages">
      <div className={`ws-msg-grid ${detailsOpen ? '' : 'no-details'}`}>
        <aside className="ws-msg-rail" aria-label="Conversations">
          <div className="ws-msg-rail-head"><h1>Messages</h1><button type="button" className="ws-icon-btn" aria-label="Search this space" onClick={() => setSearchOpen(true)}><Search size={16} /></button></div>
          <span className="ws-rail-label">Channels</span>
          <button type="button" className="ws-channel is-active"><Hash size={15} /><span>Review</span><em>{ws.comments.length}</em></button>
          <button type="button" className="ws-channel" onClick={() => ws.setNotice('Questions is ready for your next discussion.')}><Hash size={15} /><span>Questions</span></button>
          <button type="button" className="ws-channel" onClick={() => ws.setNotice('Your saved updates will appear here.')}><Hash size={15} /><span>Updates</span></button>
          <span className="ws-rail-label">People</span>
          {PEOPLE.map((p) => (
            <button key={p.name} type="button" className="ws-channel" onClick={() => { ws.setDraft(`@${p.name.split(' ')[0]} `); ws.focusComposer() }}>
              <i className="ws-avatar ws-avatar-sm">{p.initial}</i><span>{p.name}</span><b className="ws-online" aria-label="Online" />
            </button>
          ))}
        </aside>

        <section className="ws-thread" aria-label="Review chat">
          <header className="ws-thread-head">
            <div><h2><Hash size={17} /> Review</h2><p>{ws.userEmail ? '3 people' : '2 people'} · about {documentDisplayName(linked)}</p></div>
            <div className="ws-thread-tools">
              <button type="button" className="ws-icon-btn" aria-label="Search this conversation" onClick={() => setSearchOpen(true)}><Search size={16} /></button>
              <button type="button" className="ws-icon-btn" aria-label="Toggle details" aria-pressed={detailsOpen} onClick={() => setDetailsOpen((v) => !v)}><Info size={16} /></button>
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
                const mine = message.user.startsWith('You')
                const reacts = ws.reactions[message.id] ?? []
                return (
                  <article key={message.id} className={`ws-msg ${mine ? 'is-mine' : ''}`}>
                    <i className="ws-avatar">{initialOf(message.user, ws.userEmail)}</i>
                    <div className="ws-msg-body">
                      <header><strong>{message.user}</strong><small>{message.time}</small></header>
                      <p>{message.text}</p>
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
              {!shown.length && <Empty title={filter === 'mentions' ? 'No mentions yet' : 'Nothing saved yet'}>{filter === 'mentions' ? 'When a teammate uses @, it will appear here.' : 'Save a message to find it here later.'}</Empty>}
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

        {detailsOpen && (
          <aside className="ws-msg-details" aria-label="Details">
            <section className="ws-msg-section">
              <h3>Linked document</h3>
              <button type="button" className="ws-linked" onClick={() => ws.openInReview(linked)}>
                <span className="ws-doc-icon">{documentKind(linked.type).icon}</span>
                <span><strong>{documentDisplayName(linked)}</strong><small>{openFindings(linked, ws.resolved[linked.id]).length} items to review</small></span>
              </button>
            </section>
            <section className="ws-msg-section">
              <h3>People</h3>
              {PEOPLE.map((p) => <div key={p.name} className="ws-person"><i className="ws-avatar ws-avatar-sm">{p.initial}</i><span><strong>{p.name}</strong><small>{p.role} · Online</small></span></div>)}
            </section>
            <SpaceAccess />
          </aside>
        )}
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
