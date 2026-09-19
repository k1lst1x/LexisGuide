import { useEffect, useState } from 'react'

import { AuthModal } from './AuthModal'

const capabilities = [
  ['01', 'Spot what matters', 'Turn a dense notice into the decision, deadline, and next action in one calm view.'],
  ['02', 'Follow the source', 'See the exact clause, public rule, or evidence span behind every recommendation.'],
  ['03', 'Move with confidence', 'Build a private record of questions, replies, and the steps you have already taken.'],
]

const faqs = [
  ['What kinds of documents can LexisGuide read?', 'Notices, letters, agreements, policies, benefits decisions, and other documents that deserve a clearer first read.'],
  ['Does LexisGuide replace a lawyer?', 'No. It helps you understand a document and prepare better questions. It is not legal advice or a substitute for professional counsel.'],
  ['Where does the explanation come from?', 'Each result is designed to point back to relevant language in your document and the source material used to explain it.'],
  ['Can I save my work for later?', 'Yes. Your workspace keeps the document, notes, key dates, and evidence trail together for future review.'],
]

function Arrow() { return <span aria-hidden="true">↗</span> }

function App() {
  const [authOpen, setAuthOpen] = useState(false)
  const [activeCapability, setActiveCapability] = useState(0)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [toast, setToast] = useState('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')),
      { threshold: .14 },
    )
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  const start = () => setAuthOpen(true)

  return <div className="reference-shell">
    <header className="reference-nav">
      <a className="wordmark" href="#top" aria-label="LexisGuide home"><span className="wordmark-mark">L</span><span>LexisGuide</span></a>
      <nav aria-label="Primary navigation"><a href="#how-it-works">How it works</a><a href="#trust">Trust</a><a href="#questions">FAQ</a></nav>
      <button className="nav-login" onClick={start}>Sign in <Arrow /></button>
    </header>

    <main id="top">
      <section className="architecture-hero">
        <div className="architecture-scene" aria-hidden="true">
          <div className="scene-sun" />
          <div className="scene-wall scene-wall-left" /><div className="scene-wall scene-wall-back" />
          <div className="scene-roof" /><div className="scene-floor" />
          <div className="scene-column column-a" /><div className="scene-column column-b" /><div className="scene-column column-c" />
          <div className="scene-garden"><i /><i /><i /><i /><i /><i /></div>
          <div className="clarity-orb"><span>§</span><small>CLARITY</small></div>
        </div>
        <div className="hero-copy"><p className="micro-label">THE CLARITY LAYER FOR REAL-WORLD DECISIONS</p><h1>Understand the<br /><em>fine print.</em></h1><p>LexisGuide turns complicated letters and legal documents into a clear path: what changed, what matters, and what you can do next.</p><button className="black-button" onClick={start}>Start your first review <Arrow /></button></div>
        <div className="hero-foot"><p>Evidence-led explanations for the documents that shape your life.</p><div><span>Clear next steps</span><span>Private workspace</span></div></div>
      </section>

      <section className="logo-strip reveal"><p>Built for people who need a better first read</p><div><b>NOTICES</b><b>AGREEMENTS</b><b>DECISIONS</b><b>POLICIES</b><b>APPEALS</b></div></section>

      <section className="intro-panel reveal" id="how-it-works"><p className="micro-label">A CALMER WAY TO START</p><h2>Complex documents should not<br /><em>hide the important part.</em></h2><p className="intro-copy">Read a document with a system that surfaces deadlines, explains unfamiliar language, and keeps the evidence close enough to inspect.</p><button className="text-button" onClick={() => setToast('Your guided review is ready to begin.')}>Explore the workflow <Arrow /></button></section>

      <section className="capability-panel reveal">
        <h2><em>Make legal information</em><br />usable at first glance.</h2>
        <div className="capability-grid">
          {capabilities.map(([number, title, body], index) => <button className={`capability-card capability-${index} ${activeCapability === index ? 'selected' : ''}`} key={title} onClick={() => setActiveCapability(index)}>
            <span className="card-number">{number}</span><div className="card-visual"><i /><i /><i /></div><h3>{title}</h3><p>{body}</p><span className="card-arrow"><Arrow /></span>
          </button>)}
        </div>
      </section>

      <section className="trust-panel reveal" id="trust"><div className="trust-copy"><p className="micro-label">TRUST IS PART OF THE PRODUCT</p><h2>Every answer should show<br /><em>its work.</em></h2><p>LexisGuide keeps the explanation, source span, and next question in one place—so you are never asked to trust a black box.</p><button className="black-button" onClick={() => setToast('Source trail opened.')}>See the source trail <Arrow /></button></div><div className="source-sculpture" aria-hidden="true"><div className="source-plinth" /><div className="source-stone"><span>01</span></div><div className="source-orbit orbit-one" /><div className="source-orbit orbit-two" /><div className="source-chip chip-one">Clause</div><div className="source-chip chip-two">Rule</div><div className="source-chip chip-three">Date</div></div></section>

      <section className="dark-panel reveal"><p className="micro-label">ONE WORKSPACE, FROM FIRST READ TO NEXT STEP</p><h2><em>Designed for clarity,</em> without<br />making the process feel heavier.</h2><div className="dark-grid"><article><span>01</span><h3>Read</h3><p>See a calm, structured summary before you lose time in the details.</p></article><article><span>02</span><h3>Check</h3><p>Open the exact language and supporting source behind a key point.</p></article><article><span>03</span><h3>Act</h3><p>Keep your notes, deadlines, and next questions together.</p></article></div><button className="white-button" onClick={start}>Create a workspace <Arrow /></button></section>

      <section className="faq-panel reveal" id="questions"><div><p className="micro-label">FREQUENTLY ASKED QUESTIONS</p><h2>Questions deserve<br /><em>clear answers.</em></h2></div><div className="faq-list">{faqs.map(([question, answer], index) => <article className={openFaq === index ? 'open' : ''} key={question}><button onClick={() => setOpenFaq(openFaq === index ? null : index)}><span>{question}</span><b>{openFaq === index ? '−' : '+'}</b></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <section className="final-panel reveal"><div className="final-orb" aria-hidden="true" /><p className="micro-label">A BETTER FIRST READ STARTS HERE</p><h2>Make the next<br /><em>step clearer.</em></h2><p>Bring one document. Leave with a map of what to notice and what to do.</p><button className="black-button" onClick={start}>Start a free review <Arrow /></button></section>
    </main>

    <footer><span>© 2026 LexisGuide</span><span>Evidence-first document clarity</span><span>Not legal advice</span></footer>
    {toast && <button className="toast" onClick={() => setToast('')}>{toast}<b>×</b></button>}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={(email) => { setAuthOpen(false); setToast(`Welcome, ${email}. Your workspace is ready.`) }} />}
  </div>
}

export default App
