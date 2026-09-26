import { Sparkles } from 'lucide-react'
import { AssistantConsole } from '../../chat/AssistantConsole'
import { assistantQuickPrompts, documentDisplayName, openFindings } from '../data'
import { useWorkspace } from '../store'

/** A calm, dedicated place to talk to the authenticated LexisGuide AI. */
export function AssistantView() {
  const ws = useWorkspace()
  const document = ws.selected
  const findings = openFindings(document, ws.resolved[document.id])
  const current = ws.activeFinding
  const fallback = (question: string) => {
    const lower = question.toLowerCase()
    const finding = current?.severity !== 'pass' ? current : findings[0]
    if (/finding|risk|issue|deadline|evidence|mean|explain/.test(lower) && finding) {
      return `**${finding.title}**\n\n${finding.explanation}\n\n**Evidence:** “${finding.evidence}”\n\n**Next step:** ${finding.negotiationPoint || 'Ask for this point to be clarified in writing.'}`
    }
    if (/score|rating|health/.test(lower)) return `**${documentDisplayName(document)}** is rated ${document.score}/100, with ${findings.length} open finding${findings.length === 1 ? '' : 's'}.`
    return `I can help with **${documentDisplayName(document)}**, explain the current findings, or guide you through LexisGuide. For legal-risk questions, tell me your jurisdiction and objective.`
  }

  return (
    <div className="ws-page ws-assistant-page">
      <div className="ws-assistant-context">
        <Sparkles size={16} />
        <span>Current context</span>
        <strong>{documentDisplayName(document)}</strong>
        <em>{findings.length} finding{findings.length === 1 ? '' : 's'}</em>
      </div>

      <AssistantConsole
        storageKey="lexisguide:chat-assistant-page"
        suggestions={assistantQuickPrompts.assistant}
        fallback={fallback}
        documents={ws.documents.map((item) => ({ id: item.id, title: item.title, type: item.type, text: item.text }))}
        greeting={`Hi, I’m LexisGuide. I have ${documentDisplayName(document)} in context. What would you like to understand?`}
        context={{
          page: 'AI Assistant',
          document_title: document.title,
          document_type: document.type,
          document_score: document.score,
          document_excerpt: document.text.slice(0, 6000),
          open_findings: findings.map((finding) => `${finding.title} (${finding.category})`),
          current_finding: current ? `${current.title}: ${current.explanation} Evidence: “${current.evidence}”` : undefined,
          jurisdiction: ws.jurisdiction || undefined,
          section_summary: `${ws.documents.length} documents, ${findings.length} open findings in ${documentDisplayName(document)}, and ${ws.tasks.filter((task) => !task.completed).length} open follow-up tasks.`,
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
            if (current) ws.addTask(`Review: ${current.title}`, `${documentDisplayName(document)} · ${current.category}`)
            else ws.addTask(`Review ${documentDisplayName(document)}`, 'Follow up on this document.')
            ws.setNotice('Follow-up task created in Messages → Tasks.')
          } else {
            void ws.runAction(action)
          }
        }}
      />
    </div>
  )
}
