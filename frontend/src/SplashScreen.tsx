import { useEffect, useRef, useState, useCallback } from 'react'

type Props = { onComplete: () => void }

const GLITCH_CHARS = '!<>-_\\/[]{}—=+*^?#'
const BRAND_TEXT = 'LEXISGUIDE'

function useGlitchReveal(text: string, startDelay = 200) {
  const [displayed, setDisplayed] = useState('')
  const [phase, setPhase] = useState<'waiting' | 'glitching' | 'done'>('waiting')

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    let interval: ReturnType<typeof setInterval>
    let iteration = 0

    timeout = setTimeout(() => {
      setPhase('glitching')
      interval = setInterval(() => {
        setDisplayed(
          text
            .split('')
            .map((char, idx) => {
              if (char === ' ') return ' '
              if (idx < Math.floor(iteration / 2)) return char
              return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
            })
            .join('')
        )
        if (iteration >= text.length * 2) {
          clearInterval(interval)
          setDisplayed(text)
          setPhase('done')
        }
        iteration += 0.7
      }, 40)
    }, startDelay)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [text, startDelay])

  return { displayed, phase }
}

export function SplashScreen({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('Initializing...')
  const { displayed: glitchBrand, phase: glitchPhase } = useGlitchReveal(BRAND_TEXT, 300)

  // ── CANVAS: fluid particle web + morphing blobs ──────────────────
  const animateCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let t = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Particles
    type Particle = {
      x: number; y: number; vx: number; vy: number
      radius: number; alpha: number; hue: number
    }
    const W = () => canvas.width
    const H = () => canvas.height

    const particles: Particle[] = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      radius: Math.random() * 2.5 + 0.5,
      alpha: Math.random() * 0.6 + 0.1,
      hue: Math.random() * 30 + 15, // orange hue range
    }))

    const draw = () => {
      t += 0.012
      ctx.clearRect(0, 0, W(), H())

      // ── Morphing ambient blobs (background) ──
      const blobData = [
        { x: W() * 0.25, y: H() * 0.3, r: 320, c1: 'rgba(249,115,22,0.13)', c2: 'rgba(255,107,0,0)' },
        { x: W() * 0.75, y: H() * 0.65, r: 280, c1: 'rgba(234,88,12,0.1)', c2: 'rgba(255,107,0,0)' },
        { x: W() * 0.5, y: H() * 0.5, r: 240, c1: 'rgba(249,115,22,0.06)', c2: 'rgba(255,255,255,0)' },
      ]
      blobData.forEach((b, i) => {
        const bx = b.x + Math.sin(t + i * 1.3) * 60
        const by = b.y + Math.cos(t * 0.7 + i * 0.9) * 45
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, b.r * (1 + Math.sin(t + i) * 0.15))
        grad.addColorStop(0, b.c1)
        grad.addColorStop(1, b.c2)
        ctx.beginPath()
        ctx.ellipse(bx, by, b.r * (1 + Math.sin(t * 0.6 + i) * 0.1), b.r * (1 + Math.cos(t * 0.4 + i) * 0.1), t * 0.2 + i, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      })

      // ── Subtle grid ──
      ctx.strokeStyle = 'rgba(249,115,22,0.04)'
      ctx.lineWidth = 1
      const gridSize = 48
      for (let x = 0; x < W(); x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H()); ctx.stroke()
      }
      for (let y = 0; y < H(); y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W(), y); ctx.stroke()
      }

      // ── Particles & connections ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > W()) p.vx *= -1
        if (p.y < 0 || p.y > H()) p.vy *= -1

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x, dy = p.y - q.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.strokeStyle = `rgba(249,115,22,${0.18 * (1 - dist / 120)})`
            ctx.lineWidth = 0.7
            ctx.stroke()
          }
        }

        // Draw particle with inner glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3)
        gradient.addColorStop(0, `hsla(${p.hue}, 95%, 55%, ${p.alpha})`)
        gradient.addColorStop(1, `hsla(${p.hue}, 95%, 55%, 0)`)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${p.alpha + 0.3})`
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    const cleanup = animateCanvas()
    return cleanup
  }, [animateCanvas])

  // ── Progress & lifecycle ─────────────────────────────────────────
  useEffect(() => {
    const TOTAL = 2200 // 2.2 seconds total splash
    const MESSAGES = [
      'Initializing audit engine...',
      'Loading procedural modules...',
      'Validating authentication...',
      'System ready — launching...',
    ]
    const start = Date.now()

    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.min(100, Math.round((elapsed / TOTAL) * 100))
      setProgress(pct)

      if (pct < 28) setStatusMsg(MESSAGES[0])
      else if (pct < 58) setStatusMsg(MESSAGES[1])
      else if (pct < 85) setStatusMsg(MESSAGES[2])
      else setStatusMsg(MESSAGES[3])

      if (pct >= 100) {
        clearInterval(interval)
        setTimeout(() => {
          setExiting(true)
          setTimeout(onComplete, 600)
        }, 200)
      }
    }, 16)

    return () => clearInterval(interval)
  }, [onComplete])

  const circumference = 2 * Math.PI * 48

  return (
    <div className={`splash-root${exiting ? ' splash-exit' : ''}`}>
      {/* Full canvas layer */}
      <canvas ref={canvasRef} className="splash-canvas" />

      {/* Central stage */}
      <div className="splash-center-stage">

        {/* Outer halo rings */}
        <div className="splash-halo halo-a" />
        <div className="splash-halo halo-b" />
        <div className="splash-halo halo-c" />

        {/* SVG Progress Ring */}
        <div className="splash-ring-wrap">
          <svg width="120" height="120" viewBox="0 0 120 120" className="splash-progress-svg">
            {/* Track */}
            <circle
              cx="60" cy="60" r="48"
              fill="none"
              stroke="rgba(249,115,22,0.12)"
              strokeWidth="3"
            />
            {/* Progress arc */}
            <circle
              cx="60" cy="60" r="48"
              fill="none"
              stroke="url(#progressGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress / 100)}
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 0.08s linear' }}
            />
            <defs>
              <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff6b00" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center logo mark */}
          <div className="splash-logo-mark">
            <div className="splash-logo-inner">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M8 6h12l4 4-4 4H8V6z" fill="url(#logoGrad)" opacity="0.9"/>
                <path d="M8 16h8l4 4-4 4H8v-8z" fill="url(#logoGrad)" opacity="0.65"/>
                <defs>
                  <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#ff6b00"/>
                    <stop offset="1" stopColor="#f97316"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="splash-pct-badge">{progress}%</div>
          </div>
        </div>

        {/* Brand name with glitch reveal */}
        <div className={`splash-brand-name${glitchPhase === 'done' ? ' brand-settled' : ' brand-glitching'}`}>
          {glitchBrand || '          '}
        </div>

        {/* Animated word reveal tagline */}
        <div className="splash-tagline">
          <span className="tagline-word" style={{ animationDelay: '0.6s' }}>Procedural</span>
          <span className="tagline-word" style={{ animationDelay: '0.75s' }}>Fairness</span>
          <span className="tagline-word" style={{ animationDelay: '0.9s' }}>Engine</span>
        </div>

        {/* Status terminal */}
        <div className="splash-terminal">
          <span className="terminal-prompt">›</span>
          <span className="terminal-msg">{statusMsg}</span>
          <span className="terminal-cursor" />
        </div>

        {/* Bottom flat progress bar */}
        <div className="splash-bar-track">
          <div className="splash-bar-fill" style={{ width: `${progress}%` }}>
            <div className="splash-bar-shine" />
          </div>
        </div>
      </div>
    </div>
  )
}
