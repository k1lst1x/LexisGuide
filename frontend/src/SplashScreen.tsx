import { useEffect, useRef, useState } from 'react'

type Props = { onComplete: () => void }

const LOG_MESSAGES = [
  'Initializing LexisGuide Procedural Linter v2.4...',
  'Loading SHA-256 Audit Provenance & Review Trail...',
  'Validating AWS Cognito Authentication State...',
  'System Ready — Launching Workspace...'
]

export function SplashScreen({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logIndex, setLogIndex] = useState(0)

  // Canvas particle mesh effect
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // Particles array
    const particles = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.5 + 0.2
    }))

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      // Draw particle connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 140) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(249, 115, 22, ${0.15 * (1 - dist / 140)})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }

      // Draw and update particles
      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0 || p.x > width) p.vx *= -1
        if (p.y < 0 || p.y > height) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(249, 115, 22, ${p.alpha})`
        ctx.fill()
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  // Progress counter and phase transition
  useEffect(() => {
    const startTime = Date.now()
    const duration = 1200 // 1.2s screen load

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100))
      setProgress(pct)

      if (pct < 30) setLogIndex(0)
      else if (pct < 60) setLogIndex(1)
      else if (pct < 85) setLogIndex(2)
      else setLogIndex(3)

      if (pct >= 100) {
        clearInterval(interval)
        setTimeout(() => {
          setExiting(true)
          setTimeout(onComplete, 450)
        }, 150)
      }
    }, 20)

    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <div className={`dedicated-loading-screen ${exiting ? 'splash-exit' : ''}`}>
      {/* 3D Particle Canvas Background */}
      <canvas ref={canvasRef} className="splash-canvas" />

      {/* Ambient Radial Lighting */}
      <div className="splash-ambient-orb orb-1" />
      <div className="splash-ambient-orb orb-2" />
      <div className="splash-grid-overlay" />

      {/* Central Loading Hero Stage */}
      <div className="splash-hero-stage">
        {/* Dual Rotating Orbit Rings */}
        <div className="splash-orbit-ring ring-outer" />
        <div className="splash-orbit-ring ring-inner" />

        {/* Big Bold Animated Dots (...) */}
        <div className="splash-dots-wrapper">
          <span className="splash-dot dot-1">.</span>
          <span className="splash-dot dot-2">.</span>
          <span className="splash-dot dot-3">.</span>
        </div>

        {/* Brand Name Typography Reveal */}
        <div className="splash-brand-title">
          LEXISGUIDE
          <div className="splash-brand-shimmer" />
        </div>

        {/* System Diagnostic Status & Progress */}
        <div className="splash-status-box">
          <div className="splash-status-header">
            <span className="splash-status-dot" />
            <span className="splash-status-text">{LOG_MESSAGES[logIndex]}</span>
            <span className="splash-pct-num">{progress}%</span>
          </div>

          <div className="splash-progress-track">
            <div className="splash-progress-bar" style={{ width: `${progress}%` }} />
            <div className="splash-progress-glow" style={{ left: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
