import { useEffect, useState } from 'react'

type Props = { onComplete: () => void }

export function SplashScreen({ onComplete }: Props) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // 1 second total duration: 600ms display + 400ms exit transition
    const timer = setTimeout(() => {
      setExiting(true)
      setTimeout(onComplete, 400)
    }, 600)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div className={`splash-screen ${exiting ? 'splash-exit' : ''}`}>
      {/* Dynamic ambient orange glows */}
      <div className="splash-glow splash-glow-orange-1" />
      <div className="splash-glow splash-glow-orange-2" />

      {/* Center glowing orb behind dots */}
      <div className="splash-center-orb" />

      {/* Animated big dots with orange gradient text */}
      <div className="splash-content">
        <div className="splash-dots-container">
          <span className="splash-big-dot splash-dot-1">.</span>
          <span className="splash-big-dot splash-dot-2">.</span>
          <span className="splash-big-dot splash-dot-3">.</span>
        </div>
        <div className="splash-sparkle-ring" />
      </div>
    </div>
  )
}
