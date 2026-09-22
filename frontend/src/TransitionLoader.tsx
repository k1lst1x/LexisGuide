import { useEffect, useState } from 'react'
import './loaders.css'

type Props = {
  visible: boolean
  message?: string
}

const EXIT_MS = 560

/*
 * Between-screens loader: a paper sheet sweeps up, a document writes itself,
 * a highlighter marks one clause and a check stamps it, then the sheet sweeps
 * away. Stays mounted briefly after `visible` turns false so it can leave.
 */
export function TransitionLoader({ visible, message = 'Loading workspace...' }: Props) {
  const [mounted, setMounted] = useState(visible)
  const [prevVisible, setPrevVisible] = useState(visible)
  const [lastMessage, setLastMessage] = useState(message)

  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setMounted(true)
  }
  if (visible && message && message !== lastMessage) setLastMessage(message)

  useEffect(() => {
    if (visible || !mounted) return
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [visible, mounted])

  if (!mounted) return null

  return (
    <div className={`tl ${visible ? '' : 'is-leaving'}`} role="status" aria-live="polite" aria-busy={visible}>
      <div className="tl-sheet">
        <div className="tl-brand" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="18" height="18">
            <path d="M6 26C6 15 13 6 27 5c-1 13-9 21-21 21Z" fill="currentColor" />
          </svg>
          LexisGuide
        </div>

        <div className="tl-doc" aria-hidden="true">
          <span className="tl-doc-head" />
          <span className="tl-line" style={{ '--w': '92%', '--d': '0ms' } as React.CSSProperties} />
          <span className="tl-line" style={{ '--w': '78%', '--d': '70ms' } as React.CSSProperties} />
          <span className="tl-line tl-line-marked" style={{ '--w': '86%', '--d': '140ms' } as React.CSSProperties}><b /></span>
          <span className="tl-line" style={{ '--w': '64%', '--d': '210ms' } as React.CSSProperties} />
          <span className="tl-line" style={{ '--w': '72%', '--d': '280ms' } as React.CSSProperties} />
          <i className="tl-stamp">
            <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 8.5l3 3 6-7" /></svg>
          </i>
        </div>

        <p className="tl-msg">
          <span>{visible ? message : lastMessage}</span>
          <span className="tl-dots" aria-hidden="true"><i /><i /><i /></span>
        </p>
      </div>
    </div>
  )
}
