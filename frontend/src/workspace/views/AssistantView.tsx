import { Sparkles } from 'lucide-react'
import { ChatWidget } from '../../chat/ChatWidget'
import { assistantQuickPrompts, documentDisplayName, openFindings } from '../data'
import { useWorkspace } from '../store'
import { PageHeader } from '../ui'

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
      <PageHeader title="Ask LexisGuide" />
      <div className="ws-assistant-context">
        <Sparkles size={16} />
        <span>Current context</span>
        <strong>{documentDisplayName(document)}</strong>
        <em>{findings.length} finding{findings.length === 1 ? '' : 's'}</em>
      </div>
      <ChatWidget
        embedded
        expandingComposer
        className="cw-ai-page"
        storageKey="lexisguide:chat-assistant-page"
        suggestions={assistantQuickPrompts.assistant}
        fallback={fallback}
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
        }}
      />
    </div>
  )
}
