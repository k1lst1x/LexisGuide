/* A searchable emoji picker, used for reactions and in the composer. */
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { EMOJI_GROUPS, searchEmoji } from '../emoji'

export function EmojiPicker({ label, onPick, onClose, className = '' }: { label: string; onPick: (emoji: string) => void; onClose: () => void; className?: string }) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    // The anchor holds the button that opened the picker; that button toggles it.
    const onDown = (event: MouseEvent) => {
      const anchor = ref.current?.parentElement ?? ref.current
      if (anchor && !anchor.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const found = searchEmoji(query)
  const pick = (emoji: string) => { onPick(emoji); onClose() }
  return (
    <div ref={ref} className={`ws-popover ws-emoji-picker ${className}`} role="dialog" aria-label={label}>
      <label className="ws-emoji-search">
        <Search size={14} aria-hidden="true" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search emoji" aria-label="Search emoji" />
      </label>
      <div className="ws-emoji-scroll">
        {query.trim() ? (
          found.length
            ? <div className="ws-emoji-grid">{found.map((emoji) => <button key={emoji} type="button" onClick={() => pick(emoji)} aria-label={emoji}>{emoji}</button>)}</div>
            : <p className="ws-muted">No emoji match “{query}”.</p>
        ) : EMOJI_GROUPS.map((group) => (
          <section key={group.name}>
            <h4>{group.name}</h4>
            <div className="ws-emoji-grid">
              {group.emoji.map(([emoji, words]) => <button key={emoji} type="button" onClick={() => pick(emoji)} aria-label={`${emoji} ${words.split(' ')[0]}`} title={words.split(' ')[0]}>{emoji}</button>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
