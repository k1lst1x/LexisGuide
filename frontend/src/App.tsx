import { useEffect, useState, useRef, useCallback } from 'react'
import AuthSectionOne from '@/components/ui/auth-section-1'
import { DashboardV2 } from './DashboardV2'
import { SplashScreen } from './SplashScreen'
import { TransitionLoader } from './TransitionLoader'
import { cognitoGetCurrentUser, cognitoSignOut } from './aws'
import littlebirdTreesBg from '@/assets/littlebird_trees_bg.png'

const WORKSPACE_KEY = 'lexisguide:workspace'
const WORKSPACE_USER_KEY = 'lexisguide:workspace-user'

function readWorkspaceUser() {
  try {
    const value = window.localStorage.getItem(WORKSPACE_USER_KEY)
    if (!value) return null
    const user = JSON.parse(value) as { email?: unknown; username?: unknown }
    return typeof user.email === 'string' && typeof user.username === 'string' ? { email: user.email, username: user.username } : null
  } catch {
    return null
  }
}

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
  const [sessionReady, setSessionReady] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionMsg, setTransitionMsg] = useState('')
  const [currentUser, setCurrentUser] = useState<{ email: string; username: string } | null>(null)
  const [toast, setToast] = useState('')
  const [demoTab, setDemoTab] = useState<'linter' | 'audit' | 'guide' | 'chain'>('linter')
  const contentRef = useRef<HTMLDivElement>(null)

  useScrollReveal()
  useTilt(contentRef)

  // Check existing session on mount
  useEffect(() => {
    let mounted = true
    const wantsWorkspace = window.location.pathname.endsWith('/dashboard') || window.location.hash === '#dashboard' || window.localStorage.getItem(WORKSPACE_KEY) === 'open'
    const savedUser = readWorkspaceUser()
    cognitoGetCurrentUser()
      .then((user) => {
        if (!mounted) return
        if (user) {
          const restoredUser = { email: user.email, username: user.username }
          setCurrentUser(restoredUser)
          window.localStorage.setItem(WORKSPACE_USER_KEY, JSON.stringify(restoredUser))
          if (window.localStorage.getItem(WORKSPACE_KEY) !== 'closed') setDashOpen(true)
        } else if (savedUser) {
          setCurrentUser(savedUser)
        }
        if (!user && wantsWorkspace) setDashOpen(true)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setSessionReady(true)
      })
    return () => { mounted = false }
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
    setDashOpen(true)
    window.localStorage.setItem(WORKSPACE_KEY, 'open')
    window.localStorage.setItem(WORKSPACE_USER_KEY, JSON.stringify({ email, username: email }))
    setToast(`✓ Authenticated as ${email} via AWS Cognito`)
  }

  const handleSignOut = async () => {
    await cognitoSignOut().catch(() => {})
    setCurrentUser(null)
    setDashOpen(false)
    window.localStorage.removeItem(WORKSPACE_KEY)
    window.localStorage.removeItem(WORKSPACE_USER_KEY)
    window.localStorage.removeItem('lexisguide:last-section')
    setToast('Signed out of AWS session.')
  }

  const openDashboard = useCallback(() => {
    window.localStorage.setItem(WORKSPACE_KEY, 'open')
    setTransitionMsg('Initializing Audit Workspace...')
    setTransitioning(true)
    setTimeout(() => {
      setDashOpen(true)
      setTransitioning(false)
    }, 1400)
  }, [])

  const closeDashboard = useCallback(() => {
    window.localStorage.setItem(WORKSPACE_KEY, 'closed')
    setTransitionMsg('Returning to LexisGuide...')
    setTransitioning(true)
    setDashOpen(false)
    setTimeout(() => setTransitioning(false), 800)
  }, [])

  /* ───── SPLASH ───── */
  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />
  }

  if (!sessionReady) {
    return <TransitionLoader visible message="Restoring your workspace..." />
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
        <DashboardV2 onClose={closeDashboard} onSignOut={handleSignOut} userEmail={currentUser?.email} />
        <TransitionLoader visible={transitioning} message={transitionMsg} />
      </>
    )
  }

  /* ───── LANDING PAGE (LITTLEBIRD-INSPIRED) ───── */
  return (
    <div className="lb-page-wrapper" ref={contentRef}>
      
      {/* 1. STICKY NAVBAR */}
      <header className="lb-navbar">
        <div className="lb-nav-left">
          <a href="#" className="lb-nav-logo">
            LexisGuide
            <span className="lb-logo-badge">✦</span>
          </a>
        </div>

        <nav className="lb-nav-center">
          <a href="#demo" className="lb-nav-link">Product Demo</a>
          <a href="#features" className="lb-nav-link">Capabilities</a>
          <a href="#process" className="lb-nav-link">Workflow</a>
          <a href="#trust" className="lb-nav-link">Impact</a>
        </nav>

        <div className="lb-nav-right">
          {currentUser ? (
            <>
              <button onClick={openDashboard} className="lb-btn-pill" onMouseDown={addRipple}>
                Open Dashboard ⚡
              </button>
              <button onClick={handleSignOut} className="lb-btn-outline">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <button onClick={openDashboard} className="lb-btn-outline" onMouseDown={addRipple}>
                Try Demo
              </button>
              <button onClick={() => setAuthOpen(true)} className="lb-btn-pill" onMouseDown={addRipple}>
                Sign In
              </button>
            </>
          )}
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="lb-hero">
        <div className="lb-hero-glow" />
        <img
          src={littlebirdTreesBg}
          alt="Littlebird Nature Landscape"
          className="lb-hero-tree-bg"
        />
        
        <div className="lb-hero-content">
          <div className="lb-hero-badge reveal">
            <span className="lb-hero-badge-dot" />
            ✦ Procedural Fairness & Plain-Language Audit System
          </div>

          <h1 className="lb-hero-title reveal" style={{ animationDelay: '0.15s' }}>
            Bring total clarity to legal &<br />
            <span className="lb-hero-title-italic">government documents.</span>
          </h1>

          <p className="lb-hero-subtitle reveal" style={{ animationDelay: '0.3s' }}>
            LexisGuide automatically lints benefit denials, public notices, and shared agreements — highlighting missing due process, vague deadlines, and actionable citizen guides.
          </p>

          <div className="lb-hero-actions reveal" style={{ animationDelay: '0.45s' }}>
            <button onClick={openDashboard} className="lb-btn-pill" onMouseDown={addRipple}>
              Launch Linter Workspace ⚡
            </button>
            <a href="#demo" className="lb-btn-outline">
              Explore Live Demo ↓
            </a>
          </div>

          <div className="lb-trust-strip reveal" style={{ animationDelay: '0.6s' }}>
            <span className="lb-trust-item">🔒 SHA-256 Verifiable Audit Trail</span>
            <span className="lb-trust-item">🛡️ Procedural Due Process Standard</span>
            <span className="lb-trust-item">⚡ Instant Evidence Mapping</span>
          </div>
        </div>
      </section>

      {/* 3. PRODUCT DEMO SHOWCASE */}
      <section id="demo" className="lb-demo-section reveal">
        <div className="lb-demo-card">
          {/* Demo Navbar */}
          <div className="lb-demo-navbar">
            <div className="lb-demo-tabs">
              <button
                className={`lb-demo-tab ${demoTab === 'linter' ? 'active' : ''}`}
                onClick={() => setDemoTab('linter')}
              >
                📋 Notice Linter
              </button>
              <button
                className={`lb-demo-tab ${demoTab === 'audit' ? 'active' : ''}`}
                onClick={() => setDemoTab('audit')}
              >
                ⚖️ Procedural Audit
              </button>
              <button
                className={`lb-demo-tab ${demoTab === 'guide' ? 'active' : ''}`}
                onClick={() => setDemoTab('guide')}
              >
                💡 Action Guide
              </button>
              <button
                className={`lb-demo-tab ${demoTab === 'chain' ? 'active' : ''}`}
                onClick={() => setDemoTab('chain')}
              >
                🔗 Provenance Log
              </button>
            </div>
            <div className="lb-demo-badge">
              ● Active Rule Pack: v4.2 Civic Fairness
            </div>
          </div>

          {/* Demo Content */}
          <div className="lb-demo-content">
            {demoTab === 'linter' && (
              <div className="lb-linter-grid">
                {/* Document text view */}
                <div className="lb-doc-preview">
                  <div className="lb-doc-header">
                    <div className="lb-doc-agency">Department of Human Services · Division of Benefits</div>
                    <div className="lb-doc-title">Notice of Supplemental Assistance Discontinuation</div>
                  </div>
                  <p>
                    Re: Case Ref #8942-B. Your application for supplemental support has been evaluated under State Administrative Code § 408.
                  </p>
                  <p style={{ marginTop: '12px' }}>
                    <span className="lb-highlight-critical">CRITICAL FINDING:</span> Benefit payments will cease effective October 1, 2026. If you disagree with this determination, <span className="lb-highlight-critical">you may submit an appeal within a reasonable timeframe</span> to the regional office.
                  </p>
                  <p style={{ marginTop: '12px' }}>
                    <span className="lb-highlight-warning">WARNING FINDING:</span> Failure to provide <span className="lb-highlight-warning">satisfactory verification of secondary household income</span> will result in permanent case closure.
                  </p>
                  <p style={{ marginTop: '12px' }}>
                    <span className="lb-highlight-pass">PASSED:</span> Notice issued with valid issuing officer identifier (Agent ID #9042) and verified administrative hash.
                  </p>
                </div>

                {/* Audit Findings */}
                <div className="lb-findings-column">
                  <div className="lb-finding-card">
                    <div className="lb-finding-header">
                      <span className="lb-tag-critical">Critical Due Process Flag</span>
                      <span style={{ fontSize: '11px', color: '#8c897f', fontWeight: 600 }}>Rule DP-104</span>
                    </div>
                    <div className="lb-finding-title">Vague Filing Deadline</div>
                    <div className="lb-finding-desc">
                      The phrase "within a reasonable timeframe" fails statutory specificity requirements. Due process requires exact calendar date or fixed business day window.
                    </div>
                    <div className="lb-evidence-box">
                      "you may submit an appeal within a reasonable timeframe"
                    </div>
                  </div>

                  <div className="lb-finding-card">
                    <div className="lb-finding-header">
                      <span className="lb-tag-warning">Warning Flag</span>
                      <span style={{ fontSize: '11px', color: '#8c897f', fontWeight: 600 }}>Rule PL-201</span>
                    </div>
                    <div className="lb-finding-title">Undefined Verification Standard</div>
                    <div className="lb-finding-desc">
                      Does not specify acceptable document types (e.g. W-2, pay stub, bank statement) needed to satisfy "satisfactory verification".
                    </div>
                  </div>
                </div>
              </div>
            )}

            {demoTab === 'audit' && (
              <div className="lb-audit-view">
                <div className="lb-score-card">
                  <div className="lb-score-ring">
                    <div className="lb-score-number">54</div>
                    <div className="lb-score-denom">/ 100</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: '#191919' }}>
                    Needs Improvement
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    3 Critical Procedural Flaws Detected
                  </div>
                </div>

                <div className="lb-rubric-grid">
                  <div className="lb-rubric-card">
                    <div className="lb-rubric-header">
                      <span>Procedural Due Process</span>
                      <span style={{ color: '#d32f2f' }}>45%</span>
                    </div>
                    <div className="lb-meter-bar">
                      <div className="lb-meter-fill" style={{ width: '45%', background: '#e53935' }} />
                    </div>
                  </div>

                  <div className="lb-rubric-card">
                    <div className="lb-rubric-header">
                      <span>Timeline Specificity</span>
                      <span style={{ color: '#d96b27' }}>30%</span>
                    </div>
                    <div className="lb-meter-bar">
                      <div className="lb-meter-fill" style={{ width: '30%', background: '#d96b27' }} />
                    </div>
                  </div>

                  <div className="lb-rubric-card">
                    <div className="lb-rubric-header">
                      <span>Plain Language Readability</span>
                      <span style={{ color: '#2e7d32' }}>82%</span>
                    </div>
                    <div className="lb-meter-bar">
                      <div className="lb-meter-fill" style={{ width: '82%', background: '#2e7d32' }} />
                    </div>
                  </div>

                  <div className="lb-rubric-card">
                    <div className="lb-rubric-header">
                      <span>Contact & Appeal Rights</span>
                      <span style={{ color: '#d96b27' }}>60%</span>
                    </div>
                    <div className="lb-meter-bar">
                      <div className="lb-meter-fill" style={{ width: '60%', background: '#d96b27' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {demoTab === 'guide' && (
              <div className="lb-guide-view">
                <div className="lb-guide-header">
                  <div>
                    <div className="lb-guide-title">Plain-Language Action Plan for Citizen</div>
                    <div style={{ fontSize: '13px', color: '#2a4830', marginTop: '2px' }}>
                      Generated automatically from Notice Ref #8942-B
                    </div>
                  </div>
                  <button className="lb-btn-pill" style={{ padding: '8px 16px', fontSize: '12px' }} onClick={openDashboard}>
                    Download Appeal Template ↗
                  </button>
                </div>

                <div className="lb-guide-steps">
                  <div className="lb-guide-step-item">
                    <div className="lb-step-badge">1</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#191919' }}>
                        File Appeal Notice Form DHS-4082
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Submit your appeal within 30 days of notice postmark (Estimated deadline: October 12, 2026).
                      </div>
                    </div>
                  </div>

                  <div className="lb-guide-step-item">
                    <div className="lb-step-badge">2</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#191919' }}>
                        Gather Secondary Income Proof
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Attach 2 recent paystubs or a signed affidavit confirming current monthly income.
                      </div>
                    </div>
                  </div>

                  <div className="lb-guide-step-item">
                    <div className="lb-step-badge">3</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#191919' }}>
                        Request Hearing Continuation
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Your benefits continue automatically during administrative review if appeal is filed within 10 days.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {demoTab === 'chain' && (
              <div className="lb-chain-view">
                <div style={{ fontSize: '12px', color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                  ✓ Cryptographic Provenance Verified
                </div>
                <div className="lb-chain-row">
                  <span className="lb-chain-key">Document SHA-256 Hash:</span>
                  <span className="lb-chain-val">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</span>
                </div>
                <div className="lb-chain-row">
                  <span className="lb-chain-key">Rule Pack Standard:</span>
                  <span className="lb-chain-val">CIVIC-FAIRNESS-v4.2.1-RELEASE</span>
                </div>
                <div className="lb-chain-row">
                  <span className="lb-chain-key">Audit Timestamp:</span>
                  <span className="lb-chain-val">2026-09-19T13:51:22.000Z</span>
                </div>
                <div className="lb-chain-row">
                  <span className="lb-chain-key">Review Chain Signature:</span>
                  <span className="lb-chain-val">0x9f82...3a1c (Cognito Authenticated)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. FLOATING FEATURE CARDS (LITTLEBIRD STYLE) */}
      <section id="features" className="lb-features-section">
        <div className="lb-section-header reveal">
          <span className="lb-section-tag">Core Capabilities</span>
          <h2 className="lb-section-title">
            Built for total fairness.<br />Backed by verifiable evidence.
          </h2>
        </div>

        <div className="lb-features-grid">
          <div className="lb-feature-card tilt-card reveal" style={{ animationDelay: '0.1s' }}>
            <div className="lb-feature-icon">🔍</div>
            <h3 className="lb-feature-title">Instant Notice Extraction</h3>
            <p className="lb-feature-desc">
              Parses PDFs, scanned notices, and agency letters automatically — extracting issuing authority, effective dates, filing deadlines, and statutory references.
            </p>
          </div>

          <div className="lb-feature-card tilt-card reveal" style={{ animationDelay: '0.2s' }}>
            <div className="lb-feature-icon">⚖️</div>
            <h3 className="lb-feature-title">Procedural Due Process Linter</h3>
            <p className="lb-feature-desc">
              Evaluates document text against 40+ statutory rule packs to catch ambiguous deadlines, missing appeal forms, and procedural due process violations.
            </p>
          </div>

          <div className="lb-feature-card tilt-card reveal" style={{ animationDelay: '0.3s' }}>
            <div className="lb-feature-icon">🔗</div>
            <h3 className="lb-feature-title">Cryptographic Review Chain</h3>
            <p className="lb-feature-desc">
              Generates immutable SHA-256 hashes and evidence spans to record a verifiable provenance trail between citizens, advocates, and public agencies.
            </p>
          </div>
        </div>
      </section>

      {/* 5. PROCESS SECTION */}
      <section id="process" className="lb-process-section">
        <div className="lb-process-container">
          <div className="lb-section-header reveal">
            <span className="lb-section-tag">Production Workflow</span>
            <h2 className="lb-section-title">One Upload. Two Auditable Outputs.</h2>
          </div>

          <div className="lb-process-grid">
            <div className="lb-process-card tilt-card reveal" style={{ animationDelay: '0.1s' }}>
              <div className="lb-process-num">01</div>
              <h4 className="lb-process-name">Extract & Parse</h4>
              <p className="lb-process-text">
                Optical character parsing extracts agency details, decisions, dates, and statutory appeal paths.
              </p>
            </div>

            <div className="lb-process-card tilt-card reveal" style={{ animationDelay: '0.2s' }}>
              <div className="lb-process-num">02</div>
              <h4 className="lb-process-name">Execute Linter</h4>
              <p className="lb-process-text">
                Rule engine scans text for vague wording, missing form links, and procedural due process gaps.
              </p>
            </div>

            <div className="lb-process-card tilt-card reveal" style={{ animationDelay: '0.3s' }}>
              <div className="lb-process-num">03</div>
              <h4 className="lb-process-name">Action Guide</h4>
              <p className="lb-process-text">
                Translates legalese into a bulleted action checklist with clear filing steps and deadline countdowns.
              </p>
            </div>

            <div className="lb-process-card tilt-card reveal" style={{ animationDelay: '0.4s' }}>
              <div className="lb-process-num">04</div>
              <h4 className="lb-process-name">Provenance Trail</h4>
              <p className="lb-process-text">
                Cryptographic hash logs verify that both advocate and agency reference the exact same document version.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. TESTIMONIALS / TRUST */}
      <section id="trust" className="lb-trust-section">
        <div className="lb-quote-card tilt-card reveal">
          <div className="lb-quote-stars">★★★★★</div>
          <p className="lb-quote-text">
            "LexisGuide transformed our legal aid intake. We audit notices in seconds, highlighting vague appeal paths with 100% evidence linkage."
          </p>
          <div className="lb-quote-author">
            <div className="lb-author-avatar" style={{ backgroundImage: "url('/assets/avatars.png')", backgroundPosition: '20% 50%' }} />
            <div>
              <div className="lb-author-name">Elena Moritz</div>
              <div className="lb-author-role">Legal Aid Director · CivicTech Fellow</div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. CTA BANNER */}
      <section className="lb-cta-section">
        <div className="lb-cta-card reveal">
          <h2 className="lb-cta-title">
            Ready to bring total clarity to<br />your public documents?
          </h2>
          <p className="lb-cta-subtitle">
            Join legal aid advocates, civic leaders, and public agencies using LexisGuide for procedural fairness.
          </p>
          <button className="lb-cta-btn-green" onClick={openDashboard} onMouseDown={addRipple}>
            Launch Linter Workspace ⚡
          </button>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="lb-footer">
        <div className="lb-footer-container">
          <div className="lb-footer-top">
            <div style={{ maxWidth: '360px' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 700, color: '#191919', marginBottom: '12px' }}>
                LexisGuide
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Lighthouse for public documents and shared agreements. Ensuring procedural fairness, evidence-linked findings, and verifiable review trails.
              </p>
            </div>

            <div className="lb-footer-col">
              <span className="lb-footer-title">Platform</span>
              <a href="#demo" className="lb-footer-link">Notice Linter</a>
              <a href="#demo" className="lb-footer-link">Procedural Audit</a>
              <a href="#demo" className="lb-footer-link">Citizen Guide</a>
              <a href="#demo" className="lb-footer-link">Provenance Log</a>
            </div>

            <div className="lb-footer-col">
              <span className="lb-footer-title">Governance</span>
              <a href="#" className="lb-footer-link">Rule Packs</a>
              <a href="#" className="lb-footer-link">Due Process Standard</a>
              <a href="#" className="lb-footer-link">LexHack 2026</a>
              <a href="#" className="lb-footer-link">API & SDK</a>
            </div>
          </div>

          <div className="lb-footer-bottom">
            <span>© 2026 LexisGuide Inc. All rights reserved. Decision support — not formal legal representation.</span>
            <div style={{ display: 'flex', gap: '20px' }}>
              <a href="#" className="lb-footer-link">Privacy</a>
              <a href="#" className="lb-footer-link">Terms</a>
              <a href="#" className="lb-footer-link">Security</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast Notification */}
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
