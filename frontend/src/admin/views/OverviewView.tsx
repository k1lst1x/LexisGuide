import { adminApi, type IntegrationStatus } from '../api'
import { useAdminData } from '../hooks'
import { Badge, ErrorNote, Spinner } from '../ui'
import { AuditList } from './AuditView'

type Props = { onOpen: (section: 'users' | 'workspaces' | 'audit') => void }

export function OverviewView({ onOpen }: Props) {
  const { data: overview, error, reload } = useAdminData(adminApi.overview)

  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!overview) return <Spinner label="Counting accounts and data" />

  const { users, data } = overview
  const stats = [
    { label: 'Accounts', value: users.total, note: `${users.federated} via Google`, open: 'users' as const },
    { label: 'Disabled', value: users.disabled, note: 'Cannot sign in', open: 'users' as const, tone: users.disabled ? 'amber' : undefined },
    { label: 'Admins', value: users.admins, note: 'In the admins group', open: 'users' as const },
    { label: 'Workspaces', value: data.workspaces, note: 'Shared spaces', open: 'workspaces' as const },
    { label: 'Saved documents', value: data.documents, note: 'Across all accounts' },
    { label: 'Conversations', value: data.conversations, note: 'Assistant chats kept' },
    { label: 'Verified lawyers', value: data.lawyers_verified, note: 'Bar record confirmed' },
    { label: 'Locked verifications', value: data.lawyers_locked, note: 'Out of attempts; need support', open: 'users' as const, tone: data.lawyers_locked ? 'red' : undefined },
  ]

  return (
    <div className="adm-stack">
      <div className="adm-stats">
        {stats.map((stat) => {
          const content = (
            <>
              <span className="adm-stat-label">{stat.label}</span>
              <strong className={`adm-stat-value${stat.tone ? ` is-${stat.tone}` : ''}`}>{stat.value.toLocaleString()}</strong>
              <span className="adm-stat-note">{stat.note}</span>
            </>
          )
          return stat.open
            ? <button key={stat.label} type="button" className="adm-stat is-link" onClick={() => onOpen(stat.open)}>{content}</button>
            : <div key={stat.label} className="adm-stat">{content}</div>
        })}
      </div>

      <Integrations />

      <section className="adm-panel">
        <div className="adm-panel-head">
          <h2>Recent admin activity</h2>
          <button type="button" className="adm-link" onClick={() => onOpen('audit')}>Full audit log</button>
        </div>
        <AuditList entries={overview.recent_actions} />
      </section>
    </div>
  )
}

function IntegrationRow({ name, status }: { name: string; status: IntegrationStatus }) {
  return (
    <li className="adm-integration">
      <div>
        <strong>{name}</strong>
        <p className="adm-muted">{status.detail}</p>
      </div>
      {status.ready ? <Badge tone="green">Ready</Badge> : status.configured ? <Badge tone="red">Needs attention</Badge> : <Badge tone="amber">Not set up</Badge>}
    </li>
  )
}

/** Configuration health for outside services. Checking never uses their quotas. */
function Integrations() {
  const { data, error, reload } = useAdminData(adminApi.integrations)
  return (
    <section className="adm-panel">
      <div className="adm-panel-head">
        <div>
          <h2>Integrations</h2>
          <p className="adm-muted">Checked without calling the providers, so no bar-verification lookups are used.</p>
        </div>
      </div>
      {error ? <ErrorNote message={error} onRetry={reload} /> : !data ? <Spinner /> : (
        <ul className="adm-list">
          <IntegrationRow name="Bar license verification (lawfirm.dev)" status={data.bar_verification} />
          <IntegrationRow name="Document ledger (blockchain)" status={data.document_ledger} />
        </ul>
      )}
    </section>
  )
}
