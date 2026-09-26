/* The assistant page: one chat box, and nothing else until there is something
   to show. The transcript has its own styles rather than borrowing the popup's,
   which are scoped to that panel and lose their bubbles out here. */
import { useEffect, useRef } from 'react'
import { Download, RotateCcw, Sparkles } from 'lucide-react'
import { AttachButton, DropOverlay, MessageFiles, SentText, StagedFiles, type AttachableDocument } from './Attachments'
import { CopyAnswer, RegenerateAnswer } from './MessageActions'
import { PromptComposer } from './PromptComposer'
import { RichText } from './RichText'
import { useAssistantChat, type ChatContext, type Turn } from './useAssistantChat'
import { useFileDrop } from './useFileDrop'
import './chat.css'

export type AssistantConsoleProps = {
  storageKey: string
  context?: ChatContext
  suggestions?: string[]
  fallback: (question: string) => string
  greeting: string
  /** A question to send as soon as it changes (for “Ask about this” buttons). */
  pendingQuestion?: { id: number; text: string } | null
  /** Documents the person can attach without uploading them again. */
  documents?: AttachableDocument[]
}

function Message({ turn, onRegenerate }: { turn: Turn; onRegenerate?: () => void }) {
  const isAssistant = turn.role === 'assistant'
  return (
    <article className={`ac-msg ac-msg-${turn.role}`}>
      {isAssistant && (
        <span className="ac-avatar" aria-hidden="true"><Sparkles size={14} /></span>
      )}
      <div className="ac-bubble">
        {isAssistant ? <RichText text={turn.content} /> : <SentText text={turn.content} />}
        <MessageFiles files={turn.attachments} />
        {isAssistant && turn.id !== 'welcome' && (
          <span className="ac-actions">
            <CopyAnswer text={turn.content} />
            {onRegenerate && <RegenerateAnswer onClick={onRegenerate} />}
          </span>
        )}
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
  documents = [],
}: AssistantConsoleProps) {
  const chat = useAssistantChat({ storageKey, context, greeting, fallback, persist: true })
  const { dragging, dropProps } = useFileDrop((files) => void chat.attachFiles(files))
  const lastAnswer = [...chat.turns].reverse().find((turn) => turn.role === 'assistant' && turn.id !== 'welcome')
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
    <section className={`ac ${started ? 'is-started' : ''}`} aria-label="Ask LexisGuide" {...dropProps}>
      <DropOverlay visible={dragging} />
      {started ? (
        <div className="ac-thread" ref={threadRef} aria-live="polite">
          {chat.turns.map((turn) => (
            <Message
              key={turn.id}
              turn={turn}
              onRegenerate={turn.id === lastAnswer?.id && chat.canRegenerate ? () => void chat.regenerate() : undefined}
            />
          ))}
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

        <StagedFiles files={chat.staged} reading={chat.reading} onRemove={chat.unstage} />
        <div className="cf-compose-row">
          <AttachButton
            onFiles={(files) => void chat.attachFiles(files)}
            documents={documents}
            onDocument={(doc) => chat.attachText(doc.title, doc.type, doc.text)}
            disabled={chat.busy}
          />
          <PromptComposer
            value={chat.input}
            onChange={chat.setInput}
            onSubmit={(question) => void chat.ask(question)}
            busy={chat.busy}
            onStop={chat.stop}
            onPasteFiles={(files) => void chat.attachFiles(files)}
            canSendEmpty={chat.staged.length > 0}
            placeholder={chat.staged.length ? 'Ask about the attached file…' : undefined}
            voice
          />
        </div>

        <div className="ac-foot">
          <span className={`ac-status is-${chat.mode}`}>
            <i aria-hidden="true" />{chat.status}
          </span>
          <span className="ac-foot-sep" aria-hidden="true">·</span>
          <span>General information, not legal advice.</span>
          {started && (
            <>
              <button type="button" className="ac-reset" onClick={chat.download}>
                <Download size={12} aria-hidden="true" /> Download
              </button>
              <button type="button" className="ac-reset" onClick={chat.reset}>
                <RotateCcw size={12} aria-hidden="true" /> New conversation
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
