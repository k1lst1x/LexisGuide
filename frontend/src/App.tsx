import { useEffect, useState, type CSSProperties } from 'react'

import { AuthModal } from './AuthModal'
const principles = [
  ['01', 'Read the signal', 'Extract the decision, deadline, appeal path, and consequence from every important document.'],
  ['02', 'See the proof', 'Every issue is anchored to evidence, a rule, and a human-readable explanation.'],
  ['03', 'Move with confidence', 'Turn a first read into a next step, shared review, and a verifiable history.'],
]

function Arrow() { return <span className="arrow">↗</span> }

function Dashboard({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [section, setSection] = useState('Overview')
  const [notice, setNotice] = useState('')
  const firstName = email.split('@')[0].split(/[._-]/)[0] || 'there'
  const documents = [
    ['Rental renewal notice', 'Today · 11:42 AM', '2 items need review', 'High'],
    ['Employment agreement', 'Yesterday · 4:18 PM', 'No new issues', 'Clear'],
    ['Insurance denial letter', 'Sep 14 · 9:30 AM', 'Appeal deadline found', 'Action needed'],
  ]

  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <a className="brand" href="#dashboard"><span className="brand-orb">L</span><span>LEXIS<span className="orange">GUIDE</span></span></a>
      <p className="workspace-label">YOUR WORKSPACE</p>
      <nav className="dashboard-nav" aria-label="Workspace navigation">
        {['Overview', 'Documents', 'Review queue', 'Saved evidence'].map((item) => <button className={section === item ? 'selected' : ''} key={item} onClick={() => { setSection(item); setNotice(`${item} selected`) }}><span>{item === 'Overview' ? '▦' : item === 'Documents' ? '▤' : item === 'Review queue' ? '◌' : '⌁'}</span>{item}</button>)}
      </nav>
      <div className="sidebar-footer"><span className="avatar">{firstName[0].toUpperCase()}</span><div><b>{email}</b><button onClick={onSignOut}>Sign out</button></div></div>
    </aside>

    <main className="dashboard-main" id="dashboard">
      <header className="dashboard-header"><div><p className="eyebrow"><span /> {section.toUpperCase()}</p><h1>Good morning, <i>{firstName}.</i></h1><p>Here’s the clearest path through what needs your attention.</p></div><button className="orange-button" onClick={() => setNotice('Upload flow ready — choose a document to begin.')}>Add a document <Arrow /></button></header>

      <section className="dashboard-metrics" aria-label="Workspace summary">
        <article><span>DOCUMENTS TRACKED</span><strong>06</strong><small>2 added this week</small></article>
        <article><span>OPEN ACTIONS</span><strong>03</strong><small className="attention">1 due this week</small></article>
        <article><span>CLARITY SCORE</span><strong>81<em>/100</em></strong><small>Across active documents</small></article>
      </section>

      <section className="dashboard-grid">
        <article className="priority-card"><div className="card-heading"><div><p className="eyebrow orange-label"><span /> PRIORITY REVIEW</p><h2>Rental renewal notice</h2></div><button onClick={() => setNotice('Opening the rental renewal review…')}>Open review <Arrow /></button></div><p className="priority-copy">Two terms could affect your housing options. Both are linked to the source language below.</p><div className="issue-list"><div><span className="severity high">HIGH</span><div><b>30-day response window</b><p>Your response deadline is October 4, 2026.</p></div><span className="issue-arrow">↗</span></div><div><span className="severity medium">CHECK</span><div><b>Automatic rent adjustment</b><p>Confirm how the increase is calculated before renewal.</p></div><span className="issue-arrow">↗</span></div></div></article>

        <article className="next-step-card"><p className="eyebrow"><span /> NEXT STEP</p><div className="calendar-mark"><b>04</b><span>OCT</span></div><h2>Reply to your landlord</h2><p>Save the notice and decide whether to renew, ask a question, or give notice.</p><button className="glass-button" onClick={() => setNotice('Action plan opened.')}>View action plan <Arrow /></button></article>
      </section>

      <section className="documents-card"><div className="card-heading"><div><p className="eyebrow"><span /> RECENT DOCUMENTS</p><h2>Keep the thread visible.</h2></div><button onClick={() => setNotice('All documents selected.')}>View all <Arrow /></button></div><div className="document-table">{documents.map(([name, date, detail, status]) => <button key={name} onClick={() => setNotice(`${name} selected`)}><span className="document-icon">▤</span><span className="document-name"><b>{name}</b><small>{date}</small></span><span className="document-detail">{detail}</span><span className={`document-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span><span className="issue-arrow">↗</span></button>)}</div></section>
      {notice && <button className="toast3d" onClick={() => setNotice('')}>{notice}<b>×</b></button>}
    </main>
  </div>
}

function App() {
  const [toast, setToast] = useState('')
  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const [heroDepth, setHeroDepth] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1850)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('in-view')), { threshold: 0.14 })
    document.querySelectorAll('.reveal-on-scroll').forEach((element) => revealObserver.observe(element))
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? window.scrollY / max : 0)
      setHeroDepth(Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { revealObserver.disconnect(); window.removeEventListener('scroll', onScroll) }
  }, [])
  useEffect(() => {
    const lens = document.querySelector('.halo-one')
    const documentFace = document.querySelector('.document-face')
    if (!lens || !documentFace) return
    const viewport = document.createElement('div')
    viewport.className = 'magnifier-viewport'
    const magnifiedFace = documentFace.cloneNode(true) as HTMLElement
    magnifiedFace.classList.add('magnified-document-face')
    viewport.appendChild(magnifiedFace)
    lens.appendChild(viewport)
    return () => viewport.remove()
  }, [])
  const go = (message: string) => { document.querySelector('#experience')?.scrollIntoView({ behavior: 'smooth' }); setToast(message) }

  if (userEmail) return <Dashboard email={userEmail} onSignOut={() => { setUserEmail(''); setToast('Signed out of your local workspace.') }} />

  return <div className="experience-shell">{isLoading && <div className="loading-screen" aria-hidden="true"><div className="loader-grid" /><div className="loader-content"><p>INITIALIZING CLARITY LAYER</p><div className="loader-wordmark"><span>LEXIS</span><i>GUIDE</i></div><div className="loader-orbit"><span /><b>L</b></div><small>01 / 01</small></div></div>}<div className="scroll-progress" style={{ transform: `scaleX(${progress})` }} />
    <header className="floating-nav">
      <a className="brand" href="#top"><span className="brand-orb">L</span><span>LEXIS<span className="orange">GUIDE</span></span></a>
      <nav><a href="#experience">Experience</a><a href="#principles">Principles</a><a href="#trust">Trust layer</a></nav>
      <button onClick={() => setAuthOpen(true)}>Sign in <Arrow /></button>
    </header>

    <main id="top">
      <section className="hero3d">
        <div className="hero-noise" /><div className="hero-grid" />
        <div className="hero-copy3d" style={{ transform: `translateY(${heroDepth * -64}px) scale(${1 - heroDepth * .08})`, opacity: 1 - heroDepth * .55 }}><p className="eyebrow"><span /> AI × LAW · PROCEDURAL FAIRNESS</p><h1>Make the<br /><i>complex</i> clear.</h1><p className="hero-deck">A living clarity layer for the documents that shape your life. Find the signal, follow the evidence, and know your next step.</p><div className="hero-buttons"><button className="orange-button" onClick={() => setAuthOpen(true)}>Create secure workspace <Arrow /></button><a href="#experience">Scroll to explore <span className="scroll-arrow">↓</span></a></div></div>
        <div className="scene scene-enter" style={{ '--scene-scale': 1 + heroDepth * .42, '--scene-y': `${-heroDepth * 150}px`, opacity: 1 - heroDepth * .42 } as CSSProperties} aria-label="Animated 3D LexisGuide document experience"><div className="scene-glow" /><div className="scene-halo halo-one" /><div className="scene-halo halo-two" /><div className="orbit orbit-large" /><div className="orbit orbit-small" /><div className="document-3d"><div className="document-edge" /><div className="document-face"><span className="doc-kicker">LEXISGUIDE / 001</span><div className="doc-seal">L</div><h2>Notice<br /><span>decoded.</span></h2><div className="doc-rule" /><p>Procedural clarity<br /><strong>81 / 100</strong></p><div className="doc-lines"><i /><i /><i className="short" /></div></div></div><div className="node node-a"><b>01</b><span>deadline</span></div><div className="node node-b"><b>02</b><span>appeal path</span></div><div className="node node-c"><b>03</b><span>evidence</span></div><div className="cursor-chip">evidence, in motion <span>↗</span></div></div>
        <div className="hero-bottom"><span>SCROLL TO EXPLORE</span><span className="hero-line" /><span>01 / 04</span></div>
      </section>

      <section className="statement reveal-on-scroll" id="experience"><p className="eyebrow orange-label"><span /> THE CLARITY LAYER</p><h2>Legal documents<br />should feel <i>human.</i></h2><p className="statement-body">LexisGuide transforms notices, agreements, and administrative letters into a spatial map of what matters: decisions, dates, rights, responsibilities, and proof.</p></section>

      <section className="principles reveal-on-scroll" id="principles"><div className="section-heading"><p className="eyebrow"><span /> THE EXPERIENCE</p><h2>Three moves.<br /><i>Less uncertainty.</i></h2></div><div className="principle-layout"><div className="principle-nav">{principles.map(([number, title], index) => <button className={active === index ? 'active' : ''} key={number} onClick={() => setActive(index)}><span>{number}</span>{title}<b>↗</b></button>)}</div><div className="principle-stage"><div className="stage-orb" /><div className="stage-card"><span className="stage-number">{principles[active][0]}</span><div className="stage-icon">{active === 0 ? '◌' : active === 1 ? '⌁' : '↗'}</div><h3>{principles[active][1]}</h3><p>{principles[active][2]}</p><div className="stage-meter"><span style={{ width: `${(active + 1) * 33}%` }} /></div><small>LEXISGUIDE / INTERFACE {principles[active][0]}</small></div></div></div></section>

      <section className="trust3d reveal-on-scroll" id="trust"><div className="trust-glow" /><div className="trust-content"><p className="eyebrow"><span /> THE TRUST LAYER</p><h2>Useful AI.<br /><i>Visible reasoning.</i></h2><p>Not a score you have to trust. A chain you can inspect: source document, evidence span, rule run, explanation, human decision.</p><button className="glass-button" onClick={() => setToast('Review chain opened — every version stays connected.')}>Open the review chain <Arrow /></button></div><div className="chain-visual"><div className="chain-line" />{['DOCUMENT', 'EVIDENCE', 'RULE RUN', 'HUMAN', 'REPORT'].map((item, index) => <div className={`chain-node chain-${index}`} key={item}><span>{String(index + 1).padStart(2, '0')}</span><b>{item}</b></div>)}</div></section>

      <section className="closing3d reveal-on-scroll"><div className="closing-orb" /><p className="eyebrow orange-label"><span /> LEXISGUIDE / 2026</p><h2>Clarity is<br /><i>a superpower.</i></h2><p>Start with one document. Leave with a next step you can defend.</p><button className="orange-button" onClick={() => go('Workspace initialized — ready for your first document.')}>Start the journey <Arrow /></button></section>
    </main>
    <footer className="footer3d"><a className="brand" href="#top"><span className="brand-orb">L</span><span>LEXIS<span className="orange">GUIDE</span></span></a><span>AI-assisted clarity for real-world decisions.</span><span>Not legal advice.</span></footer>
    {toast && <button className="toast3d" onClick={() => setToast('')}>{toast}<b>×</b></button>}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={(email) => { setUserEmail(email); setAuthOpen(false); setToast('Signed in — your private workspace is ready.') }} />}
  </div>
}

export default App
