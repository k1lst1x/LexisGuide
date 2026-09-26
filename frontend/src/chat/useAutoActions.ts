/* When the person told the assistant to do something ("fix it", "add these as
   tasks"), the reply says so, and the app carries it out once. Replies already
   on screen when the chat opened (restored history) never run again. */
import { useEffect, useState } from 'react'
import type { ProposedTask, Turn, WorkspaceAction } from './useAssistantChat'

export function useAutoActions(
  turns: Turn[],
  onWorkspaceAction?: (action: WorkspaceAction) => void,
  onTasks?: (tasks: ProposedTask[]) => void,
) {
  const [handled] = useState(() => new Set(turns.map((turn) => turn.id)))
  useEffect(() => {
    for (const turn of turns) {
      if (handled.has(turn.id)) continue
      handled.add(turn.id)
      if (turn.role !== 'assistant' || !turn.autoApply) continue
      for (const action of turn.workspaceActions ?? []) onWorkspaceAction?.(action)
      if (turn.tasks?.length) onTasks?.(turn.tasks)
    }
  }, [turns, handled, onWorkspaceAction, onTasks])
}

export const ACTION_LABELS: Record<WorkspaceAction, string> = {
  review: 'Re-check this document',
  negotiate: 'Suggest negotiation points',
  rewrite: 'Draft a revision for this issue',
  apply_rewrite: 'Apply the fix',
  resolve: 'Mark current issue resolved',
  create_task: 'Create follow-up task',
}

export const DONE_LABELS: Record<WorkspaceAction, string> = {
  review: 'Re-checked the document',
  negotiate: 'Drafted negotiation points',
  rewrite: 'Drafted a revision',
  apply_rewrite: 'Applied the fix',
  resolve: 'Marked the issue resolved',
  create_task: 'Created a follow-up task',
}
