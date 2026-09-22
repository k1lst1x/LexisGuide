import { Fingerprint } from 'lucide-react'
import { useWorkspace } from '../store'
import { PASS_SCORE, documentDisplayName, reviewVersions } from '../data'
import { ScoreTrend } from '../charts'
import { Card, PageHeader } from '../ui'

export function ActivityView() {
  const ws = useWorkspace()
  const uploads = ws.documents.filter((doc) => doc.id.startsWith('upload-'))
  const first = reviewVersions[0].score
  const last = reviewVersions[reviewVersions.length - 1].score

  return (
    <div className="ws-page ws-activity">
      <PageHeader eyebrow="Your workspace" title="Activity" description="How documents improved over time, and every step in the review trail." />

      <div className="ws-grid-activity">
        <Card title="Benefits decision · score by version" subtitle={`Rose ${last - first} points, from ${first} to ${last}. It crossed the pass line (${PASS_SCORE}) at v4.`} id="trend-title">
          <ScoreTrend points={reviewVersions.map((v) => ({ label: v.v, score: v.score, detail: v.title }))} />
        </Card>
        <Card title="At a glance" id="glance-title">
          <dl className="ws-glance">
            <div><dt>Versions</dt><dd>{reviewVersions.length}</dd></div>
            <div><dt>Points gained</dt><dd>+{last - first}</dd></div>
            <div><dt>Findings resolved</dt><dd>{Object.values(ws.resolved).reduce((sum, list) => sum + list.length, 0)}</dd></div>
            <div><dt>Documents added</dt><dd>{uploads.length}</dd></div>
          </dl>
        </Card>
      </div>

      <Card title="Review trail" subtitle="Each step is fingerprinted, so everyone can confirm they are reading the same version." id="trail-title">
        <ol className="ws-timeline">
          {uploads.map((doc) => (
            <li key={doc.id} className="is-new">
              <span className="ws-timeline-mark">New</span>
              <div>
                <strong>Added {documentDisplayName(doc)}</strong>
                <p>{doc.version} · {doc.findings.length} checks · score {doc.score}/100</p>
                <small>{doc.date}</small>
              </div>
            </li>
          ))}
          {[...reviewVersions].reverse().map((step, index) => (
            <li key={step.v} className={index === 0 ? 'is-current' : ''}>
              <span className="ws-timeline-mark">{step.v}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
                <div className="ws-timeline-meta">
                  <span className={`ws-pill ws-tone-${step.score >= PASS_SCORE ? 'good' : step.score >= 60 ? 'review' : 'risk'}`}>{step.score}/100 · {step.status}</span>
                  {step.hash && <code><Fingerprint size={12} /> {step.hash}</code>}
                  <small>{step.date}</small>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
