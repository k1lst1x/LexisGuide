import { useEffect, useRef, useState } from 'react'
import meadowBg from '@/assets/meadow_bg.webp'
import './loaders.css'

type Props = {
  /** Called when the splash starts lifting, so the page beneath can mount and animate in. */
  onReveal?: () => void
  /** Called once the splash has fully faded out. */
  onComplete: () => void
  /** The app's own startup work (session restore). The splash waits for it. */
  ready?: boolean
}

const SEEN_KEY = 'lexisguide:splash-seen'
const BRAND = 'LexisGuide'
const MAX_WAIT_MS = 6000
const EXIT_MS = 950

const STAGES = [
  { at: 0, text: 'Unfolding the paperwork' },
  { at: 0.3, text: 'Painting the meadow' },
  { at: 0.7, text: 'Setting the type' },
  { at: 0.97, text: 'Ready when you are' },
]

function seenThisSession() {
  try { return window.sessionStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}

/*
 * Real startup work, weighted: the hero painting (the heaviest asset),
 * the web fonts, and the app's session check. Progress never runs ahead
 * of the work, and never runs ahead of a short minimum so the intro can breathe.
 */
export function SplashScreen({ onReveal, onComplete, ready = true }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [canSkip, setCanSkip] = useState(false)
  const [returning] = useState(seenThisSession)
  const readyRef = useRef(ready)
  const skipRef = useRef(false)

  const revealRef = useRef(onReveal)
  const completeRef = useRef(onComplete)
  useEffect(() => {
    readyRef.current = ready
    revealRef.current = onReveal
    completeRef.current = onComplete
  }, [ready, onReveal, onComplete])

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    const minMs = returning || reduceMotion ? 900 : 2600
    const done = { image: false, fonts: false }

    const image = new Image()
    image.decoding = 'async'
    const markImage = () => { done.image = true }
    image.onload = () => { (image.decode?.() ?? Promise.resolve()).catch(() => {}).finally(markImage) }
    image.onerror = markImage
    image.src = meadowBg

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fonts?.ready) fonts.ready.then(() => { done.fonts = true }, () => { done.fonts = true })
    else done.fonts = true

    const start = performance.now()
    let shown = 0
    let lastStage = 0
    let raf = 0
    let finished = false
    let exitTimer = 0

    const finish = () => {
      if (finished) return
      finished = true
      try { window.sessionStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
      setLeaving(true)
      revealRef.current?.()
      exitTimer = window.setTimeout(() => completeRef.current(), reduceMotion ? 200 : EXIT_MS)
    }

    const tick = (now: number) => {
      const elapsed = now - start
      const work = (done.image ? 0.5 : 0) + (done.fonts ? 0.25 : 0) + (readyRef.current ? 0.25 : 0)
      const timeFloor = Math.min(1, elapsed / minMs)
      const target = elapsed > MAX_WAIT_MS || skipRef.current ? 1 : Math.min(work, timeFloor)
      // Ease toward the target so real progress feels continuous, not steppy.
      shown += (target - shown) * (skipRef.current ? 0.3 : 0.075)
      if (target - shown < 0.004) shown = target
      rootRef.current?.style.setProperty('--p', shown.toFixed(4))

      const nextStage = STAGES.reduce((acc, item, index) => (shown >= item.at ? index : acc), 0)
      if (nextStage !== lastStage) { lastStage = nextStage; setStage(nextStage) }

      if (shown >= 1) { finish(); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const skipTimer = window.setTimeout(() => setCanSkip(true), 1600)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(skipTimer)
      window.clearTimeout(exitTimer)
      image.onload = null
      image.onerror = null
    }
  }, [returning])

  useEffect(() => {
    const skip = () => { skipRef.current = true }
    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [])

  return (
    <div
      ref={rootRef}
      className={`sp ${leaving ? 'is-leaving' : ''} ${returning ? 'is-quick' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading LexisGuide. ${STAGES[stage].text}`}
      onClick={() => { skipRef.current = true }}
    >
      <div className="sp-glow" aria-hidden="true" />
      <div className="sp-meadow" aria-hidden="true">
        <img src={meadowBg} alt="" />
      </div>
      <div className="sp-motes" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${8 + ((i * 37) % 84)}%`, animationDelay: `${-i * 1.7}s`, animationDuration: `${16 + (i % 5) * 3}s` }} />)}
      </div>
      <svg className="sp-bird" viewBox="0 0 24 10" width="20" height="9" aria-hidden="true">
        <path d="M1 6 Q6 1 12 6 Q18 1 23 6" />
      </svg>

      <div className="sp-center">
        <svg className="sp-mark" viewBox="0 0 32 32" width="64" height="64" aria-hidden="true">
          <path className="sp-leaf-fill" d="M6 26C6 15 13 6 27 5c-1 13-9 21-21 21Z" />
          <path className="sp-leaf-line" pathLength={1} d="M6 26C6 15 13 6 27 5c-1 13-9 21-21 21Z" />
          <path className="sp-leaf-vein" pathLength={1} d="M9 23c4-5 8-9 14-13" />
        </svg>
        <h1 className="sp-word" aria-hidden="true">
          {BRAND.split('').map((char, i) => <span key={i} style={{ animationDelay: `${(returning ? 150 : 700) + i * 45}ms` }}>{char}</span>)}
        </h1>
        <p className="sp-tag">Legal documents, in plain language</p>
        <div className="sp-meter">
          <div className="sp-progress" aria-hidden="true"><i /></div>
          <p className="sp-stage" key={stage}>{STAGES[stage].text}</p>
        </div>
      </div>

      <p className={`sp-skip ${canSkip && !leaving ? 'is-in' : ''}`} aria-hidden="true">Click or press any key to skip</p>
    </div>
  )
}
