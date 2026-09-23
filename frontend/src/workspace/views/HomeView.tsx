import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, FileText, Flag, MessageSquare, Plus, Sparkles } from 'lucide-react'
import { useWorkspace } from '../store'
import { PASS_SCORE, SEVERITY, documentDisplayName, documentKind, openFindings } from '../data'
import { FindingsByCategory, ProgressLine, ScoreBars, ScoreMeter } from '../charts'
import { Card, PageHeader, SeverityChip } from '../ui'

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000)
}

function deadlineStatus(date: Date) {
  const days = daysUntil(date)
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'overdue' }
  if (days === 0) return { label: 'Due today', tone: 'urgent' }
  if (days <= 7) return { label: `${days}d left`, tone: 'urgent' }
  return { label: `${days} days left`, tone: 'on-track' }
}

function deadlineMonth(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
}

export function HomeView() {
  const ws = useWorkspace()
  const { stats, documents, resolved } = ws
  const next = stats.next
  const nextOpen = next ? openFindings(next, resolved[next.id]) : []
  const firstDeadline = stats.deadlines[0]
  const name = ws.userEmail ? ws.userEmail.split('@')[0] : ''

  return (
    <div className="ws-page ws-home">
      <PageHeader
        eyebrow={greeting() + (name ? `, ${name}` : '')}
        title="Home"
        description={<>{documents.length} documents · {stats.open.length} open findings · average score {stats.average}</>}
        actions={<>
          <button type="button" className="ws-btn" onClick={() => ws.go('documents')}>View documents</button>
          <button type="button" className="ws-btn ws-btn-dark" onClick={() => ws.setAddOpen(true)}><Plus size={15} /> Add document</button>
        </>}
      />

      {ws.isDemo && (
        <ol className="ws-steps" aria-label="How LexisGuide works">
          <li><button type="button" onClick={() => ws.setAddOpen(true)}><span>1</span><div><strong>Add a document</strong><small>Upload a PDF or Word file, or paste text.</small></div></button></li>
          <li><button type="button" onClick={() => ws.openInReview(ws.selected)}><span>2</span><div><strong>Review the highlights</strong><small>Each flag explains the risk in plain language.</small></div></button></li>
          <li><button type="button" onClick={() => ws.go('team')}><span>3</span><div><strong>Resolve and share</strong><small>Mark items done, then bring in your team.</small></div></button></li>
        </ol>
      )}

      <div className="ws-home-top">
        {next ? (
          <section className="ws-card ws-continue" aria-labelledby="continue-title">
            <div className="ws-continue-main">
              <span className="ws-eyebrow">Needs your attention first</span>
              <h2 id="continue-title">{next.title}</h2>
              <p className="ws-muted">{documentKind(next.type).label} · {next.agency}</p>
              <ul className="ws-continue-list">
                {nextOpen.slice(0, 3).map((finding) => (
                  <li key={finding.id}>
                    <button type="button" onClick={() => ws.openInReview(next, finding.id)}>
                      <SeverityChip severity={finding.severity} />
                      <span>{finding.title}</span>
                      <ArrowRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="ws-btn ws-btn-dark" onClick={() => ws.openInReview(next)}>Resume review <ArrowRight size={15} /></button>
            </div>
            <div className="ws-continue-side">
              <ScoreMeter score={next.score} />
              <ProgressLine done={(resolved[next.id] ?? []).length} total={next.findings.filter((f) => f.severity !== 'pass').length} label="Findings resolved" />
            </div>
          </section>
        ) : (
          <section className="ws-card ws-continue ws-continue-clear">
            <CheckCircle2 size={28} />
            <div><h2>Everything is resolved</h2><p className="ws-muted">Every finding in your workspace is marked resolved. Add a new document to keep going.</p></div>
          </section>
        )}

        <div className="ws-kpis">
          <button type="button" className="ws-kpi" onClick={() => ws.openInReview(stats.open[0]?.doc ?? ws.selected, stats.open[0]?.finding.id)}>
            <Flag size={16} /><span>Open findings</span><strong>{stats.open.length}</strong>
            <small>{stats.critical} high impact</small>
          </button>
          <button type="button" className="ws-kpi" onClick={() => ws.go('documents')}>
            <FileText size={16} /><span>Average score</span><strong>{stats.average}</strong>
            <small>{documents.filter((d) => d.score >= PASS_SCORE).length} of {documents.length} pass</small>
          </button>
          <button type="button" className="ws-kpi" onClick={() => firstDeadline ? ws.openInReview(firstDeadline.doc) : stats.missingDeadline[0] && ws.openInReview(stats.missingDeadline[0])}>
            <CalendarClock size={16} /><span>Next deadline</span>
            <strong>{firstDeadline ? `${Math.max(daysUntil(firstDeadline.date), 0)}d` : '—'}</strong>
            <small>{firstDeadline ? firstDeadline.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No confirmed dates yet'}</small>
          </button>
          <button type="button" className="ws-kpi" onClick={() => ws.go('team')}>
            <MessageSquare size={16} /><span>Open tasks</span><strong>{ws.tasks.filter((t) => !t.completed).length}</strong>
            <small>{ws.comments.length} messages</small>
          </button>
        </div>
      </div>

      <div className="ws-grid-2">
        <Card title="Document scores" subtitle="Lowest first. Click a document to open it." id="scores-title">
          <ScoreBars documents={documents} selectedId={ws.selected.id} resolved={resolved} onSelect={(doc) => ws.openInReview(doc)} />
          <dl className="ws-score-summary">
            <div><dt>Passing</dt><dd>{documents.filter((d) => d.score >= PASS_SCORE).length}<small>/{documents.length}</small></dd></div>
            <div><dt>Average</dt><dd>{stats.average}</dd></div>
            <div><dt>Lowest gap to pass</dt><dd>{Math.max(0, PASS_SCORE - Math.min(...documents.map((d) => d.score)))}<small> pts</small></dd></div>
          </dl>
        </Card>
        <Card title="Open findings by category" subtitle="Where documents most often fall short." id="categories-title">
          <FindingsByCategory documents={documents} resolved={resolved} onPick={(category) => {
            const hit = stats.open.find((item) => item.finding.category === category)
            if (hit) ws.openInReview(hit.doc, hit.finding.id)
          }} />
        </Card>
      </div>

      <div className="ws-grid-2">
        <Card
          className="ws-deadlines-card"
          title="Deadlines"
          subtitle={`${stats.deadlines.length} confirmed date${stats.deadlines.length === 1 ? '' : 's'} · ${stats.missingDeadline.length} need${stats.missingDeadline.length === 1 ? 's' : ''} clarification`}
          action={<button type="button" className="ws-link" onClick={() => firstDeadline ? ws.openInReview(firstDeadline.doc) : ws.go('documents')}>Review <ArrowRight size={13} /></button>}
          id="deadlines-title"
        >
          {(stats.deadlines.length > 0 || stats.missingDeadline.length > 0) && (
            <div className="ws-deadline-overview">
              <CalendarDays size={16} aria-hidden="true" />
              <span><strong>{stats.deadlines.length}</strong> confirmed</span>
              {stats.missingDeadline.length > 0 && <span className="ws-deadline-missing"><AlertTriangle size={13} aria-hidden="true" /><strong>{stats.missingDeadline.length}</strong> need review</span>}
            </div>
          )}
          <ul className="ws-deadline-list">
            {stats.deadlines.map(({ doc, date }) => (
              <li key={doc.id}>
                <button type="button" onClick={() => ws.openInReview(doc)}>
                  <span className="ws-deadline-date"><b>{date.toLocaleDateString('en-US', { day: 'numeric' })}</b><small>{deadlineMonth(date)}</small></span>
                  <span className="ws-deadline-copy"><strong>{documentDisplayName(doc)}</strong><small>Confirmed deadline · {doc.deadlineConfidence ?? 'unknown'} confidence</small></span>
                  <span className={`ws-deadline-status is-${deadlineStatus(date).tone}`}>{deadlineStatus(date).label}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
            {stats.missingDeadline.map((doc) => (
              <li key={`missing-${doc.id}`}>
                <button type="button" onClick={() => ws.openInReview(doc, doc.findings.find((f) => /deadline/i.test(f.title + f.category))?.id)}>
                  <span className="ws-deadline-date is-missing"><b>?</b><small>DATE</small></span>
                  <span className="ws-deadline-copy"><strong>{documentDisplayName(doc)}</strong><small>No clear deadline in the document</small></span>
                  <span className="ws-deadline-status is-review">Clarify</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
            {!stats.deadlines.length && !stats.missingDeadline.length && <li className="ws-deadline-empty"><CalendarClock size={17} /><span><strong>No deadlines found yet</strong><small>When a document includes a date, it will appear here.</small></span></li>}
          </ul>
        </Card>
        <Card title="Recent activity" action={<button type="button" className="ws-link" onClick={() => ws.go('chain')}>View all</button>} id="activity-title">
          <ul className="ws-feed">
            {ws.comments.slice(-3).reverse().map((message) => (
              <li key={message.id}><i className="ws-feed-dot" /><div><strong>{message.user}</strong><p>{message.text}</p><small>{message.time}</small></div></li>
            ))}
            {documents.filter((doc) => doc.id.startsWith('upload-')).slice(0, 2).map((doc) => (
              <li key={doc.id}><i className="ws-feed-dot ws-feed-dot-green" /><div><strong>Reviewed {documentDisplayName(doc)}</strong><p>{doc.findings.length} checks · score {doc.score}</p><small>{doc.date}</small></div></li>
            ))}
            <li><i className="ws-feed-dot ws-feed-dot-muted" /><div><strong><Sparkles size={13} /> Updated benefits decision passed review</strong><p>Score rose from 54 to 89 across four versions.</p><small>Sep 14</small></div></li>
          </ul>
        </Card>
      </div>

      <p className="ws-footnote"><span style={{ color: SEVERITY.critical.color }}>●</span> Scores measure clarity and procedural fairness. They are guidance, not legal advice.</p>
    </div>
  )
}
