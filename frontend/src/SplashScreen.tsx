import { useEffect, useState } from 'react'

type Props = { onComplete: () => void }

export function SplashScreen({ onComplete }: Props) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true)
      setTimeout(onComplete, 600)
    }, 2200)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div className={`splash-screen ${exiting ? 'splash-exit' : ''}`}>
      {/* Ambient glow */}
      <div className="splash-glow splash-glow-1" />
      <div className="splash-glow splash-glow-2" />

      {/* Big animated dots */}
      <div className="splash-dots-container">
        <span className="splash-big-dot" style={{ animationDelay: '0s' }}>.</span>
        <span className="splash-big-dot" style={{ animationDelay: '0.3s' }}>.</span>
        <span className="splash-big-dot" style={{ animationDelay: '0.6s' }}>.</span>
      </div>
    </div>
  )
}
