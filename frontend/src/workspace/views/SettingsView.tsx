import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '../store'
import { profileActivity } from '../data'
import { WeeklyBars } from '../charts'
import { Card, PageHeader } from '../ui'
import { getLawyerVerification, verifyLawyer, VerificationError, type LawyerVerification } from '../api'

const US_JURISDICTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
]

/** Bar verification: one per account, three attempts, then support takes over. */
function LawyerVerificationCard() {
  const ws = useWorkspace()
  const [state, setState] = useState<LawyerVerification | null>(null)
  const [barNumber, setBarNumber] = useState('')
  const [jurisdiction, setJurisdiction] = useState('CA')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const [providerFault, setProviderFault] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(() => {
    getLawyerVerification()
      .then((value) => {
        setState(value)
        // Only ever locks. A refresh must not reopen the form after the API has
        // said the attempts are gone, whatever a stale read reports.
        if (value.attempts_remaining === 0 && !value.verified) setLocked(true)
      })
      .catch(() => setLoadFailed(true))
  }, [])

  useEffect(load, [load])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setProviderFault(false)
    try {
      const verified = await verifyLawyer(barNumber, jurisdiction)
      setState(verified)
      setBarNumber('')
    } catch (caught) {
      const failure = caught as VerificationError
      setError(failure.message || 'That bar record could not be checked right now.')
      setLocked(Boolean(failure.locked))
      setProviderFault(Boolean(failure.providerFault))
      // A spent provider allowance costs no attempt, so re-read the real balance
      // rather than assuming this try counted.
      load()
    } finally {
      setBusy(false)
    }
  }

  if (loadFailed) {
    return (
      <Card title="Verify your bar licence" id="bar-title">
        <p className="ws-muted">Verification is unavailable right now. Please try again later.</p>
      </Card>
    )
  }

  if (state?.verified) {
    return (
      <Card title="Bar licence" id="bar-title">
        <p className="ws-verified" role="status">
          <strong>Verified attorney</strong>
          <span>
            {state.name ? `${state.name} · ` : ''}{state.jurisdiction} bar #{state.bar_number}
            {state.admitted_on ? ` · admitted ${state.admitted_on}` : ''}
          </span>
        </p>
        <p className="ws-muted">
          Checked against the {state.jurisdiction} bar directory through lawfirm.dev
          {state.verified_at ? ` on ${new Date(state.verified_at).toLocaleDateString()}` : ''}.
          Bar directories are refreshed monthly, so this reflects the most recent published record.
        </p>
      </Card>
    )
  }

  const remaining = state?.attempts_remaining ?? 3

  return (
    <Card title="Verify your bar licence" id="bar-title">
      <p className="ws-muted">
        Practising attorneys can confirm their licence against the state bar directory. You can
        verify once, and you have {remaining} of {state?.max_attempts ?? 3} attempts left.
      </p>

      {locked ? (
        <div className="ws-alert is-critical" role="alert">
          <strong>Verification locked</strong>
          <span>{error || 'You have used all three verification attempts.'}</span>
          <button type="button" className="ws-btn ws-btn-green" onClick={() => ws.askAssistant('I have used all three bar verification attempts and need support to verify my licence manually.')}>
            Contact support in chat
          </button>
          {/* The API's own message names the email, so only add it when there is none. */}
          {!error && <small>Email support@lexisguide.app to have your bar record reviewed.</small>}
        </div>
      ) : (
        <form className="ws-verify-form" onSubmit={submit}>
          <label className="ws-field">
            <span>Bar number</span>
            <input
              required
              value={barNumber}
              onChange={(event) => setBarNumber(event.target.value)}
              placeholder="1234567"
              aria-label="Bar number"
              maxLength={40}
              disabled={busy}
            />
          </label>
          <label className="ws-field">
            <span>Jurisdiction</span>
            <select
              value={jurisdiction}
              onChange={(event) => setJurisdiction(event.target.value)}
              aria-label="Jurisdiction"
              disabled={busy}
            >
              {US_JURISDICTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <button type="submit" className="ws-btn ws-btn-green" disabled={busy || !barNumber.trim()}>
            {busy ? 'Checking the bar directory…' : 'Verify licence'}
          </button>
          {error && (
            <p className={`ws-alert ${providerFault ? 'is-warning' : 'is-critical'}`} role="alert">{error}</p>
          )}
        </form>
      )}
    </Card>
  )
}

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
        <LawyerVerificationCard />
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
