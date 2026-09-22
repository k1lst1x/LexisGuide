import { ChatWidget } from '../chat/ChatWidget'
import { useWorkspace } from './store'
import { assistantPageGuidance, assistantQuickPrompts, documentDisplayName, openFindings, type NavItem } from './data'

const PAGE: Record<NavItem, string> = { overview: 'Home', documents: 'Documents', linter: 'Review', chain: 'Activity', team: 'Messages', settings: 'Settings' }

/** The chat popup, given what the person is looking at in the workspace. */
export function WorkspaceChat() {
  const ws = useWorkspace()
  const doc = ws.selected
  const open = openFindings(doc, ws.resolved[doc.id])
  const current = ws.activeFinding

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
      className="cw-in-workspace"
      storageKey="lexisguide:chat-workspace"
      open={ws.assistantOpen}
      onOpenChange={ws.setAssistantOpen}
      pendingQuestion={ws.assistantQuestion}
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
      }}
    />
  )
}
