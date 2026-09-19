import { useEffect, useState, type CSSProperties } from 'react'

const principles = [
  ['01', 'Read the signal', 'Extract the decision, deadline, appeal path, and consequence from every important document.'],
  ['02', 'See the proof', 'Every issue is anchored to evidence, a rule, and a human-readable explanation.'],
  ['03', 'Move with confidence', 'Turn a first read into a next step, shared review, and a verifiable history.'],
]

function Arrow() { return <span className="arrow">↗</span> }

function App() {
  const [toast, setToast] = useState('')
  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const [heroDepth, setHeroDepth] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
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
  const go = (message: string) => { document.querySelector('#experience')?.scrollIntoView({ behavior: 'smooth' }); setToast(message) }

  return <div className="experience-shell">{isLoading && <div className="loading-screen" aria-hidden="true"><div className="loader-grid" /><div className="loader-content"><p>INITIALIZING CLARITY LAYER</p><div className="loader-wordmark"><span>LEXIS</span><i>GUIDE</i></div><div className="loader-orbit"><span /><b>L</b></div><small>01 / 01</small></div></div>}<div className="scroll-progress" style={{ transform: `scaleX(${progress})` }} />
    <header className="floating-nav">
      <a className="brand" href="#top"><span className="brand-orb">L</span><span>LEXIS<span className="orange">GUIDE</span></span></a>
      <nav><a href="#experience">Experience</a><a href="#principles">Principles</a><a href="#trust">Trust layer</a></nav>
      <button onClick={() => go('Workspace initialized — ready for your first document.')}>Enter workspace <Arrow /></button>
    </header>

    <main id="top">
      <section className="hero3d">
        <div className="hero-noise" /><div className="hero-grid" />
        <div className="hero-copy3d" style={{ transform: `translateY(${heroDepth * -64}px) scale(${1 - heroDepth * .08})`, opacity: 1 - heroDepth * .55 }}><p className="eyebrow"><span /> AI × LAW · PROCEDURAL FAIRNESS</p><h1>Make the<br /><i>complex</i> clear.</h1><p className="hero-deck">A living clarity layer for the documents that shape your life. Find the signal, follow the evidence, and know your next step.</p><div className="hero-buttons"><button className="orange-button" onClick={() => go('Demo mode engaged — scroll through the experience.')}>Enter the experience <Arrow /></button><a href="#experience">Scroll to explore <span className="scroll-arrow">↓</span></a></div></div>
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
  </div>
}

export default App
