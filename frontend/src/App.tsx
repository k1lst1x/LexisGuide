import { useState } from 'react'

const features = [
  { number: '01', title: 'Make every notice understandable', text: 'Turn dense government letters into a clear answer: what happened, what to do next, and when to do it.', icon: '✦' },
  { number: '02', title: 'Stay anchored to evidence', text: 'Every finding points to the exact source span and rule that triggered it. No unexplained scores.', icon: '⌁' },
  { number: '03', title: 'Move from review to action', text: 'Generate plain-language next steps, invite a collaborator, and preserve the full review history.', icon: '↗' },
]

const faqs = [
  ['What is LexisGuide?', 'LexisGuide is an AI-assisted clarity and procedural fairness guide for government notices and shared agreements. It helps people understand documents and decide what to do next.'],
  ['Does LexisGuide give legal advice?', 'No. LexisGuide provides informational decision support, not legal advice. People remain responsible for their documents, decisions, and deadlines.'],
  ['Can I see why something was flagged?', 'Yes. Findings are linked to evidence spans in the source document and to the rule or check that produced the finding.'],
  ['Can another person review with me?', 'Yes. A shared workspace keeps findings, discussion, revisions, and version history together so people can review the same document.'],
]

function Arrow() { return <span className="arrow" aria-hidden="true">↗</span> }

function App() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const start = () => { document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' }); setToast('Your review workspace is ready to explore.') }

  return <div className="ordalie-inspired-shell">
    <header className="site-nav container">
      <a className="wordmark" href="#top"><span className="wordmark-symbol">L</span>LexisGuide</a>
      <nav><a href="#features">Product</a><a href="#security">Trust</a><a href="#faq">FAQ</a></nav>
      <button className="nav-button" onClick={start}>Login <Arrow /></button>
    </header>

    <main id="top">
      <section className="hero container">
        <div className="hero-kicker"><span /> AI × LAW · CIVIC TECH · PROCEDURAL FAIRNESS</div>
        <h1>The clarity layer<br />for <i>legal documents.</i></h1>
        <p className="hero-intro">Understand government notices and shared agreements instantly. Analyze, explain, and improve important documents with evidence you can verify.</p>
        <div className="hero-actions"><button className="primary-button" onClick={start}>Explore the product <Arrow /></button><a href="#features" className="under-link">See what it does ↓</a></div>
        <div className="hero-orbit"><div className="ribbon-field"><span className="ribbon ribbon-one" /><span className="ribbon ribbon-two" /><span className="ribbon ribbon-three" /><span className="ribbon ribbon-four" /></div><div className="orbit-card orbit-card-main"><span className="orbit-icon">✦</span><strong>Notice of Denial</strong><small>3 issues found · 54/100</small></div><div className="orbit-card orbit-card-side"><span className="orbit-check">✓</span><strong>Evidence linked</strong><small>Rule + source span</small></div><div className="orbit-card orbit-card-bottom"><span>next step</span><b>Appeal by May 18</b></div><div className="orbit-ring ring-a" /><div className="orbit-ring ring-b" /></div>
      </section>

      <section className="proof-strip"><div className="container proof-inner"><span>BUILT FOR DOCUMENTS THAT SHAPE OUR LIVES</span><div className="proof-items"><b>RESIDENTS</b><b>LEGAL AID</b><b>PUBLIC SERVICE</b><b>SHARED AGREEMENTS</b></div></div></section>

      <section className="intro-section container"><span className="section-kicker">/ A BETTER FIRST READ</span><div className="intro-grid"><h2>Legal clarity<br /><i>without the guesswork.</i></h2><div><p>Public notices can be legally valid and still practically unusable. LexisGuide turns hidden deadlines, missing appeal paths, and confusing clauses into structured, reviewable next steps.</p><a href="#workflow" className="under-link">Discover the workflow <Arrow /></a></div></div></section>

      <section className="feature-section" id="features"><div className="container"><span className="section-kicker light">/ ONE PLACE TO UNDERSTAND, REVIEW, IMPROVE</span><div className="feature-list">{features.map((feature) => <article className="feature-row" key={feature.number}><span className="feature-number">{feature.number}</span><div className="feature-icon">{feature.icon}</div><div><h3>{feature.title}</h3><p>{feature.text}</p></div><span className="feature-arrow">↗</span></article>)}</div></div></section>

      <section className="workflow-section container" id="workflow"><div className="workflow-copy"><span className="section-kicker">/ FROM CONFUSION TO A NEXT STEP</span><h2>One upload.<br /><i>More certainty.</i></h2><p>LexisGuide extracts the facts, runs deterministic clarity checks, and gives each person a review trail they can follow.</p><button className="primary-button" onClick={start}>Analyze a document <Arrow /></button></div><div className="workflow-visual"><div className="workflow-header"><span>PROCEDURAL CLARITY</span><b>LIVE</b></div><div className="workflow-score"><strong>81</strong><span>/100<br /><small>after revision</small></span></div><div className="workflow-line"><i /><i /><i /><i className="orange-line" /></div><div className="workflow-meta"><span>✓ deadline added</span><span>✓ appeal path added</span><span>✓ plain language</span></div><div className="workflow-footer">v1 → v2 → v3 <span>review chain ↗</span></div></div></section>

      <section className="security-section" id="security"><div className="container security-grid"><div><span className="section-kicker light">/ PRIORITY TO TRUST</span><h2>Useful AI.<br /><i>Visible reasoning.</i></h2><p>LexisGuide helps people move faster without asking them to trust a black box. Human decisions stay human, and every meaningful change stays connected to its source.</p><button className="light-button" onClick={() => setToast('Review chain: document → evidence → rule → person → report.')}>See the review chain <Arrow /></button></div><div className="trust-cards"><div><span>01</span><b>Evidence-linked findings</b><small>Every flag leads back to the document.</small></div><div><span>02</span><b>Human-in-the-loop</b><small>Approve, override, revise, and decide.</small></div><div><span>03</span><b>Verifiable history</b><small>Versions, rules, and reviewer actions stay connected.</small></div></div></div></section>

      <section className="faq-section container" id="faq"><div className="faq-heading"><span className="section-kicker">/ QUESTIONS, ANSWERED</span><h2>Good questions<br /><i>deserve clear answers.</i></h2></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className={`faq-item ${openFaq === index ? 'is-open' : ''}`} key={question}><button onClick={() => setOpenFaq(openFaq === index ? null : index)}><span><em>0{index + 1}</em>{question}</span><b>{openFaq === index ? '−' : '+'}</b></button>{openFaq === index && <p>{answer}</p>}</div>)}</div></section>

      <section className="closing-section container"><span className="hero-kicker"><span /> LEXISGUIDE · DECISION SUPPORT, NOT LEGAL ADVICE</span><h2>Government documents should not require a lawyer just to understand the <i>next step.</i></h2><button className="primary-button" onClick={start}>Start with a document <Arrow /></button></section>
    </main>

    <footer className="site-footer container"><a className="wordmark" href="#top"><span className="wordmark-symbol">L</span>LexisGuide</a><span>Make due process understandable, reviewable, and verifiable.</span><span>© 2026 LexisGuide</span></footer>
    {toast && <button className="toast" onClick={() => setToast('')}>{toast}<b>×</b></button>}
  </div>
}

export default App
