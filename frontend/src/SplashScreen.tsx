import { useEffect, useState } from 'react'

type Props = { onComplete: () => void }

export function SplashScreen({ onComplete }: Props) {
  const [progress, setProgress] = useState(0)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const start = Date.now()
    const duration = 1800
    let raf: number

    const tick = () => {
      const elapsed = Date.now() - start
      const pct = Math.min(elapsed / duration, 1)
      // ease-out-quart for smooth progress feel
      const eased = 1 - Math.pow(1 - pct, 4)
      setProgress(eased * 100)

      if (pct < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        setExiting(true)
        setTimeout(onComplete, 600)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onComplete])

  const letters = 'LexisGuide'.split('')

  return (
    <div className={`splash-screen ${exiting ? 'splash-exit' : ''}`}>
      {/* Orbital ring particles */}
      <div className="splash-orbit">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="orbit-dot"
            style={{
              '--dot-index': i,
              '--dot-total': 12,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Animated logo */}
      <div className="splash-logo-container">
        <h1 className="splash-logo">
          {letters.map((ch, i) => (
            <span
              key={i}
              className="splash-letter"
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              {ch}
            </span>
          ))}
          <span className="splash-reg" style={{ animationDelay: `${letters.length * 0.07}s` }}>®</span>
        </h1>
        <p className="splash-tagline">Lighthouse for Government Documents</p>
      </div>

      {/* Progress bar */}
      <div className="splash-progress-track">
        <div
          className="splash-progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Ambient glow */}
      <div className="splash-glow splash-glow-1" />
      <div className="splash-glow splash-glow-2" />
    </div>
  )
}
