/* The LexisGuide chat popup: a bottom-right launcher and panel that talks to the
   LexisGuideAssistant agent (AgentCore) through /api/v1/chat. When the visitor is
   signed out or the service is unreachable, it answers from a local guide instead. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Download, Minus, RotateCcw, Sparkles, Square } from 'lucide-react'
import { defaultGuide } from './guide'
import './chat.css'
import { AttachButton, DropOverlay, MessageFiles, SentText, StagedFiles, type AttachableDocument } from './Attachments'
import { CopyAnswer, RegenerateAnswer } from './MessageActions'
import { PromptComposer } from './PromptComposer'
import { RichText } from './RichText'
import { MAX_MESSAGE_CHARS, useAssistantChat, type ChatContext, type WorkspaceAction } from './useAssistantChat'
import { useFileDrop } from './useFileDrop'

export type { ChatContext }

type Props = {
  storageKey: string
  context?: ChatContext
  suggestions?: string[]
  /** Local answer used when the live agent is unavailable. */
  fallback?: (question: string) => string
  greeting?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** A question to send as soon as it changes (for “Ask about this” buttons). */
  pendingQuestion?: { id: number; text: string } | null
  onSignIn?: () => void
  className?: string
  footer?: ReactNode
  /** Render as a full-page conversation, without the floating launcher. */
  embedded?: boolean
  /** Use the composer that springs open from a pill. */
  expandingComposer?: boolean
  /** Documents the person can attach without uploading them again. */
  documents?: AttachableDocument[]
  /** The document used as the default context for the next assistant request. */
  activeDocumentId?: string
  onDocumentContextChange?: (documentId: string) => void
  onWorkspaceAction?: (action: WorkspaceAction) => void
}


export function ChatWidget({ storageKey, context, suggestions = [], fallback = defaultGuide, greeting, open: controlledOpen, onOpenChange, pendingQuestion, onSignIn, className = '', footer, embedded = false, expandingComposer = false, documents = [], activeDocumentId, onDocumentContextChange, onWorkspaceAction }: Props) {
  const chat = useAssistantChat({ storageKey, context, greeting, fallback })
  const { turns, input, setInput, busy, mode, notice, ask, reset, status } = chat
  const [localOpen, setLocalOpen] = useState(false)
  const open = embedded || (controlledOpen ?? localOpen)
  const setOpen = (value: boolean) => { onOpenChange?.(value); if (controlledOpen === undefined) setLocalOpen(value) }
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastPending = useRef<number | null>(null)
  const appliedActions = useRef(new Set<string>())
  const { dragging, dropProps } = useFileDrop((files) => void chat.attachFiles(files))
  const started = turns.some((turn) => turn.id !== 'welcome')
  const canSend = Boolean(input.trim() || chat.staged.length)
  const lastAnswer = [...turns].reverse().find((turn) => turn.role === 'assistant' && turn.id !== 'welcome')

  useEffect(() => { listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [turns.length, busy, open])
  useEffect(() => { if (open && !expandingComposer) window.setTimeout(() => inputRef.current?.focus(), 60) }, [open, expandingComposer])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!pendingQuestion || pendingQuestion.id === lastPending.current) return
    lastPending.current = pendingQuestion.id
    void ask(pendingQuestion.text)
  }, [pendingQuestion, ask])

  // The API only emits apply_rewrite after a clear in-chat confirmation. Run
  // that approved, scoped change once rather than showing another UI button.
  useEffect(() => {
    for (const turn of turns) {
      if (turn.role !== 'assistant' || !turn.workspaceActions?.includes('apply_rewrite')) continue
      const key = `${turn.id}:apply_rewrite`
      if (appliedActions.current.has(key)) continue
      appliedActions.current.add(key)
      onWorkspaceAction?.('apply_rewrite')
    }
  }, [turns, onWorkspaceAction])

  const attach = (
    <AttachButton
      onFiles={(files) => void chat.attachFiles(files)}
      documents={documents}
      onDocument={(doc) => chat.attachText(doc.title, doc.type, doc.text)}
      disabled={busy}
    />
  )

  return (
    <div className={`cw ${open ? 'is-open' : ''} ${className}`}>
      {open && (
        <section className="cw-panel" role="dialog" aria-modal="false" aria-label="Ask LexisGuide" {...dropProps}>
          <DropOverlay visible={dragging} />
          <header className="cw-head">
            <span className="cw-mark" aria-hidden="true"><Sparkles size={15} /></span>
            <div>
              <strong>LexisGuide assistant</strong>
              <small><i className={`cw-dot cw-dot-${mode}`} />{status}</small>
            </div>
            {started && <button type="button" className="cw-icon" onClick={chat.download} aria-label="Download this conversation" title="Download conversation"><Download size={15} /></button>}
            <button type="button" className="cw-icon" onClick={reset} aria-label="Start a new conversation" title="New conversation"><RotateCcw size={15} /></button>
            {!embedded && <button type="button" className="cw-icon" onClick={() => setOpen(false)} aria-label="Close assistant" title="Close"><Minus size={16} /></button>}
          </header>
          {documents.length > 0 && onDocumentContextChange && (
            <label className="cw-context">
              <span>Document context</span>
              <select value={activeDocumentId ?? ''} onChange={(event) => onDocumentContextChange(event.target.value)} aria-label="Document context">
                {documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
              </select>
            </label>
          )}

          <div className="cw-list" ref={listRef} aria-live="polite">
            {turns.map((turn) => (
              <article key={turn.id} className={`cw-msg cw-msg-${turn.role}`}>
                {turn.role === 'assistant' ? <RichText text={turn.content} /> : <SentText text={turn.content} />}
                <MessageFiles files={turn.attachments} />
                {turn.role === 'assistant' && turn.workspaceActions?.filter((action) => action !== 'apply_rewrite').map((action) => (
                  <button key={action} type="button" className="cw-workspace-action" onClick={() => onWorkspaceAction?.(action)}>
                    {action === 'review' ? 'Re-check this document'
                      : action === 'negotiate' ? 'Suggest negotiation points'
                        : action === 'rewrite' ? 'Draft a revision for this issue'
                          : action === 'resolve' ? 'Mark current issue resolved'
                            : 'Create follow-up task'}
                  </button>
                ))}
                {turn.role === 'assistant' && turn.id !== 'welcome' && (
                  <div className="cw-msg-actions">
                    <CopyAnswer text={turn.content} className="cw-msg-action" />
                    {turn.id === lastAnswer?.id && chat.canRegenerate && <RegenerateAnswer className="cw-msg-action" onClick={() => void chat.regenerate()} />}
                  </div>
                )}
              </article>
            ))}
            {busy && <article className="cw-msg cw-msg-assistant cw-typing" aria-label="Assistant is typing"><span /><span /><span /></article>}
            {notice === 'signed-out' ? (
              <div className="cw-notice" role="status">
                <span>You’re chatting with the built-in guide. Sign in to talk with the live AI agent.</span>
                {onSignIn && <button type="button" onClick={onSignIn}>Sign in to chat</button>}
              </div>
            ) : notice ? <div className="cw-notice" role="status"><span>{notice}</span></div> : null}
          </div>

          {suggestions.length > 0 && turns.length <= 2 && !busy && (
            <div className="cw-suggest" aria-label="Suggested questions">
              {suggestions.map((s) => <button key={s} type="button" onClick={() => void ask(s)}>{s}</button>)}
            </div>
          )}
          {footer}

          <div className="cw-staged-wrap"><StagedFiles files={chat.staged} reading={chat.reading} onRemove={chat.unstage} /></div>

          {expandingComposer ? (
            <div className="cw-compose-wrap cf-compose-row">
              {attach}
              <PromptComposer
                value={input}
                onChange={setInput}
                onSubmit={(question) => void ask(question)}
                busy={busy}
                onStop={chat.stop}
                onPasteFiles={(files) => void chat.attachFiles(files)}
                canSendEmpty={chat.staged.length > 0}
              />
            </div>
          ) : (
            <form className="cw-compose" onSubmit={(event) => { event.preventDefault(); if (!busy) void ask(input) }}>
              {attach}
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!busy) void ask(input) } }}
                onPaste={(event) => {
                  const files = [...event.clipboardData.files]
                  if (files.length) { event.preventDefault(); void chat.attachFiles(files) }
                }}
                placeholder={chat.staged.length ? 'Ask about the attached file…' : 'Ask anything…'}
                aria-label="Ask LexisGuide"
                maxLength={MAX_MESSAGE_CHARS}
              />
              {busy
                ? <button type="button" className="cw-stop" onClick={chat.stop} aria-label="Stop answer" title="Stop answer"><Square size={13} /></button>
                : <button type="submit" disabled={!canSend} aria-label="Send question"><ArrowUp size={16} /></button>}
            </form>
          )}
          {input.length > MAX_MESSAGE_CHARS * 0.8 && (
            <p className="cw-count" role="status">{input.length.toLocaleString()} / {MAX_MESSAGE_CHARS.toLocaleString()} characters. For longer text, attach it as a file.</p>
          )}
          <p className="cw-foot">General information, not legal advice.</p>
        </section>
      )}

      {!embedded && <button type="button" className="cw-launcher" onClick={() => setOpen(!open)} aria-label={open ? 'Close LexisGuide assistant' : 'Open LexisGuide assistant'} aria-expanded={open}>
        <Sparkles size={18} />
        <span>{open ? 'Close' : 'Ask LexisGuide'}</span>
      </button>}
    </div>
  )
}
