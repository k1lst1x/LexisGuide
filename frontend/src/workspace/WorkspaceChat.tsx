import { ChatWidget } from '../chat/ChatWidget'
import { useWorkspace } from './store'
import { assistantPageGuidance, assistantQuickPrompts, documentDisplayName, openFindings, type NavItem } from './data'

const PAGE: Record<NavItem, string> = { overview: 'Home', assistant: 'AI Assistant', documents: 'Documents', linter: 'Review', chain: 'Activity', team: 'Messages', settings: 'Settings' }

/** The chat popup, given what the person is looking at in the workspace. */
export function WorkspaceChat({ userEmail }: { userEmail?: string }) {
  const ws = useWorkspace()
  const doc = ws.selected
  const open = openFindings(doc, ws.resolved[doc.id])
  const current = ws.activeFinding
  const sectionSummary = ws.nav === 'overview'
    ? `${ws.documents.length} documents, ${ws.stats.open.length} open findings, and ${ws.stats.deadlines.length} detected deadlines.`
    : ws.nav === 'documents'
      ? `${ws.documents.length} documents are available. ${documentDisplayName(doc)} is selected.`
      : ws.nav === 'linter'
        ? `${open.length} open findings in ${documentDisplayName(doc)}. ${current ? `The selected finding is ${current.title}.` : 'No finding is selected.'}`
        : ws.nav === 'team'
          ? `${ws.activeWorkspace ? `${ws.activeWorkspace.name} · ` : ''}${ws.comments.length} messages in the ${ws.activeChannelId} channel and ${ws.members.length} members.`
          : ws.nav === 'chain'
            ? `Activity history for ${documentDisplayName(doc)} is in view.`
            : ws.nav === 'settings'
              ? `Workspace settings are in view. Jurisdiction: ${ws.jurisdiction || 'not set'}.`
              : `AI assistant for ${documentDisplayName(doc)}.`

  // Answers grounded in the workspace when the live agent is unavailable.
  const fallback = (question: string) => {
    const q = question.toLowerCase()
    if (/where|navigate|page|screen|how do i|how can i/.test(q)) return `${assistantPageGuidance[ws.nav]} You are on **${PAGE[ws.nav]}**.`
    if (/highlight|flag|issue|wrong|risk|finding|deadline|evidence|explain|mean/.test(q)) {
      const finding = current && current.severity !== 'pass' ? current : open[0]
      return finding
        ? `The current review point is **${finding.title}**. ${finding.explanation}\n\n**Next step:** ${finding.negotiationPoint || 'ask the sender to correct this in writing.'} The highlighted passage is in Review.`
        : `There are no open findings in ${documentDisplayName(doc)}.`
    }
    if (/score|rating|health/.test(q)) return `**${documentDisplayName(doc)}** scores ${doc.score}/100 (pass line 80), with ${open.length} open finding${open.length === 1 ? '' : 's'}.`
    if (/first|urgent|priority/.test(q) && ws.stats.next) return `Start with **${documentDisplayName(ws.stats.next)}**: it has the most urgent open findings. Open it in Review and work down the queue.`
    if (/message|task|team|share/.test(q)) return 'Use **Discuss** on a finding to draft a team message, or **Create task** to add it to Messages → Tasks. Nothing is sent until you press Send.'
    return `${assistantPageGuidance[ws.nav]} I can explain a clause, summarise open findings, or suggest what to do next.`
  }

  return (
    <ChatWidget
      // In Messages the launcher shrinks to an icon beside the conversation, so it never covers Send.
      className={`cw-in-workspace ${ws.nav === 'team' ? 'cw-compact' : ''}`}
      storageKey={userEmail ? `lexisguide:chat-workspace:${userEmail.toLowerCase()}` : 'lexisguide:chat-guest'}
      open={ws.assistantOpen}
      onOpenChange={ws.setAssistantOpen}
      pendingQuestion={ws.assistantQuestion}
      documents={ws.documents.map((item) => ({ id: item.id, title: item.title, type: item.type, text: item.text }))}
      activeDocumentId={doc.id}
      onDocumentContextChange={(documentId) => ws.selectDocument(documentId)}
      suggestions={assistantQuickPrompts[ws.nav]}
      fallback={fallback}
      greeting={`Hi! I can explain ${documentDisplayName(doc)}, a legal term, or how to use LexisGuide. What would you like to know?`}
      context={{
        page: PAGE[ws.nav],
        document_title: doc.title,
        document_type: doc.type,
        document_score: doc.score,
        document_excerpt: doc.text.slice(0, 6000),
        open_findings: open.map((f) => `${f.title} (${f.category})`),
        current_finding: current ? `${current.title}: ${current.explanation} Evidence: “${current.evidence}”` : undefined,
        jurisdiction: ws.jurisdiction || undefined,
        section_summary: sectionSummary,
        workspace_name: ws.activeWorkspace?.name,
        channel_name: ws.activeWorkspace ? ws.activeChannelId : undefined,
        workspace_id: ws.activeWorkspace && !ws.activeWorkspace.id.startsWith('local-') ? ws.activeWorkspace.id : undefined,
      }}
      onWorkspaceAction={(action) => {
        if (action === 'apply_rewrite') {
          if (current) void ws.runAction('rewrite', true)
          else ws.setNotice('Select a finding before applying an approved change.')
        } else if (action === 'resolve') {
          if (current) ws.resolveAndNext(current.id)
          else ws.setNotice('Select a finding before marking it resolved.')
        } else if (action === 'create_task') {
          if (current) ws.addTask(`Review: ${current.title}`, `${documentDisplayName(doc)} · ${current.category}`)
          else ws.addTask(`Review ${documentDisplayName(doc)}`, 'Follow up on this document.')
          ws.setNotice('Follow-up task created in Messages → Tasks.')
        } else {
          void ws.runAction(action)
        }
      }}
    />
  )
}
