import { useState } from 'react'
import { useWorkspace } from '../store'
import { profileActivity } from '../data'
import { WeeklyBars } from '../charts'
import { Card, PageHeader } from '../ui'

function Toggle({ label, detail, initial }: { label: string; detail: string; initial: boolean }) {
  const [on, setOn] = useState(initial)
  return (
    <div className="ws-toggle-row">
      <div><strong>{label}</strong><small>{detail}</small></div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ws-switch ${on ? 'is-on' : ''}`} onClick={() => setOn((v) => !v)}><i /></button>
    </div>
  )
}

export function SettingsView() {
  const ws = useWorkspace()
  const [activeDay, setActiveDay] = useState<number | null>(null)
  const total = profileActivity.reduce((sum, day) => sum + day.minutes, 0)
  const shown = activeDay === null ? total : profileActivity[activeDay].minutes

  return (
    <div className="ws-page ws-settings">
      <PageHeader eyebrow="Account" title="Settings" description="Your account, review preferences, and notifications." />

      <div className="ws-grid-3">
        <Card title="Account" id="account-title">
          <label className="ws-field"><span>Email</span><input readOnly value={ws.userEmail || 'Not signed in'} aria-label="Email" /></label>
          <label className="ws-field"><span>Sign-in</span><input readOnly value="AWS Cognito (us-east-1)" aria-label="Authentication" /></label>
        </Card>
        <Card title="Review preferences" id="prefs-title">
          <label className="ws-field"><span>Default rule pack</span>
            <select aria-label="Default rule pack" defaultValue="federal">
              <option value="federal">US Federal – Administrative Procedures</option>
              <option value="il-housing">State Housing – Illinois</option>
              <option value="lease">Lease Agreement – Standard</option>
            </select>
          </label>
          <label className="ws-field"><span>Suggested rewrites</span>
            <select aria-label="Suggested rewrites" defaultValue="prompt">
              <option value="prompt">Ask before applying</option>
              <option value="off">Don't suggest rewrites</option>
            </select>
          </label>
        </Card>
        <Card title="Notifications" id="notify-title">
          <Toggle label="New findings" detail="Email me when a review finds something." initial={false} />
          <Toggle label="Workspace activity" detail="Messages, tasks, and invites." initial />
          <Toggle label="Review trail updates" detail="When a new version is fingerprinted." initial />
        </Card>
      </div>

      <section className="ws-card" aria-labelledby="time-title">
        <header className="ws-card-head">
          <div><h2 id="time-title">Time in review</h2><p>Minutes spent reading, checking, and resolving findings this week.</p></div>
          <div className="ws-stat"><strong>{shown}</strong><span>{activeDay === null ? 'min this week' : `${profileActivity[activeDay].label} minutes`}</span></div>
        </header>
        <WeeklyBars data={profileActivity} active={activeDay} onActive={setActiveDay} />
        <div className="ws-card-foot"><span className="ws-muted">Activity stays private to this workspace.</span><button type="button" className="ws-link" onClick={() => setActiveDay(null)}>Show weekly total</button></div>
      </section>
    </div>
  )
}
