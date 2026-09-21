import { useEffect, useState } from 'react'

type Props = { onComplete: () => void }

/** A short, truthful transition shown only while the app establishes a session. */
export function SplashScreen({ onComplete }: Props) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const completeTimer = window.setTimeout(() => setReady(true), 420)
    const exitTimer = window.setTimeout(onComplete, 620)
    return () => {
      window.clearTimeout(completeTimer)
      window.clearTimeout(exitTimer)
    }
  }, [onComplete])

  return <main className={`splash-root splash-quiet${ready ? ' splash-ready' : ''}`} aria-live="polite" aria-label="Preparing LexisGuide">
    <section className="splash-quiet-card">
      <div className="splash-document-mark" aria-hidden="true"><i /><i /><i /></div>
      <div>
        <strong>LexisGuide</strong>
        <p>{ready ? 'Workspace ready' : 'Preparing secure workspace'}</p>
      </div>
      <div className="splash-evidence-state" aria-hidden="true"><span /><span /><span /></div>
    </section>
  </main>
}
