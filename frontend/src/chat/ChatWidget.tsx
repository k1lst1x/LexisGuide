/* The LexisGuide chat popup: a bottom-right launcher and panel that talks to the
   LexisGuideAssistant agent (AgentCore) through /api/v1/chat. When the visitor is
   signed out or the service is unreachable, it answers from a local guide instead. */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Minus, RotateCcw, Sparkles } from 'lucide-react'
import { cognitoGetIdToken } from '../aws'
import { apiBase } from '../workspace/api'
import { defaultGuide } from './guide'
import './chat.css'

export type ChatContext = {
  page?: string
  document_title?: string
  document_type?: string
  document_score?: number
  document_excerpt?: string
  open_findings?: string[]
  current_finding?: string
  jurisdiction?: string
}

type Turn = { id: string; role: 'user' | 'assistant'; content: string; local?: boolean }
type Mode = 'live' | 'guide' | 'unknown'

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
}

const MAX_HISTORY = 12

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function load(key: string): { conversationId: string; turns: Turn[] } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null')
    if (parsed && typeof parsed.conversationId === 'string' && Array.isArray(parsed.turns)
      && parsed.turns.every((t: Turn) => typeof t?.content === 'string' && (t.role === 'user' || t.role === 'assistant'))) return parsed
  } catch { /* start fresh */ }
  return null
}

/** Paragraphs, "- " bullets, numbered steps and **bold**, rendered as React nodes (never HTML). */
function RichText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>)
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={blocks.length}>{list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</Tag>)
    list = null
  }
  text.split('\n').forEach((raw) => {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((bullet ?? numbered)![1])
      return
    }
    flush()
    if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  })
  flush()
  return <>{blocks}</>
}

export function ChatWidget({ storageKey, context, suggestions = [], fallback = defaultGuide, greeting, open: controlledOpen, onOpenChange, pendingQuestion, onSignIn, className = '', footer, embedded = false }: Props) {
  const [saved] = useState(() => load(storageKey))
  const [conversationId, setConversationId] = useState(saved?.conversationId ?? newId())
  const welcome: Turn = { id: 'welcome', role: 'assistant', content: greeting ?? 'Hi! I’m the LexisGuide assistant. Ask me about a notice or agreement, a legal term, or how to use LexisGuide.', local: true }
  const [turns, setTurns] = useState<Turn[]>(saved?.turns?.length ? saved.turns : [welcome])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('unknown')
  const [notice, setNotice] = useState('')
  const [localOpen, setLocalOpen] = useState(false)
  const open = embedded || (controlledOpen ?? localOpen)
  const setOpen = (value: boolean) => { onOpenChange?.(value); if (controlledOpen === undefined) setLocalOpen(value) }
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastPending = useRef<number | null>(null)

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ conversationId, turns: turns.slice(-40) })) } catch { /* optional */ }
  }, [storageKey, conversationId, turns])
  useEffect(() => { listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [turns.length, busy, open])
  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 60) }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const callAgent = async (history: Turn[]): Promise<string | null> => {
    let token = await cognitoGetIdToken().catch(() => null)
    if (!token) { setMode('guide'); setNotice('signed-out'); return null }
    const body = JSON.stringify({
      conversation_id: conversationId,
      messages: history.filter((t) => t.id !== 'welcome').slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
      context: { ...context, open_findings: context?.open_findings?.slice(0, 12) },
    })
    const send = (auth: string) => fetch(`${apiBase()}/api/v1/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body })
    let response = await send(token)
    if (response.status === 401) {
      token = await cognitoGetIdToken(true).catch(() => null)
      if (!token) { setMode('guide'); setNotice('signed-out'); return null }
      response = await send(token)
    }
    if (response.status === 429) { setNotice('You’re sending messages quickly. Please wait a minute and try again.'); return null }
    if (!response.ok) throw new Error(`chat ${response.status}`)
    const data = await response.json() as { reply?: string }
    setMode('live')
    setNotice('')
    return data.reply?.trim() || null
  }

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    const userTurn: Turn = { id: newId(), role: 'user', content: text }
    const history = [...turns, userTurn]
    setTurns(history)
    setInput('')
    setBusy(true)
    let reply: string | null = null
    try {
      reply = await callAgent(history)
    } catch {
      setMode('guide')
      setNotice('The AI agent is unavailable right now, so I’m answering from the built-in guide.')
    }
    setTurns((current) => [...current, { id: newId(), role: 'assistant', content: reply ?? fallback(text), local: !reply }])
    setBusy(false)
  }

  useEffect(() => {
    if (!pendingQuestion || pendingQuestion.id === lastPending.current) return
    lastPending.current = pendingQuestion.id
    void ask(pendingQuestion.text)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion])

  const reset = () => { setConversationId(newId()); setTurns([welcome]); setNotice('') }
  const status = mode === 'live' ? 'AI agent · online' : mode === 'guide' ? 'Guide mode' : 'Here to help'

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
