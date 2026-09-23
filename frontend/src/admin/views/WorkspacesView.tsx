import { useCallback, useState } from 'react'
import { ChevronDown, Search, Trash2, UserMinus } from 'lucide-react'
import { adminApi, formatDate, type AdminWorkspace, type AdminWorkspaceMember } from '../api'
import { useAdminData } from '../hooks'
import { Badge, ConfirmDialog, Empty, ErrorNote, Spinner } from '../ui'

type Props = { notify: (message: string) => void }

type Pending = { title: string; body: string; confirmLabel: string; typeToConfirm?: string; run: () => Promise<void> }

export function WorkspacesView({ notify }: Props) {
  const { data: workspaces, error, reload: load, setData: setWorkspaces } = useAdminData(adminApi.workspaces)
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const needle = filter.trim().toLowerCase()
  const shown = (workspaces ?? []).filter((workspace) =>
    !needle || workspace.name.toLowerCase().includes(needle) || workspace.owner_email.toLowerCase().includes(needle))

  const confirmDelete = (workspace: AdminWorkspace) => setPending({
    title: 'Delete this workspace?',
    body: `“${workspace.name}” and its ${workspace.member_count} membership${workspace.member_count === 1 ? '' : 's'} will be removed. Members keep their own documents. This cannot be undone.`,
    confirmLabel: 'Delete workspace',
    typeToConfirm: workspace.name,
    run: async () => {
      await adminApi.deleteWorkspace(workspace.id)
      setWorkspaces((current) => current?.filter((item) => item.id !== workspace.id) ?? null)
      if (open === workspace.id) setOpen(null)
      notify(`Deleted “${workspace.name}”.`)
    },
  })

  return (
    <section className="adm-panel">
      <div className="adm-panel-head">
        <div>
          <h2>Shared workspaces</h2>
          <p className="adm-muted">{workspaces ? `${workspaces.length} in total` : 'Every workspace, whoever hosts it.'}</p>
        </div>
        <label className="adm-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" placeholder="Filter by name or host" aria-label="Filter workspaces" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
      </div>

      {error && <ErrorNote message={error} onRetry={load} />}
      {!workspaces && !error && <Spinner label="Loading workspaces" />}
      {workspaces && !shown.length && <Empty>{needle ? 'No workspace matches that filter.' : 'No shared workspaces yet.'}</Empty>}

      <ul className="adm-ws-list">
        {shown.map((workspace) => (
          <li key={workspace.id} className={open === workspace.id ? 'is-open' : undefined}>
            <div className="adm-ws-row">
              <button
                type="button"
                className="adm-ws-toggle"
                aria-expanded={open === workspace.id}
                onClick={() => setOpen(open === workspace.id ? null : workspace.id)}
              >
                <ChevronDown size={16} aria-hidden="true" className="adm-ws-caret" />
                <span>
                  <span className="adm-strong">{workspace.name}</span>
                  <span className="adm-muted">
                    Hosted by {workspace.owner_email || 'unknown'} · {workspace.member_count} member{workspace.member_count === 1 ? '' : 's'} · {formatDate(workspace.created_at)}
                  </span>
                </span>
              </button>
              <button type="button" className="adm-icon-btn is-danger" aria-label={`Delete ${workspace.name}`} onClick={() => confirmDelete(workspace)}>
                <Trash2 size={15} />
              </button>
            </div>
            {open === workspace.id && (
              <WorkspaceMembers
                workspace={workspace}
                onRemove={(member, done) => setPending({
                  title: 'Remove this member?',
                  body: `${member.email || member.user_id} will lose access to “${workspace.name}”.`,
                  confirmLabel: 'Remove member',
                  run: async () => {
                    await adminApi.removeMember(workspace.id, member.user_id)
                    setWorkspaces((current) => current?.map((item) => (item.id === workspace.id ? { ...item, member_count: item.member_count - 1 } : item)) ?? null)
                    done()
                    notify(`Removed ${member.email || 'member'} from “${workspace.name}”.`)
                  },
                })}
              />
            )}
          </li>
        ))}
      </ul>

      {pending && (
        <ConfirmDialog
          title={pending.title}
          body={<p>{pending.body}</p>}
          confirmLabel={pending.confirmLabel}
          typeToConfirm={pending.typeToConfirm}
          danger
          onConfirm={pending.run}
          onClose={() => setPending(null)}
        />
      )}
    </section>
  )
}

type MembersProps = {
  workspace: AdminWorkspace
  onRemove: (member: AdminWorkspaceMember, done: () => void) => void
}

function WorkspaceMembers({ workspace, onRemove }: MembersProps) {
  const fetchMembers = useCallback(() => adminApi.workspaceMembers(workspace.id), [workspace.id])
  const { data: members, error, reload: load, setData: setMembers } = useAdminData(fetchMembers)

  return (
    <div className="adm-ws-members">
      {workspace.linked_document_title && <p className="adm-muted">Linked document: {workspace.linked_document_title}</p>}
      {error && <ErrorNote message={error} onRetry={load} />}
      {!members && !error && <Spinner label="Loading members" />}
      {members && (
        <ul className="adm-list">
          {members.map((member) => (
            <li key={member.user_id}>
              <span>
                <span className="adm-strong">{member.email || member.name || member.user_id}</span>
                <span className="adm-muted"> · joined {formatDate(member.joined_at)}</span>
              </span>
              {member.role === 'owner'
                ? <Badge tone="green">Host</Badge>
                : (
                  <button
                    type="button"
                    className="adm-btn is-small"
                    onClick={() => onRemove(member, () => setMembers((current) => current?.filter((item) => item.user_id !== member.user_id) ?? null))}
                  >
                    <UserMinus size={14} aria-hidden="true" /> Remove
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
