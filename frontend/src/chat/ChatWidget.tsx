/* The LexisGuide chat popup: a bottom-right launcher and panel that talks to the
   LexisGuideAssistant agent (AgentCore) through /api/v1/chat. When the visitor is
   signed out or the service is unreachable, it answers from a local guide instead. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Minus, RotateCcw, Sparkles } from 'lucide-react'
import { defaultGuide } from './guide'
import './chat.css'
import { PromptComposer } from './PromptComposer'
import { RichText } from './RichText'
import { useAssistantChat, type ChatContext } from './useAssistantChat'

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
}


export function ChatWidget({ storageKey, context, suggestions = [], fallback = defaultGuide, greeting, open: controlledOpen, onOpenChange, pendingQuestion, onSignIn, className = '', footer, embedded = false, expandingComposer = false }: Props) {
  const chat = useAssistantChat({ storageKey, context, greeting, fallback })
  const { turns, input, setInput, busy, mode, notice, ask, reset, status } = chat
  const [localOpen, setLocalOpen] = useState(false)
  const open = embedded || (controlledOpen ?? localOpen)
  const setOpen = (value: boolean) => { onOpenChange?.(value); if (controlledOpen === undefined) setLocalOpen(value) }
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastPending = useRef<number | null>(null)

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

  return (
    <div className={`cw ${open ? 'is-open' : ''} ${className}`}>
      {open && (
        <section className="cw-panel" role="dialog" aria-modal="false" aria-label="Ask LexisGuide">
          <header className="cw-head">
            <span className="cw-mark" aria-hidden="true"><Sparkles size={15} /></span>
            <div>
              <strong>LexisGuide assistant</strong>
              <small><i className={`cw-dot cw-dot-${mode}`} />{status}</small>
            </div>
            <button type="button" className="cw-icon" onClick={reset} aria-label="Start a new conversation" title="New conversation"><RotateCcw size={15} /></button>
            {!embedded && <button type="button" className="cw-icon" onClick={() => setOpen(false)} aria-label="Close assistant" title="Close"><Minus size={16} /></button>}
          </header>

          <div className="cw-list" ref={listRef} aria-live="polite">
            {turns.map((turn) => (
              <article key={turn.id} className={`cw-msg cw-msg-${turn.role}`}>
                {turn.role === 'assistant' ? <RichText text={turn.content} /> : <p>{turn.content}</p>}
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

          {expandingComposer ? (
            <div className="cw-compose-wrap">
              <PromptComposer
                value={input}
                onChange={setInput}
                onSubmit={(question) => void ask(question)}
                busy={busy}
              />
            </div>
          ) : (
            <form className="cw-compose" onSubmit={(event) => { event.preventDefault(); void ask(input) }}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(input) } }}
                placeholder="Ask anything…"
                aria-label="Ask LexisGuide"
                maxLength={4000}
              />
              <button type="submit" disabled={!input.trim() || busy} aria-label="Send question"><ArrowUp size={16} /></button>
            </form>
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
