import { useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { actionLabel, adminApi, formatDate, type AuditEntry } from '../api'
import { useAdminData } from '../hooks'
import { Empty, ErrorNote, Spinner } from '../ui'

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) return <Empty>No admin actions yet. Every change made here is recorded.</Empty>
  return (
    <ol className="adm-audit">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`}>
          <time dateTime={entry.at}>{formatDate(entry.at, true)}</time>
          <div>
            <p><strong>{actionLabel(entry.action)}</strong> · {entry.target}</p>
            <p className="adm-muted">by {entry.actor_email || entry.actor_id}{entry.detail ? ` · ${entry.detail}` : ''}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function AuditView() {
  const fetchAudit = useCallback(() => adminApi.audit(), [])
  const { data: entries, error, reload: load } = useAdminData(fetchAudit)

  return (
    <section className="adm-panel">
      <div className="adm-panel-head">
        <div>
          <h2>Audit log</h2>
          <p className="adm-muted">Every admin change, newest first. Entries are kept for a year.</p>
        </div>
        <button type="button" className="adm-btn" onClick={load}><RefreshCw size={14} aria-hidden="true" /> Refresh</button>
      </div>
      {error ? <ErrorNote message={error} onRetry={load} /> : entries ? <AuditList entries={entries} /> : <Spinner />}
    </section>
  )
}
