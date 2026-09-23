/* The assistant page: one chat box, centred, and nothing else until there is
   something to show. The old page framed an empty panel the height of the
   screen; here the conversation grows above the composer as it happens. */
import { useEffect, useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { PromptComposer } from './PromptComposer'
import { RichText } from './RichText'
import { useAssistantChat, type ChatContext } from './useAssistantChat'
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

export function AssistantConsole({
  storageKey,
  context,
  suggestions = [],
  fallback,
  greeting,
  pendingQuestion,
}: AssistantConsoleProps) {
  const chat = useAssistantChat({ storageKey, context, greeting, fallback })
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
          {chat.turns.map((turn) => (
            <article key={turn.id} className={`cw-msg cw-msg-${turn.role}`}>
              <RichText text={turn.content} />
            </article>
          ))}
          {chat.busy && (
            <article className="cw-msg cw-msg-assistant cw-typing" aria-label="Assistant is typing">
              <span /><span /><span />
            </article>
          )}
        </div>
      ) : (
        <p className="ac-greeting">{greeting}</p>
      )}

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

      {!started && suggestions.length > 0 && (
        <div className="ac-suggest" aria-label="Suggested questions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void chat.ask(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}

      <div className="ac-foot">
        <span>General information, not legal advice.</span>
        {started && (
          <button type="button" className="ac-reset" onClick={chat.reset}>
            <RotateCcw size={13} aria-hidden="true" /> New conversation
          </button>
        )}
      </div>
    </section>
  )
}
