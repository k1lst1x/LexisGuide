/* The assistant page: one chat box, and nothing else until there is something
   to show. The transcript has its own styles rather than borrowing the popup's,
   which are scoped to that panel and lose their bubbles out here. */
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, RotateCcw, Sparkles } from 'lucide-react'
import { PromptComposer } from './PromptComposer'
import { RichText } from './RichText'
import { useAssistantChat, type ChatContext, type Turn } from './useAssistantChat'
import './chat.css'

export type AssistantConsoleProps = {
  storageKey: string
  context?: ChatContext
  suggestions?: string[]
  fallback: (question: string) => string
  greeting: string
  /** A question to send as soon as it changes (for “Ask about this” buttons). */
  pendingQuestion?: { id: number; text: string } | null
}

/** Copy an answer without leaving the page. */
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className="ac-copy"
      aria-label={copied ? 'Answer copied' : 'Copy answer'}
      title={copied ? 'Copied' : 'Copy answer'}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {})
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

function Message({ turn }: { turn: Turn }) {
  const isAssistant = turn.role === 'assistant'
  return (
    <article className={`ac-msg ac-msg-${turn.role}`}>
      {isAssistant && (
        <span className="ac-avatar" aria-hidden="true"><Sparkles size={14} /></span>
      )}
      <div className="ac-bubble">
        {isAssistant ? <RichText text={turn.content} /> : <p>{turn.content}</p>}
        {isAssistant && turn.id !== 'welcome' && <CopyAnswer text={turn.content} />}
      </div>
    </article>
  )
}

export function AssistantConsole({
  storageKey,
  context,
  suggestions = [],
  fallback,
  greeting,
  pendingQuestion,
}: AssistantConsoleProps) {
  const chat = useAssistantChat({ storageKey, context, greeting, fallback, persist: true })
  const threadRef = useRef<HTMLDivElement>(null)
  const lastPending = useRef<number | null>(null)

  // Only the welcome line means nothing has been asked yet, so the box sits in
  // the middle of the page rather than under an empty transcript.
  const started = chat.turns.some((turn) => turn.id !== 'welcome')

  useEffect(() => {
    if (!started) return
    threadRef.current?.scrollTo?.({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.turns.length, chat.busy, started])

  useEffect(() => {
    if (!pendingQuestion || pendingQuestion.id === lastPending.current) return
    lastPending.current = pendingQuestion.id
    void chat.ask(pendingQuestion.text)
  }, [pendingQuestion, chat])

  return (
    <section className={`ac ${started ? 'is-started' : ''}`} aria-label="Ask LexisGuide">
      {started ? (
        <div className="ac-thread" ref={threadRef} aria-live="polite">
          {chat.turns.map((turn) => <Message key={turn.id} turn={turn} />)}
          {chat.busy && (
            <article className="ac-msg ac-msg-assistant">
              <span className="ac-avatar" aria-hidden="true"><Sparkles size={14} /></span>
              <div className="ac-bubble ac-typing" aria-label="Assistant is thinking">
                <span /><span /><span />
              </div>
            </article>
          )}
        </div>
      ) : (
        <div className="ac-hero">
          <span className="ac-hero-mark" aria-hidden="true"><Sparkles size={22} /></span>
          {/* The greeting is the transcript's first line once anything is
              asked, so here it only needs to be a caption, not a headline. */}
          <p className="ac-hero-line">{greeting}</p>
          {suggestions.length > 0 && (
            <div className="ac-suggest" aria-label="Suggested questions">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  style={{ animationDelay: `${120 + index * 60}ms` }}
                  onClick={() => void chat.ask(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ac-dock">
        {chat.notice && chat.notice !== 'signed-out' && (
          <p className="ac-notice" role="status">{chat.notice}</p>
        )}

        <PromptComposer
          value={chat.input}
          onChange={chat.setInput}
          onSubmit={(question) => void chat.ask(question)}
          busy={chat.busy}
          voice
        />

        <div className="ac-foot">
          <span className={`ac-status is-${chat.mode}`}>
            <i aria-hidden="true" />{chat.status}
          </span>
          <span className="ac-foot-sep" aria-hidden="true">·</span>
          <span>General information, not legal advice.</span>
          {started && (
            <button type="button" className="ac-reset" onClick={chat.reset}>
              <RotateCcw size={12} aria-hidden="true" /> New conversation
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
