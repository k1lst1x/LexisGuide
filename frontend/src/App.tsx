import { useEffect, useState, useRef, useCallback } from 'react'
import AuthSectionOne from '@/components/ui/auth-section-1'
import { DashboardV2 } from './DashboardV2'
import { SplashScreen } from './SplashScreen'
import { TransitionLoader } from './TransitionLoader'
import { cognitoGetCurrentUser, cognitoSignOut } from './aws'

/* ───── Scroll reveal hook ───── */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  })
}

/* ───── 3D tilt hook ───── */
function useTilt(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const cards = el.querySelectorAll<HTMLElement>('.tilt-card')
    const handleMove = (e: MouseEvent) => {
      const card = e.currentTarget as HTMLElement
      const rect = card.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
      card.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-4px)`
    }
    const handleLeave = (e: MouseEvent) => {
      const card = e.currentTarget as HTMLElement
      card.style.transform = ''
    }

    cards.forEach((card) => {
      card.addEventListener('mousemove', handleMove)
      card.addEventListener('mouseleave', handleLeave)
    })
    return () => {
      cards.forEach((card) => {
        card.removeEventListener('mousemove', handleMove)
        card.removeEventListener('mouseleave', handleLeave)
      })
    }
  })
}

/* ───── Counter animation hook ───── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const start = Date.now()
          const duration = 1200
          const tick = () => {
            const pct = Math.min((Date.now() - start) / duration, 1)
            const eased = 1 - Math.pow(1 - pct, 3)
            setCount(Math.round(eased * target))
            if (pct < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target])

  return <span ref={ref}>{count}<sup className="plus-sup">{suffix}</sup></span>
}

/* ───── Click ripple ───── */
function addRipple(e: React.MouseEvent<HTMLElement>) {
  const btn = e.currentTarget
  const rect = btn.getBoundingClientRect()
  const ripple = document.createElement('span')
  ripple.className = 'click-ripple'
  ripple.style.left = `${e.clientX - rect.left}px`
  ripple.style.top = `${e.clientY - rect.top}px`
  btn.appendChild(ripple)
  setTimeout(() => ripple.remove(), 600)
}

/* ═════════════════════════════════════════════════════════════════
   APP
   ═════════════════════════════════════════════════════════════════ */
export function App() {
  const [splashDone, setSplashDone] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [dashOpen, setDashOpen] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionMsg, setTransitionMsg] = useState('')
  const [currentUser, setCurrentUser] = useState<{ email: string; username: string } | null>(null)
  const [toast, setToast] = useState('')
  const [heroOffset, setHeroOffset] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  useScrollReveal()
  useTilt(contentRef)

  // Check existing session on mount
  useEffect(() => {
    cognitoGetCurrentUser().then((user) => {
      if (user) {
        setCurrentUser({ email: user.email, username: user.username })
      }
    })
  }, [])

  // Parallax on scroll
  useEffect(() => {
    const handleScroll = () => setHeroOffset(window.scrollY * 0.35)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 3500)
      return () => clearTimeout(t)
    }
  }, [toast])

  const handleAuthSuccess = (email: string) => {
    setAuthOpen(false)
    setCurrentUser({ email, username: email })
    setToast(`✓ Authenticated as ${email} via AWS Cognito`)
  }

  const handleSignOut = async () => {
    await cognitoSignOut().catch(() => {})
    setCurrentUser(null)
    setDashOpen(false)
    setToast('Signed out of AWS session.')
  }

  const openDashboard = useCallback(() => {
    setTransitionMsg('Initializing Audit Workspace...')
    setTransitioning(true)
    setTimeout(() => {
      setDashOpen(true)
      setTransitioning(false)
    }, 1400)
  }, [])

  const closeDashboard = useCallback(() => {
    setTransitionMsg('Returning to LexisGuide...')
    setTransitioning(true)
    setDashOpen(false)
    setTimeout(() => setTransitioning(false), 800)
  }, [])

  /* ───── SPLASH ───── */
  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />
  }

  /* ───── AUTH PAGE ───── */
  if (authOpen) {
    return (
      <AuthSectionOne
        onSuccess={handleAuthSuccess}
        onCancel={() => setAuthOpen(false)}
      />
    )
  }

  /* ───── DASHBOARD ───── */
  if (dashOpen) {
    return (
      <>
        <DashboardV2 onClose={closeDashboard} userEmail={currentUser?.email} />
        <TransitionLoader visible={transitioning} message={transitionMsg} />
      </>
    )
  }

  /* ───── LANDING PAGE ───── */
  return (
    <div className="page-wrapper" ref={contentRef}>
      
      {/* 1. ENTIRE HERO SECTION WITH 4K LANDSCAPE BG */}
      <section className="hero-hero-section">
        <div className="hero-bg-wrapper">
          <img 
            src="/ghibli_hero_bg.jpg" 
            alt="Studio Ghibli Hero Landscape" 
            className="hero-bg-img" 
            style={{ transform: `translateY(${heroOffset}px) scale(1.08)` }}
          />
          <div className="hero-bg-overlay"></div>
        </div>
        
        <div className="hero-inner">
          {/* Header Nav */}
          <header className="header reveal" style={{ animationDelay: '0.1s' }}>
            <div className="brand">
              <span className="brand-name">LexisGuide</span>
            </div>
            
            <nav className="nav-links">
              <a href="#about" className="nav-item">About <span className="plus">+</span></a>
              <a href="#process" className="nav-item">Workflow <span className="plus">+</span></a>
              <button onClick={openDashboard} className="nav-item" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Open Dashboard <span className="plus">⚡</span>
              </button>
              <a href="#testimonial" className="nav-item">Review Chain <span className="plus">+</span></a>
              <a href="#testimonial" className="nav-item">Audit Impact</a>
            </nav>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button 
                onClick={openDashboard}
                onMouseDown={addRipple}
                className="ripple-btn"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(226,180,107,0.4)',
                  color: '#e2b46b',
                  padding: '7px 16px',
                  borderRadius: '18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                Launch Dashboard ⚡
              </button>

              {currentUser ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '13px', color: '#e2b46b', fontWeight: 600 }}>
                    {currentUser.email}
                  </span>
                  <button 
                    onClick={handleSignOut}
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#ffffff',
                      padding: '6px 14px',
                      borderRadius: '16px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setAuthOpen(true)}
                  onMouseDown={addRipple}
                  className="ripple-btn"
                  style={{
                    backgroundColor: '#e2b46b',
                    color: '#0b140f',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  Sign In ↗
                </button>
              )}

              <button className="menu-btn" aria-label="Toggle menu">
                <span className="menu-line"></span>
                <span className="menu-line"></span>
              </button>
            </div>
          </header>
          
          {/* Main Hero Title & Info */}
          <div className="hero-middle-grid">
            <div className="hero-title-container reveal" style={{ animationDelay: '0.3s' }}>
              <h1 className="hero-title">LexisGuide</h1>
            </div>
            
            <div className="hero-info reveal" style={{ animationDelay: '0.5s' }}>
              <div className="founders-row">
                <div className="avatar-group">
                  <div className="avatar avatar-1"></div>
                  <span className="avatar-divider"></span>
                  <div className="avatar avatar-2"></div>
                </div>
                <span className="tag-built">[ PROPOSAL · LEXHACK 2026 ]</span>
              </div>
              
              <p className="hero-description">
                Lighthouse for government documents — AI-powered clarity checks, procedural fairness analysis, and verifiable review trails for notices, denials, public forms, and shared agreements.
              </p>

              <button 
                onClick={openDashboard}
                onMouseDown={addRipple}
                className="ripple-btn"
                style={{
                  marginTop: '20px',
                  backgroundColor: '#e2b46b',
                  color: '#0b140f',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '24px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                Open Linter Dashboard ⚡
              </button>
            </div>
          </div>
          
          {/* Bottom Hero Brand Strip */}
          <div className="hero-bottom-bar reveal" style={{ animationDelay: '0.7s' }}>
            <p className="trusted-text">
              Trusted by 100+ legal aid advocates, civic tech pioneers, and public service leaders turning legalese into actionable clarity.
            </p>
            
            <div className="brand-strip">
              <div className="brand-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
                <span>CivicTech</span>
              </div>
              <div className="brand-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                <span>LegalAid</span>
              </div>
              <div className="brand-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="4"/></svg>
                <span>OpenGov</span>
              </div>
              <div className="brand-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
                <span>FairnessLinter</span>
              </div>
              <div className="brand-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span>LexHack</span>
              </div>
              <div className="brand-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3m11-12h-3M4 12H1m15.364-7.364l-2.121 2.121M7.757 16.243l-2.121 2.121m12.728 0l-2.121-2.121M7.757 7.757L5.636 5.636"/></svg>
                <span>ReviewChain</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Rest of content inside container */}
      <div className="content-container">
        
        {/* 2. ABOUT SECTION */}
        <section id="about" className="about-section">
          <div className="about-header reveal">
            <span className="section-tag">// ABOUT LEXISGUIDE</span>
            <div className="about-statement-container">
              <h2 className="about-statement">
                We believe public notices and shared agreements must not require a lawyer just to understand the next step, but <span className="highlight">/ through procedural fairness</span> — quietly bringing clarity, evidence-linked findings, and verifiable review trails.
              </h2>
            </div>
          </div>
          
          <div className="stats-grid">
            {/* Card 1 */}
            <div className="stat-card card-white tilt-card reveal" style={{ animationDelay: '0.1s' }}>
              <div className="team-avatar-grid">
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '0% 0%' }}></div>
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '25% 0%' }}></div>
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '50% 0%' }}></div>
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '75% 0%' }}></div>
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '100% 0%' }}></div>
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '15% 50%' }}></div>
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '45% 50%' }}></div>
                <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '75% 50%' }}></div>
              </div>
              <div className="stat-bottom">
                <span className="stat-label">Audited Document Types</span>
                <span className="stat-number"><AnimatedCounter target={48} suffix="+" /></span>
              </div>
            </div>
            
            {/* Card 2 */}
            <div className="stat-card card-dark tilt-card reveal" style={{ animationDelay: '0.2s' }}>
              <div className="card-header-row">
                <span className="stat-label-light">LexHack Recognition</span>
                <div className="award-seal">
                  <svg width="44" height="44" viewBox="0 0 100 100" fill="currentColor">
                    <path d="M50 10 A40 40 0 1 0 50 90 A40 40 0 1 0 50 10 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 2"/>
                    <text x="50" y="48" fontSize="9" textAnchor="middle" fill="currentColor" fontWeight="bold">LEXHACK 2026</text>
                    <text x="50" y="60" fontSize="7.5" textAnchor="middle" fill="currentColor">BEST CIVIC TECH</text>
                  </svg>
                </div>
              </div>
              <div className="stat-number-large"><AnimatedCounter target={12} suffix="+" /></div>
              <p className="stat-description">Featured and celebrated for procedural fairness, evidence spans, and human-in-the-loop decision support.</p>
            </div>
            
            {/* Card 3 */}
            <div className="stat-card card-soft tilt-card reveal" style={{ animationDelay: '0.3s' }}>
              <p className="stat-top-text">From ambiguous benefit denials to complex lease agreements, every notice is audited for clarity and due process.</p>
              <div className="stat-bottom">
                <span className="stat-label">Fairness Score Jump (v1 → v4)</span>
                <span className="stat-number"><AnimatedCounter target={89} suffix="/100" /></span>
              </div>
            </div>
            
            {/* Card 4 */}
            <div className="stat-card card-landscape tilt-card reveal" style={{ animationDelay: '0.4s' }}>
              <span className="stat-label-light">Jurisdictions & Rule Packs</span>
              <div className="stat-number-large"><AnimatedCounter target={14} suffix="+" /></div>
              <p className="stat-description-light">Collaborating remotely with civic tech teams and public advocates nationwide.</p>
            </div>
          </div>
        </section>
        
        {/* 3. PROCESS SECTION */}
        <section id="process" className="process-section">
          <div className="section-top-grid reveal">
            <div className="left-col">
              <span className="section-tag">// CORE WORKFLOW</span>
              <h2 className="section-heading">Our Process Moves<br />Like Production.</h2>
            </div>
            <div className="right-col">
              <p className="section-intro">
                One upload, two outputs: a procedural fairness audit and a practical next-step guide. Every flagged issue links back to exact document evidence and the rule that triggered it.
              </p>
            </div>
          </div>
          
          <div className="process-grid">
            {[
              { header: 'Upload & Extract', num: '01', title: 'Extract', desc: 'Parses PDFs, letters, screenshots, or public web notices to extract issuing agency, decisions, filing dates, and appeal rights.' },
              { header: 'Procedural Lint', num: '02', title: 'Lint', desc: 'Executes rule-based and AI checks to spot vague deadlines, missing appeal paths, and contradictory instructions.' },
              { header: 'Plain-Language Guide', num: '03', title: 'Guide', desc: 'Translates legalese into plain-language next steps: what happened, what to do, by when, and consequences of doing nothing.' },
              { header: 'Verifiable Review Chain', num: '04', title: 'Chain', desc: 'Generates SHA-256 hashes, rule-set versioning, and evidence spans to record an auditable provenance trail from v1 to v2.' },
            ].map((step, i) => (
              <div
                key={step.num}
                className="process-card tilt-card reveal"
                style={{ animationDelay: `${0.1 + i * 0.12}s`, cursor: 'pointer' }}
                onClick={openDashboard}
                onMouseDown={addRipple}
              >
                <div className="process-header">{step.header}</div>
                <div className="process-body">
                  <div className="step-num">{step.num}</div>
                  <h3 className="process-title">{step.title}</h3>
                  <p className="process-desc">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        
        {/* 4. TESTIMONIALS SECTION */}
        <section id="testimonial" className="testimonials-section">
          <div className="section-top-grid reveal">
            <div className="left-col">
              <span className="section-tag">// AUDIT & IMPACT</span>
              <h2 className="section-heading">Voices Between Frames</h2>
            </div>
            <div className="right-col">
              <p className="section-intro">
                Behind every notice is a resident seeking clarity. LexisGuide bridges the gap between legal validity and real-world usability for applicants, advocates, and public agencies.
              </p>
            </div>
          </div>
          
          <div className="testimonials-grid">
            {/* Featured Rating Card */}
            <div className="testimonial-card rating-card tilt-card reveal" style={{ animationDelay: '0.1s' }}>
              <div className="rating-top">
                <div className="big-score"><AnimatedCounter target={89} suffix="" /><span className="score-denom">/ 100</span></div>
                <div className="laurel-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2l2.4 5 5.6.8-4 4 1 5.6-5-2.6-5 2.6 1-5.6-4-4 5.6-.8z"/>
                  </svg>
                </div>
              </div>
              
              <p className="rating-text">
                Audited across procedural clarity, due process, filing deadlines, and plain language. Every finding links to exact document evidence.
              </p>
              
              <div className="rating-footer">
                <div className="reviews-avatar-row">
                  <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '0% 50%' }}></div>
                  <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '50% 50%' }}></div>
                  <div className="mini-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '100% 50%' }}></div>
                  <span className="reviews-count">100+ Audits Completed</span>
                </div>
                <button className="share-btn" onClick={openDashboard} onMouseDown={addRipple}>Open Live Dashboard ⚡</button>
              </div>
            </div>
            
            {/* Review Card 1 */}
            <div className="testimonial-card review-card tilt-card reveal" style={{ animationDelay: '0.2s' }}>
              <div className="quote-mark">"</div>
              <p className="review-text">LexisGuide didn't just highlight vague appeal paths. It gave our case workers an evidence-linked audit in seconds.</p>
              <div className="review-footer">
                <div className="reviewer-info">
                  <div className="reviewer-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '20% 50%' }}></div>
                  <div>
                    <h4 className="reviewer-name">Elena Moritz</h4>
                    <p className="reviewer-role">Legal Aid Director</p>
                  </div>
                </div>
                <div className="review-meta">
                  <span className="stars">★★★★★</span>
                  <span className="project-tag">Notice Audit, Evidence-Linked</span>
                </div>
              </div>
            </div>
            
            {/* Review Card 2 */}
            <div className="testimonial-card review-card tilt-card reveal" style={{ animationDelay: '0.3s' }}>
              <div className="reviewer-top-row">
                <div className="reviewer-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '70% 50%' }}></div>
                <div>
                  <h4 className="reviewer-name">Kai Nakamura</h4>
                  <p className="reviewer-role">Civic Tech Fellow</p>
                </div>
              </div>
              <div className="quote-mark">"</div>
              <p className="review-text">Working with LexisGuide felt less like reading dry statutes and more like following a clear, auditable checklist together.</p>
              <div className="review-footer">
                <div className="review-meta">
                  <span className="stars">★★★★★</span>
                  <span className="project-tag">Procedural Fairness, SHA-256</span>
                </div>
              </div>
            </div>
            
            {/* Review Card 3 */}
            <div className="testimonial-card review-card tilt-card reveal" style={{ animationDelay: '0.4s' }}>
              <div className="quote-mark">"</div>
              <p className="review-text">The review chain tracks every edit from v1 to v2. Our agency reduced deadline inquiries by 40% before publication.</p>
              <div className="review-footer">
                <div className="reviewer-info">
                  <div className="reviewer-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '90% 50%' }}></div>
                  <div>
                    <h4 className="reviewer-name">Marcus Vane</h4>
                    <p className="reviewer-role">Public Service Lead</p>
                  </div>
                </div>
                <div className="review-meta">
                  <span className="stars">★★★★★</span>
                  <span className="project-tag">Shared Workspace, Version Chain</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Bottom Section Brand Strip */}
          <div className="testimonials-brand-strip reveal">
            <span className="t-brand">CivicTech</span>
            <span className="t-brand">LegalAid</span>
            <span className="t-brand">OpenGov</span>
            <span className="t-brand">FairnessLinter</span>
            <span className="t-brand">LexHack</span>
            <span className="t-brand">ReviewChain</span>
            <span className="t-brand">DueProcess</span>
          </div>
        </section>
        
      </div>
      
      {/* 5. FOOTER SECTION */}
      <footer className="footer reveal">
        <div className="footer-header">
          <h2 className="footer-logo">LexisGuide</h2>
          <span className="footer-year">© 20 - 26°</span>
        </div>
        
        <div className="footer-middle">
          <div className="footer-col main-col">
            <p className="footer-tagline">For civic leaders, legal aid advocates, and public services ready to make due process understandable, reviewable, and verifiable.</p>
            <a href="mailto:hello@lexisguide.gov" className="footer-email">hello@lexisguide.gov</a>
          </div>
          
          <div className="footer-col">
            <h4 className="col-title">NAVIGATION</h4>
            <a href="#about">About</a>
            <a href="#process">Workflow</a>
            <a href="#process">Linter</a>
            <a href="#testimonial">Review Chain</a>
            <a href="#testimonial">Audit Impact</a>
          </div>
          
          <div className="footer-col">
            <h4 className="col-title">MODULES</h4>
            <button onClick={openDashboard} style={{ background: 'none', border: 'none', color: '#9ab0a0', textAlign: 'left', cursor: 'pointer', fontSize: '14px' }}>Procedural Linter ⚡</button>
            <button onClick={openDashboard} style={{ background: 'none', border: 'none', color: '#9ab0a0', textAlign: 'left', cursor: 'pointer', fontSize: '14px' }}>Verifiable Chain ⚡</button>
            <button onClick={openDashboard} style={{ background: 'none', border: 'none', color: '#9ab0a0', textAlign: 'left', cursor: 'pointer', fontSize: '14px' }}>Shared Workspace ⚡</button>
          </div>
          
          <div className="footer-col">
            <h4 className="col-title">SOCIAL MEDIA</h4>
            <div className="social-icons">
              <a href="#" aria-label="Dribbble" className="social-btn">🏀</a>
              <a href="#" aria-label="Twitter" className="social-btn">🌐</a>
              <a href="#" aria-label="GitHub" className="social-btn">💻</a>
              <a href="#" aria-label="LinkedIn" className="social-btn">💼</a>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="contact-info">
            <div className="info-block">
              <span className="info-label">PHONE NUMBER</span>
              <span className="info-val">+01 (555) 019-2834</span>
            </div>
            <div className="info-block">
              <span className="info-label">HEADQUARTERS</span>
              <span className="info-val">CIVIC TECH HUB, LEXHACK 2026, WASHINGTON DC</span>
            </div>
            <div className="info-block">
              <span className="info-label">DISCLAIMER</span>
              <span className="info-val">DECISION SUPPORT — NOT LEGAL ADVICE</span>
            </div>
          </div>
          
          <div className="footer-legal">
            <span className="copyright">© 2026 LexisGuide Inc. All rights reserved.</span>
            <div className="legal-links">
              <a href="#">Terms & Condition</a>
              <a href="#">Privacy Policy</a>
              <a href="#" className="back-to-top" aria-label="Back to top">↑</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast */}
      {toast && (
        <div className="toast-notification">
          {toast}
        </div>
      )}

      {/* Transition Loader */}
      <TransitionLoader visible={transitioning} message={transitionMsg} />
    </div>
  )
}

export default App
