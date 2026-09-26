import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, Mic, Square } from 'lucide-react'
import { useVoiceInput } from './useVoiceInput'
import { MAX_MESSAGE_CHARS } from './useAssistantChat'

/* The collapsed pill springs open on focus and settles back when left empty.
   Two timings, as in the reference: the open and close overshoot on a spring,
   while height changes caused by typing are a short ease so the box does not
   bounce under the cursor on every keystroke. */
const SPRING = 'max-width .4s cubic-bezier(.175,.885,.32,1.275), height .4s cubic-bezier(.175,.885,.32,1.275)'
const SETTLE = 'max-width .4s cubic-bezier(.175,.885,.32,1.275), height .15s ease-out'

const COLLAPSED_HEIGHT = 48
const MIN_TEXT_HEIGHT = 68
const MAX_TEXT_HEIGHT = 160

export type PromptComposerProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  busy?: boolean
  placeholder?: string
  label?: string
  maxLength?: number
  /** Offer dictation. Ignored where the browser cannot transcribe. */
  voice?: boolean
  /** While an answer is being written, the send button stops it. */
  onStop?: () => void
  /** Files pasted into the box, rather than text. */
  onPasteFiles?: (files: File[]) => void
  /** Allow sending with no text, e.g. when files are attached. */
  canSendEmpty?: boolean
}

/** The assistant composer: a pill that opens into a card while it is in use. */
export function PromptComposer({
  value,
  onChange,
  onSubmit,
  busy = false,
  placeholder = 'Ask anything…',
  label = 'Ask LexisGuide',
  maxLength = MAX_MESSAGE_CHARS,
  voice = false,
  onStop,
  onPasteFiles,
  canSendEmpty = false,
}: PromptComposerProps) {
  const [expanded, setExpanded] = useState(false)
  // Typing resizes; opening and closing spring. Keeping them apart is what
  // stops the card wobbling as the text grows.
  const [typing, setTyping] = useState(false)
  const [textHeight, setTextHeight] = useState(MIN_TEXT_HEIGHT)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLFormElement>(null)
  // A form submit and an Enter key handler can arrive in the same render
  // frame, before the parent has supplied its new `busy` value. Keep the
  // sent value locally so a single user gesture can only submit once.
  const sentValueRef = useRef<string | null>(null)

  const hasValue = value.trim() !== ''

  const dictate = useCallback((text: string) => { setTyping(true); onChange(text) }, [onChange])
  const mic = useVoiceInput(dictate)

  // Text arriving from elsewhere (a suggestion, or "discuss this finding") opens
  // the composer just as typing does. Derived during render rather than in an
  // effect, so it never paints collapsed with text already in it.
  const isOpen = expanded || hasValue || mic.recording

  // Measure the text at its natural height, then clamp. Measuring with the
  // transition suppressed keeps the animation from chasing its own resize.
  useEffect(() => {
    const field = textareaRef.current
    if (!field) return
    const previous = field.style.height
    field.style.transition = 'none'
    field.style.height = '0px'
    const natural = field.scrollHeight
    field.style.height = previous
    void field.offsetHeight
    field.style.transition = ''
    setTextHeight(Math.max(MIN_TEXT_HEIGHT, Math.min(natural, MAX_TEXT_HEIGHT)))
  }, [value, isOpen])

  // Dictation runs long; keep the newest words in view.
  useEffect(() => {
    if (mic.recording && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    }
  }, [value, mic.recording])

  useEffect(() => {
    if (!isOpen || mic.recording) return
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [isOpen, mic.recording])

  useEffect(() => {
    if (busy) return
    const current = value.trim()
    if (!current || (sentValueRef.current && current !== sentValueRef.current)) {
      sentValueRef.current = null
    }
  }, [busy, value])

  const open = () => {
    setTyping(false)
    setExpanded(true)
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const text = value.trim()
    if ((!text && !canSendEmpty) || busy || sentValueRef.current !== null) return
    sentValueRef.current = text || ' '
    if (mic.recording) mic.stop()
    setTyping(false)
    onSubmit(text)
    setExpanded(false)
  }

  // One button, four jobs: stop an answer, send what is written, stop
  // dictating, or start.
  const action = busy && onStop ? 'halt' : mic.recording ? 'stop' : hasValue || canSendEmpty ? 'send' : voice && mic.supported ? 'mic' : 'send'
  const actionLabel = { halt: 'Stop answer', send: 'Send question', stop: 'Stop dictation', mic: 'Dictate your question' }[action]
  const nearLimit = value.length > maxLength * 0.8

  return (
    <form
      ref={rootRef}
      className={`cw-prompt ${isOpen ? 'is-open' : ''}`}
      onSubmit={submit}
      style={{
        maxWidth: isOpen ? 640 : 340,
        transition: typing ? 'max-width .15s ease-out' : 'max-width .4s cubic-bezier(.175,.885,.32,1.275)',
      }}
      onBlur={(event) => {
        // Staying inside the composer is not leaving it.
        if (rootRef.current?.contains(event.relatedTarget as Node)) return
        if (!hasValue && !mic.recording) {
          setTyping(false)
          setExpanded(false)
        }
      }}
    >
      <div
        className="cw-prompt-card"
        style={{
          height: isOpen ? textHeight + 48 : COLLAPSED_HEIGHT,
          transition: typing ? SETTLE : SPRING,
        }}
        onMouseDown={(event) => {
          if (isOpen && event.target !== textareaRef.current) {
            event.preventDefault()
            textareaRef.current?.focus()
          }
        }}
      >
        <button
          type="button"
          className="cw-prompt-placeholder"
          onClick={open}
          onFocus={open}
          aria-label={label}
          aria-expanded={isOpen}
          style={{
            opacity: isOpen ? 0 : 1,
            transform: isOpen ? 'scale(1.05) translateY(4px)' : 'scale(1) translateY(0)',
            pointerEvents: isOpen ? 'none' : 'auto',
          }}
        >
          {placeholder}
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => { setTyping(true); onChange(event.target.value) }}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (files.length && onPasteFiles) { event.preventDefault(); onPasteFiles(files) }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape' && !hasValue) {
              setTyping(false)
              setExpanded(false)
              textareaRef.current?.blur()
            }
          }}
          placeholder={mic.recording ? 'Listening…' : placeholder}
          aria-label={label}
          aria-hidden={!isOpen}
          tabIndex={isOpen ? 0 : -1}
          maxLength={maxLength}
          style={{
            height: textHeight,
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'scale(1) translateY(0)' : 'scale(.95) translateY(-4px)',
            pointerEvents: isOpen ? 'auto' : 'none',
            overflowY: textHeight >= MAX_TEXT_HEIGHT ? 'auto' : 'hidden',
            transition: typing
              ? 'height .15s ease-out'
              : 'opacity .3s ease-out, transform .3s cubic-bezier(.175,.885,.32,1.275), height .4s cubic-bezier(.175,.885,.32,1.275)',
          }}
        />

        {/* Driven by the real microphone, so silence reads as silence. */}
        {mic.recording && (
          <div className="cw-prompt-levels" aria-hidden="true">
            {mic.levels.map((level, index) => (
              <i key={index} style={{ height: `${Math.max(4, level * 24)}px` }} />
            ))}
          </div>
        )}

        <button
          type={action === 'send' ? 'submit' : 'button'}
          className={`cw-prompt-send ${mic.recording ? 'is-recording' : ''}`}
          disabled={action === 'send' && ((!hasValue && !canSendEmpty) || busy)}
          aria-label={actionLabel}
          title={actionLabel}
          onClick={(event) => {
            if (action === 'send') return
            event.preventDefault()
            if (action === 'halt') onStop?.()
            else if (mic.recording) mic.stop()
            else void mic.start()
          }}
        >
          {action === 'send' ? <ArrowUp size={16} /> : action === 'stop' || action === 'halt' ? <Square size={13} /> : <Mic size={15} />}
        </button>

        {isOpen && (
          <div className="cw-prompt-meta" aria-hidden="true">
            <span>LexisGuide AI</span>
            <span className={nearLimit ? 'is-near-limit' : ''}>{mic.recording ? 'Listening…' : nearLimit ? `${value.length.toLocaleString()} / ${maxLength.toLocaleString()} characters` : 'Shift + Enter for a new line'}</span>
          </div>
        )}
      </div>

      {mic.error && <p className="cw-prompt-hint is-error" role="alert">{mic.error}</p>}
      {voice && !mic.supported && !mic.error && (
        <p className="cw-prompt-hint">Dictation needs Chrome, Edge or Safari. You can type your question here.</p>
      )}
    </form>
  )
}
