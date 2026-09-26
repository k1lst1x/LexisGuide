/* The message box: grows with the text, suggests people (@), channels (#),
   and documents (/ or @) as you type, and attaches a document or an emoji. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { FileText, Hash, Paperclip, Send, Smile, X } from 'lucide-react'
import { documentDisplayName, type MessageMention, type SampleDoc, type WorkspaceChannel } from '../data'
import { findTrigger, mentionToken, mentionsInText, type MentionTrigger } from '../mentions'
import { EmojiPicker } from './EmojiPicker'

type Person = { id: string; name: string; detail: string }
type Suggestion = MessageMention & { detail: string }

type Props = {
  draft: string
  setDraft: (text: string) => void
  mentions: MessageMention[]
  setMentions: (mentions: MessageMention[]) => void
  people: Person[]
  channels: WorkspaceChannel[]
  documents: SampleDoc[]
  placeholder: string
  focusSignal: number
  onSend: (text: string, attachment: string | null, mentions: MessageMention[]) => void
}

const MAX_SUGGESTIONS = 8

function suggestionsFor(trigger: MentionTrigger, people: Person[], channels: WorkspaceChannel[], documents: SampleDoc[]): Suggestion[] {
  const needle = trigger.query.toLowerCase()
  // Match the start of a word, so "ma" finds Maya but not Gmail addresses.
  const matches = (value: string) => !needle || value.toLowerCase().split(/[\s@._#·-]+/).some((word) => word.startsWith(needle)) || value.toLowerCase().startsWith(needle)
  const docs = documents
    .filter((doc) => matches(`${doc.title} ${documentDisplayName(doc)}`))
    .map((doc): Suggestion => ({ type: 'document', id: doc.id, label: doc.title, detail: doc.type }))
  if (trigger.char === '#') {
    return channels.filter((channel) => matches(channel.name)).map((channel) => ({ type: 'channel', id: channel.id, label: channel.name, detail: channel.description || 'Channel' }))
  }
  if (trigger.char === '/') return docs
  const users = people.filter((person) => matches(`${person.name} ${person.detail}`)).map((person): Suggestion => ({ type: 'user', id: person.id, label: person.name, detail: person.detail }))
  return [...users, ...docs]
}

export function MessageComposer({ draft, setDraft, mentions, setMentions, people, channels, documents, placeholder, focusSignal, onSend }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [attachment, setAttachment] = useState<string | null>(null)

  useEffect(() => { if (focusSignal) inputRef.current?.focus() }, [focusSignal])
  // Grow with the text, up to a limit, instead of scrolling a one-line box.
  useEffect(() => {
    const box = inputRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 180)}px`
  }, [draft])

  const trigger = findTrigger(draft, caret)
  const open = trigger && trigger.start !== dismissed ? trigger : null
  const suggestions = open ? suggestionsFor(open, people, channels, documents).slice(0, MAX_SUGGESTIONS) : []
  const active = Math.min(highlight, Math.max(suggestions.length - 1, 0))

  const placeCaret = (position: number) => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(position, position)
      setCaret(position)
    })
  }
  const choose = (suggestion: Suggestion) => {
    if (!open) return
    const mention: MessageMention = { type: suggestion.type, id: suggestion.id, label: suggestion.label }
    const token = `${mentionToken(mention)} `
    const end = open.start + 1 + open.query.length
    setDraft(draft.slice(0, open.start) + token + draft.slice(end))
    setMentions([...mentions, mention])
    setHighlight(0)
    placeCaret(open.start + token.length)
  }
  const insert = (text: string) => {
    const position = inputRef.current?.selectionStart ?? draft.length
    setDraft(draft.slice(0, position) + text + draft.slice(position))
    placeCaret(position + text.length)
  }
  const send = () => {
    if (!draft.trim()) return
    onSend(draft, attachment, mentionsInText(draft, mentions))
    setAttachment(null)
    setMentions([])
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setHighlight((active + step + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        choose(suggestions[active])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissed(open?.start ?? null)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }
  const attached = attachment ? documents.find((doc) => doc.id === attachment) : null

  return (
    <form className="ws-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      {suggestions.length > 0 && (
        <ul className="ws-popover ws-mention-menu" role="listbox" aria-label={open?.char === '#' ? 'Channels' : open?.char === '/' ? 'Documents' : 'People and documents'}>
          {suggestions.map((item, index) => (
            <li key={`${item.type}-${item.id}`} role="option" aria-selected={index === active}>
              <button type="button" className={index === active ? 'is-active' : ''} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlight(index)} onClick={() => choose(item)}>
                <span className="ws-mention-icon" aria-hidden="true">{item.type === 'user' ? item.label[0]?.toUpperCase() : item.type === 'channel' ? <Hash size={13} /> : <FileText size={13} />}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {attached && (
        <span className="ws-attachment is-draft"><FileText size={13} /> {documentDisplayName(attached)}<button type="button" aria-label="Remove attached document" onClick={() => setAttachment(null)}><X size={12} /></button></span>
      )}
      <div className="ws-composer-box">
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setCaret(event.target.selectionStart); setHighlight(0); setDismissed(null) }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Message"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
        />
        <div className="ws-composer-tools">
          <div className="ws-menu-anchor">
            <button type="button" className="ws-icon-btn" aria-label="Attach a document" title="Attach a document" aria-expanded={attachOpen} onClick={() => setAttachOpen((value) => !value)}><Paperclip size={16} /></button>
            {attachOpen && (
              <div className="ws-popover ws-menu ws-menu-up" role="menu">
                {documents.map((doc) => <button key={doc.id} type="button" role="menuitem" onClick={() => { setAttachment(doc.id); setAttachOpen(false) }}><strong>{documentDisplayName(doc)}</strong><small>{doc.type}</small></button>)}
                {!documents.length && <p className="ws-muted">Add a document first.</p>}
              </div>
            )}
          </div>
          <button type="button" className="ws-icon-btn" aria-label="Mention someone" title="Mention someone or a document" onClick={() => insert(draft && !/\s$/.test(draft) ? ' @' : '@')}>@</button>
          <div className="ws-menu-anchor">
            <button type="button" className="ws-icon-btn" aria-label="Add an emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((value) => !value)}><Smile size={16} /></button>
            {emojiOpen && <EmojiPicker label="Emoji picker" className="ws-menu-up" onPick={insert} onClose={() => setEmojiOpen(false)} />}
          </div>
          <span className="ws-composer-hint">Enter to send · Shift+Enter for a new line · @ people · # channels · / documents</span>
          <button type="submit" className="ws-btn ws-btn-dark ws-btn-sm" disabled={!draft.trim()}>Send <Send size={13} /></button>
        </div>
      </div>
    </form>
  )
}
