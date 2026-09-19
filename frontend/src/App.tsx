import { useState } from 'react'

const checks = [
  { label: 'Appeal deadline', value: 'Unclear', tone: 'alert' },
  { label: 'Appeal destination', value: 'Missing', tone: 'alert' },
  { label: 'Consequences', value: 'Not explained', tone: 'alert' },
  { label: 'Issuing agency', value: 'Identified', tone: 'good' },
]

const steps = [
  ['01', 'Upload', 'PDF, letter, screenshot, or public webpage'],
  ['02', 'Extract', 'Agency, decision, dates, rights, legal basis'],
  ['03', 'Lint', 'Rule-based + AI checks for clarity and contradictions'],
  ['04', 'Guide', 'Plain-language next steps and consequences'],
  ['05', 'Chain', 'Hash, evidence, versions, and reviewer actions'],
]

function ArrowUpRight() { return <span className="arrow" aria-hidden="true">↗</span> }

function App() {
  const [notice, setNotice] = useState('')
  const startDemo = () => { document.querySelector('#workflow')?.scrollIntoView({ behavior: 'smooth' }); setNotice('Demo workspace ready — start with a document upload.') }

  return (
    <div className="site-shell">
      <div className="grain" />
      <header className="nav container">
        <a className="brand" href="#top" aria-label="LexisGuide home"><span className="brand-mark">L</span><span>LexisGuide</span></a>
        <nav className="nav-links" aria-label="Main navigation"><a href="#workflow">How it works</a><a href="#audit">The audit</a><a href="#chain">Review chain</a></nav>
        <button className="nav-cta" onClick={startDemo}>Try the demo <ArrowUpRight /></button>
      </header>

      <main id="top">
        <section className="hero container">
          <div className="hero-copy reveal"><p className="eyebrow"><span className="eyebrow-dot" /> AI × LAW · CIVIC TECH · PROCEDURAL FAIRNESS</p><h1>A lighthouse for <em>government</em> documents.</h1><p className="hero-lede">LexisGuide makes confusing notices and shared agreements clear, actionable, and reviewable — with every finding linked back to the evidence.</p><div className="hero-actions"><button className="button button-dark" onClick={startDemo}>Analyze a document <ArrowUpRight /></button><a className="text-link" href="#story">See how it works <span>↓</span></a></div><p className="micro-copy">Decision support, not legal advice. Human decisions stay human.</p></div>
          <div className="hero-visual reveal delay-1" aria-label="LexisGuide procedural clarity audit preview"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="audit-card"><div className="card-topline"><span>PROCEDURAL CLARITY</span><span className="live-dot">● LIVE AUDIT</span></div><div className="score-row"><div className="score">54<span>/100</span></div><div className="score-copy">Notice of Denial<br /><small>uploaded just now</small></div></div><div className="score-bar"><span /></div><div className="check-list">{checks.map((check) => <div className="check-row" key={check.label}><span className={`check-icon ${check.tone}`}>{check.tone === 'good' ? '✓' : '!'}</span><span>{check.label}</span><strong>{check.value}</strong></div>)}</div><div className="card-footer"><span>RULESET · US-BENEFITS-01</span><span>evidence linked ↗</span></div></div><div className="floating-tag tag-top"><span className="tag-icon">⌁</span> Evidence-linked findings</div><div className="floating-tag tag-bottom"><span className="tag-icon green">✓</span> Human-in-the-loop</div></div>
        </section>

        <section className="ticker" aria-label="Product principles"><div className="ticker-track"><span>MAKE DUE PROCESS UNDERSTANDABLE</span><b>✳</b><span>REVIEWABLE</span><b>✳</b><span>VERIFIABLE</span><b>✳</b><span>MAKE DUE PROCESS UNDERSTANDABLE</span><b>✳</b><span>REVIEWABLE</span><b>✳</b></div></section>

        <section className="problem container" id="story"><div className="section-label">/ THE PROBLEM</div><div className="problem-grid"><h2>Legally valid can still be <em>practically unusable.</em></h2><div><p className="body-copy">A person receives a denial or administrative notice. The document cites rules, but the deadline is vague, the appeal path is buried, and the consequences of doing nothing are unclear.</p><a className="text-link" href="#workflow">Turn confusion into a next step <ArrowUpRight /></a></div></div><div className="persona-grid"><div className="persona"><span className="persona-number">01</span><h3>Resident / Citizen</h3><p>“What happened? What must I do? By when? What if I do nothing?”</p></div><div className="persona"><span className="persona-number">02</span><h3>Lawyer / Legal Aid</h3><p>Fast issue spotting, source-linked findings, and a clean first-pass trail.</p></div><div className="persona"><span className="persona-number">03</span><h3>Agency / Public Service</h3><p>Catch ambiguous deadlines and confusing language before publication.</p></div></div></section>

        <section className="workflow-section" id="workflow"><div className="container"><div className="section-label light">/ THE WORKFLOW</div><div className="workflow-heading"><h2>One upload.<br /><em>Two outputs.</em></h2><p>A fairness audit and a practical next-step guide — grounded in the document you actually received.</p></div><div className="step-grid">{steps.map(([number, title, description], index) => <div className={`step ${index === 2 ? 'step-active' : ''}`} key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{description}</p>{index < 4 && <span className="step-arrow">→</span>}</div>)}</div></div></section>

        <section className="audit-section container" id="audit"><div className="section-label">/ THE LINTER</div><div className="audit-heading"><h2>Not a black-box score.<br /><em>A trail you can follow.</em></h2><p>Every flagged issue links to the exact document evidence and the rule that triggered it. AI explains; deterministic rules keep the core checks honest.</p></div><div className="audit-demo"><div className="document-preview"><div className="doc-label">NOTICE OF DENIAL <span>PAGE 01</span></div><div className="doc-lines"><i /><i /><i className="short" /><mark>you may appeal this decision.</mark><i /><i className="short" /><mark className="missing">appeal instructions</mark><i /><i /></div><div className="document-stamp">LEXIS<br />GUIDE</div></div><div className="finding-panel"><div className="panel-header"><span>2 CRITICAL FINDINGS</span><span className="panel-time">● 14s ago</span></div><div className="finding finding-alert"><span className="check-icon alert">!</span><div><strong>Appeal deadline: unclear</strong><p>No explicit date or number of days found.</p><a href="#chain">View evidence span ↗</a></div></div><div className="finding finding-alert"><span className="check-icon alert">!</span><div><strong>Appeal destination: missing</strong><p>The notice does not say where to file.</p><a href="#chain">View evidence span ↗</a></div></div><button className="panel-button" onClick={startDemo}>Generate next-step guide <ArrowUpRight /></button></div></div></section>

        <section className="chain-section" id="chain"><div className="container chain-grid"><div><div className="section-label light">/ THE TRUST LAYER</div><h2>Review history<br /><em>is part of the product.</em></h2><p>A provenance trail for the moments that matter: what was uploaded, which rule ran, what AI explained, and what a person decided.</p><button className="button button-green" onClick={() => setNotice('Review chain opened — every version stays connected.')}>Explore the review chain <ArrowUpRight /></button></div><div className="timeline"><div className="timeline-line" />{[['v1', '54/100', 'deadline unclear'], ['v2', '68/100', 'deadline added'], ['v3', '81/100', 'appeal path added'], ['v4', '89/100', 'language simplified']].map(([version, score, label], i) => <div className={`timeline-item ${i === 3 ? 'current' : ''}`} key={version}><span className="timeline-dot" /><span className="timeline-version">{version}</span><strong>{score}</strong><span>{label}</span></div>)}</div></div></section>

        <section className="workspace container"><div className="section-label">/ SHARED WORKSPACE</div><div className="workspace-heading"><h2>AI suggests.<br /><em>People decide.</em></h2><p>Invite another person into the same document, findings, conversation, and version history. No auto-accept. No auto-sign.</p></div><div className="workspace-card"><div className="workspace-top"><span>LEASE AGREEMENT WORKSPACE</span><span className="workspace-status">● 2 MEMBERS</span></div><div className="workspace-body"><div className="avatars"><span className="avatar tenant">T</span><span className="avatar landlord">L</span><div><strong>Tenant ↔ Landlord</strong><small>Both parties reviewing</small></div></div><div className="workspace-findings"><span>AI REVIEW · v1 · 62/100</span><p><b>!</b> Security deposit: ambiguous</p><p><b>!</b> Repair duty: unclear</p><p><b>!</b> Termination notice: missing</p></div><div className="chat"><span>WORKSPACE CHAT</span><p><b>TENANT</b> Can we clarify who handles repairs?</p><p><b>LANDLORD</b> Agreed. I’ll update clause 8.</p><div className="chat-input">Upload revised v2 <span>↗</span></div></div></div></div></section>

        <section className="final-cta container"><p className="eyebrow"><span className="eyebrow-dot" /> LEXISGUIDE · LEXHACK 2026</p><h2>Government documents should not require a lawyer just to understand the <em>next step.</em></h2><button className="button button-dark" onClick={startDemo}>Start with a document <ArrowUpRight /></button></section>
      </main>
      <footer className="footer container"><a className="brand" href="#top"><span className="brand-mark">L</span><span>LexisGuide</span></a><span>AI-assisted clarity for the documents that shape our lives.</span><span>Decision support · Not legal advice</span></footer>
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice} <span>×</span></button>}
    </div>
  )
}

export default App
