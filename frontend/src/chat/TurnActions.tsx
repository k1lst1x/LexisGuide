/* What an assistant reply can do in the app: actions to choose, suggested
   tasks to add, or, when the person told it to act, what it already did. */
import { useState } from 'react'
import { Check, ListPlus } from 'lucide-react'
import type { ProposedTask, Turn, WorkspaceAction } from './useAssistantChat'
import { ACTION_LABELS, DONE_LABELS } from './useAutoActions'

type Props = {
  turn: Turn
  /** Class prefix of the host layout: "cw" (popup) or "ac" (assistant page). */
  prefix: 'cw' | 'ac'
  onWorkspaceAction?: (action: WorkspaceAction) => void
  onTasks?: (tasks: ProposedTask[]) => void
}

export function TurnActions({ turn, prefix, onWorkspaceAction, onTasks }: Props) {
  const [added, setAdded] = useState(false)
  if (turn.role !== 'assistant') return null
  const actions = turn.workspaceActions ?? []
  const tasks = turn.tasks ?? []
  if (!actions.length && !tasks.length) return null

  if (turn.autoApply) {
    const done = [
      ...actions.map((action) => DONE_LABELS[action]),
      ...(tasks.length ? [`Added ${tasks.length} task${tasks.length === 1 ? '' : 's'}`] : []),
    ]
    return <p className={`${prefix}-done`} role="status"><Check size={13} aria-hidden="true" /> {done.join(' · ')}</p>
  }

  return (
    <>
      {actions.map((action) => (
        <button key={action} type="button" className={`${prefix}-workspace-action`} onClick={() => onWorkspaceAction?.(action)}>
          {ACTION_LABELS[action]}
        </button>
      ))}
      {tasks.length > 0 && onTasks && (
        <div className={`${prefix}-tasks`}>
          <ul>
            {tasks.map((task) => (
              <li key={task.title}>
                {task.priority && <em className={`is-${task.priority}`}>{task.priority}</em>}
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={`${prefix}-workspace-action`} disabled={added} onClick={() => { onTasks(tasks); setAdded(true) }}>
            {added ? <><Check size={13} aria-hidden="true" /> Added to Tasks</> : <><ListPlus size={13} aria-hidden="true" /> Add {tasks.length === 1 ? 'this task' : `these ${tasks.length} tasks`}</>}
          </button>
        </div>
      )}
    </>
  )
}
