import { useEffect, useRef, useState } from 'react'
import { AtSign, Bookmark, Check, ChevronDown, FileText, Hash, Info, LockKeyhole, Plus, Reply, Search, Settings, SmilePlus, Trash2, X } from 'lucide-react'
import { BrowseChannelsDialog, ChannelDetailsDialog, ChannelList, CreateChannelDialog, JoinBar, type DetailsTab } from './Channels'
import { useChannels } from '../channels'
import { WorkspaceSettingsDialog } from './WorkspaceSettings'
import { SpaceAccessDialog } from './SpaceAccess'
import { DocumentPanel } from './DocumentPanel'
import { EmojiPicker } from './EmojiPicker'
import { MessageComposer } from './MessageComposer'
import { useWorkspace } from '../store'
import { documentDisplayName, documentKind, openFindings, type MessageMention, type SampleDoc, type WorkspaceMessage } from '../data'
import { QUICK_REACTIONS } from '../emoji'
import { MENTION_PREFIX, splitMentions } from '../mentions'
import { Empty } from '../ui'

function initialOf(user: string, userEmail?: string) {
  if (user.startsWith('You')) return (userEmail?.[0] || 'Y').toUpperCase()
  return user[0]?.toUpperCase() ?? '?'
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A message's text with its mentions as links: a channel opens the channel,
    a document opens beside the conversation. Documents named in plain text
    (from before mentions were kept) link too. */
function MessageText({ message, documents, myId, onChannel, onDocument }: {
  message: WorkspaceMessage
  documents: SampleDoc[]
  myId?: string
  onChannel: (id: string) => void
  onDocument: (id: string, title: string) => void
}) {
  const names = new Map<string, SampleDoc>()
  documents.forEach((document) => {
    ;[documentDisplayName(document), document.title].filter(Boolean).forEach((name) => names.set(name.toLowerCase(), document))
  })
  const sorted = [...names.keys()].sort((a, b) => b.length - a.length)
  const expression = sorted.length ? new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'gi') : null
  const plain = (text: string, key: string) => {
    if (!expression) return text
    return text.split(expression).map((part, index) => {
      const document = names.get(part.toLowerCase())
      return document
        ? <button key={`${key}-${index}`} type="button" className="ws-mention is-document" onClick={() => onDocument(document.id, document.title)} aria-label={`Open ${documentDisplayName(document)}`}><FileText size={12} /> {part}</button>
        : part
    })
  }
  const chip = (mention: MessageMention, key: string) => {
    const text = `${MENTION_PREFIX[mention.type]}${mention.label}`
    if (mention.type === 'user') return <span key={key} className={`ws-mention is-user ${mention.id === myId ? 'is-me' : ''}`}>{text}</span>
    if (mention.type === 'channel') return <button key={key} type="button" className="ws-mention is-channel" onClick={() => onChannel(mention.id)} aria-label={`Open #${mention.label}`}>{text}</button>
    return <button key={key} type="button" className="ws-mention is-document" onClick={() => onDocument(mention.id, mention.label)} aria-label={`Open ${mention.label}`}><FileText size={12} /> {mention.label}</button>
  }
  return <p>{splitMentions(message.text, message.mentions ?? []).map((part, index) => typeof part === 'string' ? plain(part, String(index)) : chip(part, `m-${index}`))}</p>
}

export function MessagesView() {
  const ws = useWorkspace()
  const [filter, setFilter] = useState<'all' | 'mentions' | 'saved'>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mentions, setMentions] = useState<MessageMention[]>([])
  const [reactingTo, setReactingTo] = useState<string | null>(null)
  const [openDocument, setOpenDocument] = useState<{ id: string; title: string } | null>(null)
  const [newTask, setNewTask] = useState('')
  const [dialog, setDialog] = useState<null | { kind: 'create' } | { kind: 'browse' } | { kind: 'details'; tab: DetailsTab } | { kind: 'workspace' } | { kind: 'spaces' }>(null)
  const endRef = useRef<HTMLDivElement>(null)
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

  const channels = useChannels({
    workspace: ws.activeWorkspace,
    activeChannelId: ws.activeChannelId,
    setActiveChannelId: ws.setActiveChannelId,
    notify: ws.setNotice,
  })
  const activeChannel = channels.active
  const channelName = activeChannel?.name ?? 'general'
  const isWorkspaceAdmin = !ws.activeWorkspace || ['owner', 'admin', 'local'].includes(ws.activeWorkspace.role ?? '')
  const canManageChannel = !channels.shared || Boolean(activeChannel?.can_manage)
  const channelMembers = channels.activeMembers
  const memberCount = channels.shared ? activeChannel?.member_count ?? channelMembers?.length ?? 0 : 1
  const canPost = !channels.shared || Boolean(activeChannel?.is_member)
  const myEmail = ws.userEmail?.toLowerCase()
  const me = ws.members.find((member) => member.email.toLowerCase() === myEmail)
  const myName = (me?.name || myEmail?.split('@')[0] || '').toLowerCase()
  const people = channels.shared
    ? (channelMembers ?? ws.members).map((person) => ({ id: person.user_id, name: person.name || person.email, detail: person.name ? person.email : person.role }))
    : []

  const mentionsMe = (message: WorkspaceMessage) =>
    (message.mentions ?? []).some((mention) => mention.type === 'user' && mention.id === me?.user_id)
    || (!!myName && message.text.toLowerCase().includes(`@${myName}`))
  const shown = ws.comments.filter((m) => filter === 'all' || (filter === 'mentions' ? mentionsMe(m) : m.saved))
  const needle = query.trim().toLowerCase()
  const results = needle
    ? [
      ...ws.comments.filter((m) => `${m.user} ${m.text}`.toLowerCase().includes(needle)).map((m) => ({ key: m.id, title: m.user, detail: m.text, kind: 'Message', document: null as SampleDoc | null })),
      ...ws.documents.filter((d) => d.title.toLowerCase().includes(needle)).map((d) => ({ key: d.id, title: documentDisplayName(d), detail: d.type, kind: 'Document', document: d as SampleDoc | null })),
    ]
    : []
  const linked = ws.linkedDocument ?? ws.selected
  const linkedTitle = ws.activeWorkspace?.linked_document_title || documentDisplayName(linked)
  const workspaceName = ws.activeWorkspace?.name ?? 'Personal workspace'
  const openDoc = (id: string, title: string) => setOpenDocument({ id, title })
  const reply = (message: WorkspaceMessage) => {
    const label = message.user.replace(/\s*\(.+\)$/, '')
    if (message.authorId && !message.user.startsWith('You')) {
      setMentions([{ type: 'user', id: message.authorId, label }])
      ws.setDraft(`@${label} `)
    } else {
      ws.setDraft(`@${label.split(' ')[0]} `)
    }
    ws.focusComposer()
  }

  const linkedCard = (
    <section className="ws-about-card">
      <header><strong>Linked document</strong>{ws.activeWorkspace && <span className="ws-muted">{ws.canManageLinkedDocument ? 'You choose it' : 'Chosen by the host'}</span>}</header>
      <button type="button" className="ws-linked" onClick={() => { setDialog(null); openDoc(linked.id, linkedTitle) }}>
        <span className="ws-doc-icon">{documentKind(linked.type).icon}</span>
        <span><strong>{linkedTitle}</strong><small>{openFindings(linked, ws.resolved[linked.id]).length} items to review</small></span>
      </button>
      {ws.activeWorkspace && ws.canManageLinkedDocument ? (
        <label className="ws-linked-picker">
          <span>Choose a document for this workspace</span>
          <select value={linked.id} onChange={(event) => {
            const document = ws.documents.find((item) => item.id === event.target.value)
            if (document) void ws.setLinkedDocument(document)
          }} aria-label="Choose linked document">
            {ws.documents.map((document) => <option key={document.id} value={document.id}>{documentDisplayName(document)}</option>)}
          </select>
        </label>
      ) : ws.activeWorkspace ? <p className="ws-linked-readonly"><LockKeyhole size={12} /> The host chooses the linked document.</p> : null}
    </section>
  )

  return (
    <div className="ws-page ws-messages">
      <div className={`ws-msg-grid ${openDocument ? 'has-document' : ''}`}>
        <aside className="ws-msg-rail" aria-label="Conversations">
          <div className="ws-msg-rail-head"><h1>Messages</h1><button type="button" className="ws-icon-btn" aria-label="Search this space" onClick={() => setSearchOpen(true)}><Search size={16} /></button></div>
          <div className="ws-channel-label">
            <span className="ws-rail-label">Workspaces</span>
            <span className="ws-rail-tools">
              {ws.activeWorkspace && !ws.activeWorkspace.id.startsWith('local-') && (
                <button type="button" className="ws-icon-btn" aria-label={`Settings for ${ws.activeWorkspace.name}`} title="Workspace settings and members" onClick={() => setDialog({ kind: 'workspace' })}><Settings size={15} /></button>
              )}
              <button type="button" className="ws-icon-btn" aria-label="Create, join, or invite to a workspace" title="Create, join, or invite" onClick={() => setDialog({ kind: 'spaces' })}><Plus size={15} /></button>
            </span>
          </div>
          <div className="ws-workspace-list" aria-label="Your workspaces">
            {ws.workspaces.map((workspace) => {
              const active = workspace.id === ws.activeWorkspace?.id
              return (
                <button key={workspace.id} type="button" className={`ws-workspace-item ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => { setOpenDocument(null); void ws.selectWorkspace(workspace.id) }} title={`Open ${workspace.name}`}>
                  <i>{workspace.name.trim().slice(0, 1).toUpperCase()}</i>
                  <span><strong>{workspace.name}</strong><small>{workspace.role === 'owner' ? 'Owner' : workspace.role === 'admin' ? 'Admin' : workspace.role === 'local' ? 'This device' : 'Member'}</small></span>
                  {active && <Check size={14} aria-label="Active workspace" />}
                </button>
              )
            })}
            {!ws.workspaces.length && <button type="button" className="ws-link" onClick={() => setDialog({ kind: 'spaces' })}><Plus size={13} /> Create or join a workspace</button>}
          </div>
          <ChannelList channels={channels} onCreate={() => setDialog({ kind: 'create' })} onBrowse={() => setDialog({ kind: 'browse' })} />
        </aside>

        <section className="ws-thread" aria-label={`${channelName} chat`}>
          <header className="ws-thread-head">
            <div className="ws-thread-title">
              <button type="button" className="ws-channel-name" onClick={() => setDialog({ kind: 'details', tab: 'about' })} aria-label={`Channel details for ${channelName}`}>
                <Hash size={17} aria-hidden="true" /> {channelName} <ChevronDown size={15} aria-hidden="true" />
              </button>
              <p>{activeChannel?.description || `${workspaceName} · about ${linkedTitle}`}</p>
            </div>
            <div className="ws-thread-tools">
              <button type="button" className="ws-member-stack" onClick={() => setDialog({ kind: 'details', tab: 'members' })} aria-label={`${memberCount} member${memberCount === 1 ? '' : 's'}. View members`} title="View members">
                {(channelMembers ?? []).slice(0, 3).map((person) => <i key={person.user_id} className="ws-avatar ws-avatar-sm">{(person.name || person.email || '?')[0].toUpperCase()}</i>)}
                {!channels.shared && <i className="ws-avatar ws-avatar-sm">{(ws.userEmail?.[0] || 'Y').toUpperCase()}</i>}
                <span>{memberCount}</span>
              </button>
              <button type="button" className="ws-icon-btn" aria-label="Search this conversation" onClick={() => setSearchOpen(true)}><Search size={16} /></button>
              <button type="button" className="ws-icon-btn" aria-label="Channel info" title="Channel info" onClick={() => setDialog({ kind: 'details', tab: 'about' })}><Info size={16} /></button>
            </div>
          </header>
          <div className="ws-thread-bar">
            <div className="ws-tabs" role="tablist" aria-label="Space sections">
              {(['chat', 'files', 'tasks'] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={ws.messageTab === tab} className={ws.messageTab === tab ? 'is-active' : ''} onClick={() => ws.setMessageTab(tab)}>
                  {tab === 'chat' ? 'Chat' : tab === 'files' ? `Files ${ws.documents.length}` : `Tasks ${ws.tasks.filter((t) => !t.completed).length}`}
                </button>
              ))}
            </div>
            {ws.messageTab === 'chat' && (
              <div className="ws-segment ws-thread-filter" role="group" aria-label="Filter messages">
                <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
                <button type="button" className={filter === 'mentions' ? 'is-active' : ''} aria-pressed={filter === 'mentions'} onClick={() => setFilter('mentions')}><AtSign size={12} /> Mentions</button>
                <button type="button" className={filter === 'saved' ? 'is-active' : ''} aria-pressed={filter === 'saved'} onClick={() => setFilter('saved')}><Bookmark size={12} /> Saved</button>
              </div>
            )}
          </div>

          {ws.messageTab === 'chat' && <>
            <div className="ws-chat" aria-live="polite">
              {shown.map((message) => {
                const mine = message.user.startsWith('You') || (!!myEmail && message.authorEmail?.toLowerCase() === myEmail)
                const reactions = message.reactions ?? []
                return (
                  <article key={message.id} className={`ws-msg ${mine ? 'is-mine' : ''} ${mentionsMe(message) ? 'is-mention' : ''}`}>
                    <i className="ws-avatar">{initialOf(message.user, ws.userEmail)}</i>
                    <div className="ws-msg-body">
                      <header><strong>{message.user}</strong><small>{message.time}</small>{message.saved && <Bookmark size={12} className="ws-msg-saved" aria-label="Saved" />}</header>
                      <MessageText message={message} documents={ws.documents} myId={me?.user_id} onChannel={(id) => channels.select(id)} onDocument={openDoc} />
                      {message.attachment && (
                        <button type="button" className="ws-attachment" onClick={() => openDoc(message.attachment!, message.attachmentTitle ?? '')}>
                          <FileText size={13} /> {message.attachmentTitle || documentDisplayName(ws.documents.find((d) => d.id === message.attachment) ?? ws.selected)}
                        </button>
                      )}
                      {reactions.length > 0 && (
                        <div className="ws-reactions" aria-label="Reactions">
                          {reactions.map((reaction) => (
                            <button key={reaction.emoji} type="button" className={`ws-reaction ${reaction.mine ? 'is-mine' : ''}`} aria-pressed={reaction.mine} title={reaction.names.join(', ')} aria-label={`${reaction.emoji} ${reaction.count}: ${reaction.names.join(', ')}`} onClick={() => void ws.toggleReaction(message.id, reaction.emoji)}>
                              <span>{reaction.emoji}</span><em>{reaction.count}</em>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`ws-msg-hover ${reactingTo === message.id ? 'is-open' : ''}`}>
                      {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                        <button key={emoji} type="button" aria-label={`React ${emoji}`} title={`React ${emoji}`} onClick={() => void ws.toggleReaction(message.id, emoji)}>{emoji}</button>
                      ))}
                      <div className="ws-menu-anchor">
                        <button type="button" aria-label="Add a reaction" title="Add a reaction" aria-expanded={reactingTo === message.id} onClick={() => setReactingTo((current) => (current === message.id ? null : message.id))}><SmilePlus size={14} /></button>
                        {reactingTo === message.id && <EmojiPicker label="Choose a reaction" className="ws-menu-down" onPick={(emoji) => void ws.toggleReaction(message.id, emoji)} onClose={() => setReactingTo(null)} />}
                      </div>
                      <button type="button" aria-label="Reply" title="Reply" onClick={() => reply(message)}><Reply size={14} /></button>
                      <button type="button" aria-label={message.saved ? 'Remove from saved' : 'Save message'} title={message.saved ? 'Remove from saved' : 'Save'} aria-pressed={!!message.saved} className={message.saved ? 'is-on' : ''} onClick={() => void ws.toggleSaved(message.id)}><Bookmark size={14} /></button>
                      {(mine || isWorkspaceAdmin) && <button type="button" className="ws-msg-delete" aria-label="Delete message" title="Delete" onClick={() => { if (window.confirm('Delete this message for everyone?')) void ws.deleteMessage(message.id) }}><Trash2 size={14} /></button>}
                    </div>
                  </article>
                )
              })}
              {!shown.length && <Empty title={filter === 'all' ? `No messages in #${channelName} yet` : filter === 'mentions' ? 'No mentions yet' : 'Nothing saved yet'}>{filter === 'all' ? (canPost ? 'Start the conversation by sending the first message.' : 'Join the channel to start the conversation.') : filter === 'mentions' ? 'When a teammate @mentions you, it will appear here.' : 'Save a message to find it here later.'}</Empty>}
              <div ref={endRef} />
            </div>
            {!canPost ? <JoinBar channels={channels} /> : (
              <MessageComposer
                draft={ws.draft}
                setDraft={ws.setDraft}
                mentions={mentions}
                setMentions={setMentions}
                people={people}
                channels={channels.channels}
                documents={ws.documents}
                placeholder={`Message #${channelName}`}
                focusSignal={ws.composerFocus}
                onSend={(text, attachment, sent) => void ws.sendMessage(text, attachment, sent)}
              />
            )}
          </>}

          {ws.messageTab === 'files' && (
            <ul className="ws-files" aria-label="Shared files">
              {ws.documents.map((doc) => {
                const open = openFindings(doc, ws.resolved[doc.id]).length
                return (
                  <li key={doc.id}>
                    <span className="ws-doc-icon">{documentKind(doc.type).icon}</span>
                    <span><strong>{documentDisplayName(doc)}</strong><small>{doc.type} · score {doc.score} · {open ? `${open} open` : 'all clear'}</small></span>
                    <button type="button" className="ws-btn ws-btn-sm" onClick={() => openDoc(doc.id, doc.title)}>Open</button>
                    <button type="button" className="ws-btn ws-btn-sm" onClick={() => ws.openInReview(doc)}>Review</button>
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

        {openDocument && <DocumentPanel key={openDocument.id} documentId={openDocument.id} fallbackTitle={openDocument.title} onClose={() => setOpenDocument(null)} />}
      </div>

      {dialog?.kind === 'create' && (
        <CreateChannelDialog channels={channels} onClose={() => setDialog(null)} onCreated={(channel) => { setDialog(null); channels.select(channel.id); ws.setNotice(`#${channel.name} is ready.`) }} />
      )}
      {dialog?.kind === 'browse' && (
        <BrowseChannelsDialog channels={channels} onClose={() => setDialog(null)} onOpen={(channel) => { setDialog(null); channels.select(channel.id) }} onCreate={() => setDialog({ kind: 'create' })} />
      )}
      {dialog?.kind === 'details' && (
        <ChannelDetailsDialog key={`${activeChannel?.id}-${dialog.tab}`} channels={channels} tab={dialog.tab} canManage={canManageChannel} canDelete={!channels.shared || Boolean(activeChannel?.can_delete)} onClose={() => setDialog(null)} about={linkedCard} />
      )}
      {dialog?.kind === 'workspace' && <WorkspaceSettingsDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'spaces' && <SpaceAccessDialog onClose={() => setDialog(null)} />}

      {searchOpen && (
        <div className="ws-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
          <div className="ws-dialog ws-dialog-sm" role="dialog" aria-modal="true" aria-label="Search messages">
            <div className="ws-dialog-search">
              <Search size={16} />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats, people, or documents..." aria-label="Search messages" />
              <button type="button" className="ws-icon-btn" aria-label="Close message search" onClick={() => setSearchOpen(false)}><X size={16} /></button>
            </div>
            <ul className="ws-results">
              {results.map((r) => (
                <li key={r.key}>
                  <span className="ws-pill">{r.kind}</span>
                  <div><strong>{r.title}</strong><small>{r.detail}</small></div>
                  {r.document && <button type="button" className="ws-btn ws-btn-sm" onClick={() => { setSearchOpen(false); openDoc(r.document!.id, r.document!.title) }}>Open</button>}
                </li>
              ))}
              {needle && !results.length && <li className="ws-muted">No matches for “{query}”.</li>}
              {!needle && <li className="ws-muted">Type to search messages and documents in this space.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
