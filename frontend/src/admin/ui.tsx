import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, X } from 'lucide-react'

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'red' | 'amber' | 'ink'; children: ReactNode }) {
  return <span className={`adm-badge is-${tone}`}>{children}</span>
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="adm-loading" role="status">
      <Loader2 size={18} className="adm-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="adm-error" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && <button type="button" className="adm-link" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="adm-empty">{children}</p>
}

type ConfirmProps = {
  title: string
  body: ReactNode
  confirmLabel: string
  /** When set, the admin must type this exact text before the action unlocks. */
  typeToConfirm?: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}

/** A modal that runs a destructive or account-changing action and reports its failure in place. */
export function ConfirmDialog({ title, body, confirmLabel, typeToConfirm, danger, onConfirm, onClose }: ConfirmProps) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const first = useRef<HTMLButtonElement | HTMLInputElement | null>(null)

  useEffect(() => { first.current?.focus() }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const locked = Boolean(typeToConfirm) && typed.trim() !== typeToConfirm
  const run = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
      setBusy(false)
    }
  }

  // Portalled to the portal root: an animated ancestor (the account drawer)
  // would otherwise become the containing block and trap the fixed scrim.
  return createPortal(
    <div className="adm-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="adm-dialog" role="dialog" aria-modal="true" aria-labelledby="adm-dialog-title">
        <div className="adm-dialog-head">
          <h2 id="adm-dialog-title">{title}</h2>
          <button type="button" className="adm-icon-btn" aria-label="Close" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="adm-dialog-body">{body}</div>
        {typeToConfirm && (
          <label className="adm-field">
            <span>Type <strong>{typeToConfirm}</strong> to confirm</span>
            <input
              ref={(node) => { first.current = node }}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        {error && <ErrorNote message={error} />}
        <div className="adm-dialog-foot">
          <button type="button" className="adm-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            ref={typeToConfirm ? undefined : (node) => { first.current = node }}
            className={`adm-btn ${danger ? 'is-danger' : 'is-primary'}`}
            onClick={run}
            disabled={busy || locked}
          >
            {busy ? <Loader2 size={15} className="adm-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.querySelector('.adm') ?? document.body,
  )
}
