/* Actions under an answer: copy it, or ask for a fresh one. */
import { useEffect, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'

export function CopyAnswer({ text, className = 'ac-copy' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className={className}
      aria-label={copied ? 'Answer copied' : 'Copy answer'}
      title={copied ? 'Copied' : 'Copy answer'}
      onClick={() => { navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {}) }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

export function RegenerateAnswer({ onClick, className = 'ac-copy' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" className={className} aria-label="Regenerate answer" title="Regenerate answer" onClick={onClick}>
      <RefreshCw size={13} />
    </button>
  )
}
