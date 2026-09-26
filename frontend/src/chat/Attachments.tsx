/* Files in the assistant chat: the attach button (upload, or one of the
   person's workspace documents), the chips for files waiting to be sent, the
   chips on a sent message, and drag-and-drop onto the conversation. */
import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Paperclip, Upload, X } from 'lucide-react'
import type { AttachmentMeta, ChatFile } from './useAssistantChat'

const ACCEPTED_FILES = '.pdf,.docx,.rtf,.html,.htm,.txt,.md,.csv,.json,application/pdf,text/*'

export type AttachableDocument = { id: string; title: string; type: string; text: string }

const size = (chars: number) => chars >= 1000 ? `${Math.round(chars / 1000)}k characters` : `${chars} characters`

export function AttachButton({ onFiles, documents = [], onDocument, disabled = false, className = '' }: {
  onFiles: (files: File[]) => void
  documents?: AttachableDocument[]
  onDocument?: (document: AttachableDocument) => void
  disabled?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const withDocuments = Boolean(onDocument && documents.length)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', escape) }
  }, [open])

  return (
    <div className={`cf-attach ${className}`} ref={rootRef}>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={ACCEPTED_FILES}
        aria-label="Choose files to attach"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length) onFiles(files)
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className="cf-attach-btn"
        disabled={disabled}
        aria-label="Attach files"
        title="Attach files: PDF, Word, text"
        aria-expanded={withDocuments ? open : undefined}
        onClick={() => (withDocuments ? setOpen((value) => !value) : inputRef.current?.click())}
      >
        <Paperclip size={16} />
      </button>
      {open && withDocuments && (
        <div className="cf-menu" role="menu" aria-label="Attach">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); inputRef.current?.click() }}>
            <Upload size={14} aria-hidden="true" /> <span><strong>Upload a file</strong><small>PDF, Word, RTF, web page, or text</small></span>
          </button>
          <p className="cf-menu-label">From your documents</p>
          {documents.map((doc) => (
            <button key={doc.id} type="button" role="menuitem" onClick={() => { setOpen(false); onDocument?.(doc) }}>
              <FileText size={14} aria-hidden="true" /> <span><strong>{doc.title}</strong><small>{doc.type}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Files waiting to go with the next question. */
export function StagedFiles({ files, reading, onRemove }: { files: ChatFile[]; reading: number; onRemove: (id: string) => void }) {
  if (!files.length && !reading) return null
  return (
    <ul className="cf-staged" aria-label="Files to send">
      {files.map((file) => (
        <li key={file.id} className="cf-chip">
          <FileText size={13} aria-hidden="true" />
          <span className="cf-chip-name" title={file.name}>{file.name}</span>
          <small>{file.truncated ? `first ${size(file.text.length)} of ${size(file.chars)}` : size(file.chars)}</small>
          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}><X size={12} /></button>
        </li>
      ))}
      {reading > 0 && (
        <li className="cf-chip is-reading" role="status"><Loader2 size={13} className="cf-spin" aria-hidden="true" /> Reading {reading} file{reading === 1 ? '' : 's'}…</li>
      )}
    </ul>
  )
}

/** The files a sent message carried. */
export function MessageFiles({ files }: { files?: AttachmentMeta[] }) {
  if (!files?.length) return null
  return (
    <ul className="cf-sent" aria-label="Attached files">
      {files.map((file) => (
        <li key={file.name} className="cf-chip is-sent"><FileText size={12} aria-hidden="true" /><span className="cf-chip-name" title={file.name}>{file.name}</span></li>
      ))}
    </ul>
  )
}

export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <div className="cf-drop" aria-hidden="true"><Upload size={22} /><strong>Drop files to attach</strong><span>PDF, Word, RTF, web page, or text</span></div>
}

/** The text of a message you sent. A very long one shows its start first. */
export function SentText({ text }: { text: string }) {
  const long = text.length > 1500 || text.split('\n').length > 14
  const [expanded, setExpanded] = useState(false)
  if (!long) return <p>{text}</p>
  return (
    <div className={`cf-long ${expanded ? '' : 'is-clamped'}`}>
      <p>{text}</p>
      <button type="button" className="cf-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Show less' : `Show full message (${text.length.toLocaleString()} characters)`}
      </button>
    </div>
  )
}
