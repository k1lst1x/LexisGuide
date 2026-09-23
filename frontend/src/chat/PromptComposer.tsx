import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp } from 'lucide-react'

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
}

/** The assistant composer: a pill that opens into a card while it is in use. */
export function PromptComposer({
  value,
  onChange,
  onSubmit,
  busy = false,
  placeholder = 'Ask anything…',
  label = 'Ask LexisGuide',
  maxLength = 4000,
}: PromptComposerProps) {
  const [expanded, setExpanded] = useState(false)
  // Typing resizes; opening and closing spring. Keeping them apart is what
  // stops the card wobbling as the text grows.
  const [typing, setTyping] = useState(false)
  const [textHeight, setTextHeight] = useState(MIN_TEXT_HEIGHT)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLFormElement>(null)

  const hasValue = value.trim() !== ''
  // Text arriving from elsewhere (a suggestion, or "discuss this finding") opens
  // the composer just as typing does. Derived during render rather than in an
  // effect, so it never paints collapsed with text already in it.
  const isOpen = expanded || hasValue

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

  useEffect(() => {
    if (!isOpen) return
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  const open = () => {
    setTyping(false)
    setExpanded(true)
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!hasValue || busy) return
    setTyping(false)
    onSubmit(value)
    setExpanded(false)
  }

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
        if (!hasValue) {
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
          placeholder={placeholder}
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

        <button type="submit" className="cw-prompt-send" disabled={!hasValue || busy} aria-label="Send question">
          <ArrowUp size={16} />
        </button>

        {isOpen && (
          <div className="cw-prompt-meta" aria-hidden="true">
            <span>LexisGuide AI</span>
            <span>Shift + Enter for a new line</span>
          </div>
        )}
      </div>
    </form>
  )
}
