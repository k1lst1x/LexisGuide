import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Ban,
  CalendarClock,
  Check,
  ChevronDown,
  FileText,
  Fingerprint,
  KeyRound,
  ListChecks,
  MessageSquareText,
  Plus,
  Quote,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import treesBg from '@/assets/meadow_bg.webp'
import { Birds, Pollen, WindScene } from './WindScene'
import './landing.css'

type LandingProps = {
  userEmail?: string
  onOpenWorkspace: () => void
  onSignIn: () => void
  onSignOut: () => void
}

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 26C6 15 13 6 27 5c-1 13-9 21-21 21Z" fill="currentColor" />
      <path d="M9 23c4-5 8-9 14-13" stroke="var(--lp-cream, #fffaeb)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/* ───── Reveal-on-scroll ───── */
function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll('.lp-reveal')
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      }),
      { threshold: 0.14, rootMargin: '0px 0px -60px 0px' },
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])
}

/* ───── Streams an answer word by word; remounts per tab so it restarts ───── */
function useStream(text: string, speed = 28) {
  const [count, setCount] = useState(0)
  const total = text.split(' ').length
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCount((value) => {
        if (value >= total) window.clearInterval(timer)
        return Math.min(value + 1, total)
      })
    }, speed)
    return () => window.clearInterval(timer)
  }, [total, speed])
  return { shown: text.split(' ').slice(0, count).join(' '), done: count >= total }
}

function AskPane() {
  const answer = 'Your supplemental assistance stops on October 1, 2026. You can appeal, but the letter only says “within a reasonable timeframe”, with no exact deadline. That is a due-process gap, so ask the agency for the date in writing.'
  const { shown, done } = useStream(answer)
  return (
    <div className="lp-pane lp-pane-ask">
      <div className="lp-bubble-user">What does this benefits letter actually need from me?</div>
      <div className="lp-answer">
        <p>{shown}<span className={`lp-caret ${done ? 'is-done' : ''}`} /></p>
        <div className={`lp-sources ${done ? 'is-in' : ''}`}>
          <span><FileText size={12} /> Notice #8942-B · p.1</span>
          <span><Quote size={12} /> Appeal clause</span>
          <span><ShieldCheck size={12} /> Admin Code § 408</span>
        </div>
      </div>
    </div>
  )
}

const DEMO_TABS = [
  { key: 'ask', label: 'Ask', caption: 'Ask in plain language. Every answer points to the exact line it came from.' },
  { key: 'explain', label: 'Explain', caption: 'Tap any clause to see what it means for you, and why it matters.' },
  { key: 'plan', label: 'Next steps', caption: 'Leave with a checklist and real dates instead of a headache.' },
] as const
type DemoKey = (typeof DEMO_TABS)[number]['key']

function ProductWindow({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const [tab, setTab] = useState<DemoKey>('ask')
  const caption = DEMO_TABS.find((item) => item.key === tab)!.caption

  return (
    <div className="lp-demo">
      <div className="lp-demo-bar">
        <div className="lp-tabs" role="tablist" aria-label="Product preview">
          {DEMO_TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              className={`lp-tab ${tab === item.key ? 'is-active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p key={caption} className="lp-demo-caption">{caption}</p>
      </div>

      <div className="lp-window">
        <aside className="lp-win-side">
          <div className="lp-win-brand"><LogoMark size={18} /> LexisGuide</div>
          <div className="lp-win-nav">
            <span className="is-active"><MessageSquareText size={14} /> New review</span>
            <span><Search size={14} /> Search</span>
            <span><FileText size={14} /> Documents</span>
            <span><CalendarClock size={14} /> Deadlines</span>
          </div>
          <div className="lp-win-label">Recent</div>
          <div className="lp-win-recent">
            <span className="is-active">Benefits notice #8942-B</span>
            <span>Apartment lease renewal</span>
            <span>Contractor agreement</span>
            <span>Parking citation appeal</span>
            <span>Employee handbook, 2026</span>
          </div>
          <div className="lp-win-user">
            <span className="lp-avatar">MR</span>
            <div><strong>Maya R.</strong><small>Personal</small></div>
          </div>
        </aside>

        <div className="lp-win-main">
          {tab === 'ask' && <AskPane />}

          {tab === 'explain' && (
            <div className="lp-pane lp-pane-explain" key="explain">
              <div className="lp-paper">
                <small>Department of Human Services · Division of Benefits</small>
                <h4>Notice of Supplemental Assistance Discontinuation</h4>
                <p>Your application has been evaluated under State Administrative Code § 408. Benefit payments will cease effective October 1, 2026.</p>
                <p>If you disagree with this determination, <mark className="lp-mark-red">you may submit an appeal within a reasonable timeframe</mark> to the regional office.</p>
                <p>Failure to provide <mark className="lp-mark-amber">satisfactory verification of household income</mark> will result in case closure.</p>
              </div>
              <div className="lp-explainer">
                <span className="lp-pill-red">Vague deadline</span>
                <strong>In plain language</strong>
                <p>They haven't said how long you have. Without a date, you could miss your chance to appeal without knowing it.</p>
                <div className="lp-explainer-next"><Sparkles size={13} /> Ask for the exact appeal date in writing.</div>
              </div>
            </div>
          )}

          {tab === 'plan' && (
            <div className="lp-pane lp-pane-plan" key="plan">
              <div className="lp-plan-head">
                <div>
                  <strong>Your action plan</strong>
                  <small>From Notice #8942-B · 3 steps</small>
                </div>
                <button type="button" className="lp-btn-dark lp-btn-sm" onClick={onOpenWorkspace}>Open in workspace</button>
              </div>
              {[
                { t: 'File appeal form DHS-4082', d: 'Within 30 days of the postmark', date: 'Oct 12' },
                { t: 'Gather proof of household income', d: 'Two recent pay stubs or a signed statement', date: 'Oct 5' },
                { t: 'Request continued benefits', d: 'Payments continue during review if you file within 10 days', date: 'Sep 29' },
              ].map((step, index) => (
                <div className="lp-plan-step" key={step.t} style={{ animationDelay: `${index * 110}ms` }}>
                  <span className="lp-check"><Check size={12} /></span>
                  <div><strong>{step.t}</strong><small>{step.d}</small></div>
                  <em>{step.date}</em>
                </div>
              ))}
            </div>
          )}

          <div className="lp-composer">
            <Plus size={16} />
            <span>Ask anything about this document…</span>
            <em>Evidence mode</em>
            <i><ArrowRight size={14} /></i>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───── Feature visuals ───── */
function VisualExplain() {
  return (
    <div className="lp-visual lp-visual-explain">
      <div className="lp-vcard lp-vdoc">
        <small>Residential Lease · Section 14</small>
        <p>Tenant shall be responsible for <mark className="lp-mark-amber">all repairs, regardless of cause</mark>, and landlord may <mark className="lp-mark-red">enter the premises at any time</mark> without notice.</p>
      </div>
      <div className="lp-vcard lp-vtip lp-float-a">
        <span className="lp-pill-red">Unusual term</span>
        <p>Most places require the landlord to give notice before entering, usually 24 hours.</p>
      </div>
      <div className="lp-vcard lp-vtip lp-vtip-b lp-float-b">
        <span className="lp-pill-amber">Worth asking</span>
        <p>“Regardless of cause” could make you pay for repairs you didn't cause.</p>
      </div>
    </div>
  )
}

function VisualDeadlines() {
  return (
    <div className="lp-visual">
      <div className="lp-vcard lp-vtimeline">
        <div className="lp-vhead"><CalendarClock size={15} /> Dates found in 3 documents</div>
        {[
          { d: 'Sep 12', t: 'Notice issued', s: 'Benefits notice · p.1', tone: '' },
          { d: 'Sep 29', t: 'Request continued benefits', s: '10-day window · p.2', tone: 'amber' },
          { d: 'Oct 01', t: 'Payments stop', s: 'Benefits notice · p.1', tone: 'red' },
          { d: 'Oct 12', t: 'Appeal window closes', s: 'Inferred from Code § 408', tone: 'green' },
        ].map((row) => (
          <div className={`lp-vrow ${row.tone}`} key={row.d}>
            <b>{row.d}</b>
            <span><strong>{row.t}</strong><small>{row.s}</small></span>
          </div>
        ))}
      </div>
      <div className="lp-vcard lp-vcount lp-float-a"><strong>21</strong><small>days left to appeal</small></div>
    </div>
  )
}

function VisualTrail() {
  return (
    <div className="lp-visual">
      <div className="lp-vcard lp-vtrail">
        <div className="lp-vhead"><Fingerprint size={15} /> Review trail</div>
        {[
          ['Document received', 'sha256 · e3b0c442…b855'],
          ['4 findings linked to evidence', 'rule pack · civic-fairness 4.2'],
          ['Shared with legal aid advocate', 'same version, verified'],
        ].map(([title, meta], index) => (
          <div className="lp-vtrail-row" key={title}>
            <i className={index === 2 ? 'is-live' : ''} />
            <span><strong>{title}</strong><code>{meta}</code></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VisualPlan() {
  return (
    <div className="lp-visual">
      <div className="lp-vcard lp-vplan">
        <div className="lp-vhead"><ListChecks size={15} /> Next steps · Contractor agreement</div>
        {['Ask to cap the late-payment fee', 'Add a 14-day notice period before termination', 'Get the scope of work attached as Exhibit A'].map((item, i) => (
          <label key={item} className={i === 0 ? 'is-done' : ''}>
            <span className="lp-check"><Check size={11} /></span>{item}
          </label>
        ))}
        <div className="lp-vdraft">
          <small>Suggested wording</small>
          <p>“Either party may end this agreement with fourteen (14) days' written notice.”</p>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  {
    title: 'No legalese left unexplained',
    body: 'Upload a notice, lease or agreement. LexisGuide reads every clause and rewrites the ones that matter in words you would actually use.',
    visual: <VisualExplain />,
  },
  {
    title: 'Catch the deadline buried on page four',
    body: 'Appeal windows, effective dates and response periods are pulled out and put on one timeline, so nothing quietly expires.',
    visual: <VisualDeadlines />,
  },
  {
    title: 'Know exactly what to do next',
    body: 'Every review ends with a short, ordered checklist and suggested wording you can send back, not a wall of warnings.',
    visual: <VisualPlan />,
  },
  {
    title: 'Every review leaves a trail',
    body: 'Findings are tied to the exact phrase and a fingerprint of the document, so you, your advocate and the agency are reading the same version.',
    visual: <VisualTrail />,
  },
]

const SCENARIOS = [
  { who: 'Tenant', q: 'My renewal added a new “amenity fee”. Is that even in the original lease?' },
  { who: 'Benefits recipient', q: 'The letter says my case is closing. How long do I actually have to appeal?' },
  { who: 'Freelancer', q: 'Can they cancel this contract the day before I deliver and not pay me?' },
  { who: 'Legal aid clinic', q: 'We see forty notices a week. Which ones are missing required appeal rights?' },
  { who: 'Small business', q: 'What am I agreeing to if I sign this vendor auto-renewal clause?' },
  { who: 'Public agency', q: 'Will people understand this denial letter before we send ten thousand of them?' },
]

const FAQS = [
  { q: 'What is LexisGuide?', a: 'LexisGuide is an AI guide for legal and government documents. It highlights vague, unusual or risky terms, explains them in plain language and suggests practical next steps, with every finding linked to the text it came from.' },
  { q: 'Is this legal advice?', a: 'No. LexisGuide is decision support, not legal representation. It helps you understand a document and prepare better questions. For an important decision, talk to a qualified lawyer or a legal aid organisation.' },
  { q: 'What kinds of documents can I bring?', a: 'Benefit notices, denials, leases, employment and contractor agreements, public forms and similar documents. You can upload PDF, Word (.docx), HTML or plain text, or paste the text directly.' },
  { q: 'How are findings produced?', a: 'Your document is reviewed by an AI agent grounded in the document itself. Each finding quotes the exact phrase, explains why it matters and names the rule or pattern it checked against.' },
  { q: 'Who can see my documents?', a: 'Only you. Every request is verified with your account token, the service reads only your own records, and the browser never holds cloud credentials. Scripts inside uploaded files never run; only readable text is extracted.' },
  { q: 'Can I try it without an account?', a: 'Yes. Open the workspace to explore sample documents and run a quick local scan on your own text. Create an account to save reviews and share them.' },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="lp-faq-list">
      {FAQS.map((item, index) => (
        <div className={`lp-faq ${open === index ? 'is-open' : ''}`} key={item.q}>
          <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
            {item.q}
            <ChevronDown size={18} />
          </button>
          <div className="lp-faq-a"><p>{item.a}</p></div>
        </div>
      ))}
    </div>
  )
}

export function Landing({ userEmail, onOpenWorkspace, onSignIn, onSignOut }: LandingProps) {
  useReveal()
  const [scrolled, setScrolled] = useState(false)
  const heroRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="lp">
      {/* ───── Navigation ───── */}
      <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <a href="#top" className="lp-logo"><LogoMark /> LexisGuide</a>
        <nav className="lp-nav-links" aria-label="Primary">
          <a href="#product">Product</a><i />
          <a href="#features">Features</a><i />
          <a href="#for-you">Who it's for</a><i />
          <a href="#privacy">Privacy</a><i />
          <a href="#faq">FAQ</a>
        </nav>
        <div className="lp-nav-right">
          {userEmail ? (
            <>
              <button type="button" className="lp-nav-text" onClick={onSignOut}>Sign out</button>
              <button type="button" className="lp-btn-dark lp-btn-sm" onClick={onOpenWorkspace}>Open workspace</button>
            </>
          ) : (
            <>
              <button type="button" className="lp-nav-text" onClick={onOpenWorkspace}>Try the demo</button>
              <button type="button" className="lp-btn-dark lp-btn-sm" onClick={onSignIn}>Sign In</button>
            </>
          )}
        </div>
      </header>

      {/* ───── Hero ───── */}
      <section className="lp-hero" id="top" ref={heroRef}>
        <div className="lp-hero-copy">
          <h1 className="lp-h1 lp-rise" style={{ animationDelay: '60ms' }}>Your plain-language{' '}<br />guide to legal documents</h1>
          <p className="lp-hero-sub lp-rise" style={{ animationDelay: '180ms' }}>
            LexisGuide reads notices, denials and agreements, flags the terms that could hurt you, and tells you exactly what to do next.
          </p>
          <div className="lp-rise" style={{ animationDelay: '300ms' }}>
            <button type="button" className="lp-btn-dark lp-btn-lg" onClick={onOpenWorkspace}>
              <Sparkles size={17} /> Review a document free
            </button>
          </div>
          <ul className="lp-trust lp-rise" style={{ animationDelay: '420ms' }}>
            <li><Quote size={14} /> Every finding cites its source</li>
            <li><KeyRound size={14} /> Private to your account</li>
            <li><Fingerprint size={14} /> Verifiable review trail</li>
            <li><ShieldCheck size={14} /> Decision support, not legal advice</li>
          </ul>
        </div>

        <div className="lp-stage" id="product">
          <div className="lp-stage-scene">
            <WindScene src={treesBg} focusY={0.55} />
            <div className="lp-rays" />
            <Birds />
            <Pollen />
          </div>
          <div className="lp-stage-window lp-rise" style={{ animationDelay: '520ms' }}>
            <ProductWindow onOpenWorkspace={onOpenWorkspace} />
          </div>
        </div>
      </section>

      {/* ───── Audience strip ───── */}
      <section className="lp-strip lp-reveal">
        <p>Built for the people who receive the paperwork</p>
        <div>
          <span>Tenants</span><span>Benefit recipients</span><span>Freelancers</span><span>Legal aid clinics</span><span>Small businesses</span><span>Public agencies</span>
        </div>
      </section>

      {/* ───── Features ───── */}
      <section className="lp-features" id="features">
        {FEATURES.map((feature, index) => (
          <article className={`lp-feature ${index % 2 ? 'is-flip' : ''}`} key={feature.title}>
            <div className="lp-feature-copy lp-reveal">
              <h2 className="lp-h2">{feature.title}</h2>
              <p>{feature.body}</p>
              <button type="button" className="lp-link" onClick={onOpenWorkspace}>Try it on a document <ArrowRight size={15} /></button>
            </div>
            <div className="lp-feature-art lp-reveal">{feature.visual}</div>
          </article>
        ))}
      </section>

      {/* ───── Privacy ───── */}
      <section className="lp-privacy" id="privacy">
        <div className="lp-privacy-head lp-reveal">
          <h2 className="lp-h2">Documents this personal have to be this private.</h2>
          <p>Your notices and agreements say a lot about your life. LexisGuide is built so they stay yours.</p>
        </div>
        <div className="lp-privacy-grid">
          {[
            { icon: <KeyRound size={20} />, t: 'Only you can read them', d: 'Every request is verified with your account token, and the service reads only your own records.' },
            { icon: <ShieldCheck size={20} />, t: 'No keys in the browser', d: 'The app never receives cloud credentials. The AI agent runs server-side under its own locked-down role.' },
            { icon: <Ban size={20} />, t: 'Uploads stay inert', d: 'Scripts and embedded content in uploaded files never run. LexisGuide extracts the readable text only.' },
            { icon: <Quote size={20} />, t: 'Evidence, not guesses', d: 'Findings quote the exact phrase they are about, so you can check every claim yourself.' },
          ].map((item) => (
            <div className="lp-privacy-card lp-reveal" key={item.t}>
              <span className="lp-privacy-icon">{item.icon}</span>
              <h3>{item.t}</h3>
              <p>{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Scenarios ───── */}
      <section className="lp-for" id="for-you">
        <h2 className="lp-h2 lp-center lp-reveal">Made for the letters{' '}<br />that keep you up at night</h2>
        <div className="lp-for-grid">
          {SCENARIOS.map((item, index) => (
            <figure className="lp-for-card lp-reveal" key={item.who} style={{ transitionDelay: `${(index % 3) * 80}ms` }}>
              <Quote size={18} className="lp-for-quote" />
              <blockquote>{item.q}</blockquote>
              <figcaption>{item.who}</figcaption>
            </figure>
          ))}
        </div>
        <div className="lp-formats lp-reveal">
          <span>Bring whatever you were sent</span>
          <b>PDF</b><b>Word</b><b>HTML</b><b>Plain text</b><b>Pasted text</b>
        </div>
      </section>

      {/* ───── FAQ ───── */}
      <section className="lp-faq-wrap" id="faq">
        <h2 className="lp-h2 lp-center lp-reveal">Frequently asked questions</h2>
        <div className="lp-reveal"><Faq /></div>
      </section>

      {/* ───── Closing CTA ───── */}
      <section className="lp-cta">
        <div className="lp-cta-scene">
          <WindScene src={treesBg} focusY={0.75} />
          <Birds />
          <Pollen count={18} />
        </div>
        <div className="lp-cta-copy lp-reveal">
          <h2 className="lp-h1 lp-h1-cta">Read every notice{' '}<br />with confidence</h2>
          <p>Start with a sample, or bring your own document. No account needed to try.</p>
          <button type="button" className="lp-btn-dark lp-btn-lg" onClick={onOpenWorkspace}>
            <Sparkles size={17} /> Review a document free
          </button>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <a href="#top" className="lp-logo"><LogoMark /> LexisGuide</a>
            <p>A plain-language guide for notices, denials, public forms and shared agreements. Built for LexHack 2026.</p>
          </div>
          <div className="lp-footer-col">
            <h4>Product</h4>
            <a href="#product">Overview</a><a href="#features">Features</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a>
          </div>
          <div className="lp-footer-col">
            <h4>Use cases</h4>
            <a href="#for-you">Tenants</a><a href="#for-you">Benefits</a><a href="#for-you">Contracts</a><a href="#for-you">Legal aid</a>
          </div>
          <div className="lp-footer-col">
            <h4>Project</h4>
            <a href="https://github.com/k1lst1x/LexisGuide" target="_blank" rel="noreferrer">GitHub</a>
            <a href="#privacy">Security</a>
            <a href="#faq">Not legal advice</a>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© 2026 LexisGuide. Decision support, not legal representation.</span>
          <span>Made with care for people reading the fine print.</span>
        </div>
      </footer>
    </div>
  )
}
