import { useWorkspace } from '../store'
import { PASS_SCORE, reviewVersions } from '../data'
import { ScoreTrend } from '../charts'
import { Card, PageHeader } from '../ui'
import { ChainHistory } from './ChainHistory'

export function ActivityView() {
  const ws = useWorkspace()
  const uploads = ws.documents.filter((doc) => doc.id.startsWith('upload-'))
  const first = reviewVersions[0].score
  const last = reviewVersions[reviewVersions.length - 1].score

  return (
    <div className="ws-page ws-activity">
      <PageHeader eyebrow="Your workspace" title="Activity" description="How documents improved over time, and every change recorded on the blockchain." />

      <ChainHistory />

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

    </div>
  )
}
