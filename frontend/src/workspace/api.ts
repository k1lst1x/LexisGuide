/* Network calls for the workspace. Every call degrades gracefully: when the
   API or sign-in is unavailable, callers fall back to the local quick scan. */
import { cognitoGetIdToken } from '../aws'
import { normalizeSeverity, sampleDocs, scanUploadedText, type Finding, type SampleDoc } from './data'

export const apiBase = () => (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
export const MAX_DOCUMENT_REVIEW_CHARS = 250_000

export type AnalyzeFinding = {
  title: string
  explanation: string
  severity: string
  source_text?: string | null
  why_it_matters?: string | null
  negotiation_point?: string | null
  suggested_rewrite?: string | null
}

export type AnalyzeResult = {
  findings?: AnalyzeFinding[]
  overall_assessment?: string
  confidence?: string
  document_score?: number
  priority_score?: number
  deadline?: string | null
  deadline_confidence?: string
  summary?: string
  next_steps?: string[]
  questions_for_user?: string[]
  sources?: Array<{ title?: string; citation?: string; url?: string | null; support?: string }>
}

export type TargetedRewrite = {
  finding_id: string
  source_text: string
  replacement_text: string
  summary: string
}

type AnalyzeBody = {
  document_text: string
  action?: 'review' | 'negotiate' | 'rewrite'
  jurisdiction?: string
  user_context?: string
  goals?: string | string[]
}

/** POST /api/v1/analyze. Returns null when the service is unreachable or declines. */
export async function analyze(body: AnalyzeBody, options: { requireAuth?: boolean; timeoutMs?: number } = {}): Promise<AnalyzeResult | null> {
  let token = await cognitoGetIdToken()
  if (options.requireAuth && !token) throw new Error('A signed-in session is required for the deployed AI service.')
  const controller = new AbortController()
  const timer = options.timeoutMs ? window.setTimeout(() => controller.abort(), options.timeoutMs) : undefined
  try {
    const send = () => fetch(`${apiBase()}/api/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: controller.signal,
      body: JSON.stringify(body),
    })
    let response = await send()
    if (response.status === 401 && token) {
      token = await cognitoGetIdToken(true)
      if (!token) throw new Error('Your AWS session expired. Please sign in again.')
      response = await send()
    }
    if (response.ok) return await response.json() as AnalyzeResult
    if (options.requireAuth) {
      const detail = (await response.json().catch(() => null))?.detail
      throw new Error(typeof detail === 'string' ? detail : 'The AI service could not complete this action.')
    }
    return null
  } finally {
    if (timer) window.clearTimeout(timer)
  }
}

/** Create a server-validated replacement for one consented finding. */
export async function createTargetedRewrite(input: { documentText: string; findingId: string; evidence: string; jurisdiction?: string }): Promise<TargetedRewrite> {
  let token = await cognitoGetIdToken()
  if (!token) throw new Error('Sign in to apply an AI document change.')
  const send = () => fetch(`${apiBase()}/api/v1/agent/targeted-rewrite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ document_text: input.documentText, finding_id: input.findingId, evidence: input.evidence, jurisdiction: input.jurisdiction?.trim() || undefined }),
  })
  let response = await send()
  if (response.status === 401) {
    token = await cognitoGetIdToken(true)
    if (!token) throw new Error('Your AWS session expired. Please sign in again.')
    response = await send()
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null))?.detail
    throw new Error(typeof detail === 'string' ? detail : 'The AI could not create this document change.')
  }
  return response.json() as Promise<TargetedRewrite>
}

export function mapFindings(findings: AnalyzeFinding[], category: string, prefix: string): Finding[] {
  return findings.map((finding, index) => ({
    id: `${prefix}-${index}`,
    title: finding.title,
    severity: normalizeSeverity(finding.severity),
    category,
    explanation: finding.explanation,
    evidence: finding.source_text || 'No exact excerpt supplied.',
    rule: finding.negotiation_point || finding.why_it_matters || 'Review this point with a qualified legal professional.',
    whyItMatters: finding.why_it_matters || undefined,
    negotiationPoint: finding.negotiation_point || undefined,
    suggestedRewrite: finding.suggested_rewrite || undefined,
  }))
}

/** Review new text with the AI service, or the local quick scan when it is offline. */
export async function reviewNewDocument(input: { id: string; title: string; type: string; text: string; hash: string; jurisdiction?: string }): Promise<SampleDoc> {
  if (input.text.length > MAX_DOCUMENT_REVIEW_CHARS) {
    throw new Error(`This document contains ${input.text.length.toLocaleString()} characters. To ensure every page is reviewed, split it into files of ${MAX_DOCUMENT_REVIEW_CHARS.toLocaleString()} characters or fewer.`)
  }
  let result: AnalyzeResult | null = null
  try {
    result = await analyze({ document_text: input.text, jurisdiction: input.jurisdiction?.trim() || undefined })
  } catch {
    // Offline or signed out: the quick scan below still produces a useful first pass.
  }
  const findings = result?.findings?.length ? mapFindings(result.findings, 'AI legal review', 'ai') : scanUploadedText(input.text)
  const assessment = result?.overall_assessment
  const score = typeof result?.document_score === 'number'
    ? result.document_score
    : assessment === 'favorable' ? 85 : assessment === 'unfavorable' ? 35 : assessment === 'insufficient_information' ? 50 : 62
  return {
    ...sampleDocs[0],
    id: input.id,
    title: input.title,
    type: input.type,
    agency: input.type,
    version: result ? 'AI review complete' : 'Quick scan complete',
    score,
    priorityScore: typeof result?.priority_score === 'number' ? result.priority_score : undefined,
    deadline: result?.deadline,
    deadlineConfidence: result?.deadline_confidence,
    status: assessment ? assessment.replaceAll('_', ' ') : findings.some((finding) => finding.severity === 'warning') ? 'Review recommended' : 'No common risks found',
    date: new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
    hash: input.hash,
    text: input.text,
    findings,
    summary: result?.summary,
    assessment,
    confidence: result?.confidence,
    nextSteps: result?.next_steps,
    sources: result?.sources?.map((source) => ({ title: source.title || 'Legal authority', citation: source.citation || '', url: source.url, support: source.support || '' })),
  }
}

/** Re-run, negotiate, or rewrite the current document through the authenticated AI service. */
export async function runDocumentAction(document: SampleDoc, action: 'review' | 'negotiate' | 'rewrite', jurisdiction: string): Promise<SampleDoc> {
  if (document.text.length > MAX_DOCUMENT_REVIEW_CHARS) throw new Error('This document is too large to re-run as one review. Split it into smaller files so every page can be included.')
  const goals = action === 'negotiate'
    ? 'Give clause-by-clause negotiation points grounded in exact document excerpts.'
    : action === 'rewrite'
      ? 'Draft clear proposed replacement wording for risky or unclear document excerpts.'
      : 'Re-check the full document for concrete risks and missing information.'
  const result = await analyze({
    document_text: document.text,
    action,
    jurisdiction: jurisdiction.trim() || undefined,
    goals,
  }, { requireAuth: true, timeoutMs: 28_000 })
  if (!result) throw new Error('The AI service could not complete this action. Your document is unchanged.')
  const category = action === 'rewrite' ? 'Proposed rewrite' : action === 'negotiate' ? 'Negotiation point' : 'AI legal review'
  const findings = mapFindings(result.findings ?? [], category, `ai-${action}`)
  return {
    ...document,
    score: typeof result.document_score === 'number' ? result.document_score : document.score,
    priorityScore: typeof result.priority_score === 'number' ? result.priority_score : document.priorityScore,
    deadline: result.deadline ?? document.deadline,
    deadlineConfidence: result.deadline_confidence ?? document.deadlineConfidence,
    findings: findings.length ? findings : document.findings,
    summary: result.summary,
    assessment: result.overall_assessment,
    confidence: result.confidence,
    nextSteps: result.next_steps,
    sources: result.sources?.map((source) => ({ title: source.title || 'Legal authority', citation: source.citation || '', url: source.url, support: source.support || '' })),
  }
}

/** Authenticated request to the shared-workspace API, retrying once with a refreshed token. */
export async function workspaceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = await cognitoGetIdToken()
  if (!token) throw new Error('Sign in to manage shared workspaces.')
  const request = () => fetch(`${apiBase()}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${token}` },
  })
  let response = await request()
  if (response.status === 401) {
    token = await cognitoGetIdToken(true)
    if (!token) throw new Error('Your AWS session expired. Please sign in again.')
    response = await request()
  }
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Workspace request failed.')
  // A delete answers 204 with no body; there is nothing to parse.
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type SharedWorkspaceMessage = {
  id: string
  user: string
  author_id?: string
  attachment_title?: string
  mentions?: Array<{ type: 'user' | 'channel' | 'document'; id: string; label: string }>
  reactions?: Array<{ emoji: string; count: number; names: string[]; mine: boolean }>
  saved?: boolean
  author_email: string
  text: string
  created_at: string
  attachment?: string | null
}

export type StoredTurn = { id: string; role: 'user' | 'assistant'; content: string; local?: boolean }

/** Read a saved conversation from the signed-in user's own history. */
export async function fetchConversation(conversationId: string): Promise<StoredTurn[] | null> {
  const token = await cognitoGetIdToken().catch(() => null)
  if (!token) return null
  try {
    const response = await fetch(`${apiBase()}/api/v1/me/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    const body = await response.json() as { turns?: StoredTurn[] }
    return body.turns ?? null
  } catch {
    // Offline: the local copy is what the person sees.
    return null
  }
}

/** Write a conversation back. Silent on failure: the local copy still holds. */
export async function saveConversation(conversationId: string, turns: StoredTurn[], title = ''): Promise<void> {
  const token = await cognitoGetIdToken().catch(() => null)
  if (!token) return
  try {
    await fetch(`${apiBase()}/api/v1/me/conversations/${conversationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ turns, title }),
    })
  } catch {
    // Keeping history is best-effort; the local copy still holds.
  }
}

export type AiSearchResult = {
  /** Markdown, from the assistant or the keyword fallback. */
  answer: string
  /** Where the answer came from: the live assistant, or a search of the text in this browser. */
  mode: 'ai' | 'keyword'
  /** Documents the answer names or that match the question, most relevant first. */
  sources: Array<{ id: string; title: string; detail: string }>
}

// Enough of each document for the assistant to find what is asked; the rest
// of a long document is represented by its findings.
const LIBRARY_EXCERPT = 2_500
const LIBRARY_LIMIT = 12

const words = (text: string) => text.toLowerCase().match(/[a-z0-9§.]{3,}/g) ?? []
const STOP = new Set(['the', 'and', 'for', 'what', 'which', 'who', 'how', 'does', 'this', 'that', 'with', 'are', 'about', 'from', 'have', 'there', 'any', 'can', 'you', 'our', 'your', 'find', 'show', 'explain', 'document', 'documents'])

/** Documents ranked by how many of the question's words they contain. */
function rankDocuments(query: string, documents: SampleDoc[]) {
  const terms = [...new Set(words(query).filter((word) => !STOP.has(word)))]
  return documents
    .map((doc) => {
      const haystack = `${doc.title} ${doc.type} ${doc.text} ${doc.findings.map((f) => `${f.title} ${f.explanation}`).join(' ')}`.toLowerCase()
      return { doc, hits: terms.filter((term) => haystack.includes(term)).length, terms: terms.length }
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.doc.score - b.doc.score)
}

/** Which documents an answer names, in the order it names them. */
function citedDocuments(answer: string, documents: SampleDoc[]) {
  const text = answer.toLowerCase()
  return documents
    .map((doc) => ({ doc, at: text.indexOf(doc.title.toLowerCase()) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((item) => item.doc)
}

const source = (doc: SampleDoc) => ({ id: doc.id, title: doc.title, detail: `${doc.type} · score ${doc.score}/100` })

/** Ask a question across every document in the workspace.
    Signed in, the LexisGuide assistant answers from the documents (and says so
    when none of them cover it). Otherwise, or if it cannot be reached, a
    keyword search of the documents in this browser answers honestly. */
export async function aiSearch(query: string, documents: SampleDoc[]): Promise<AiSearchResult> {
  const question = query.trim()
  const token = await cognitoGetIdToken().catch(() => null)
  if (token) {
    try {
      const library = [...documents]
        .sort((a, b) => a.score - b.score)
        .slice(0, LIBRARY_LIMIT)
        .map((doc) => ({
          title: doc.title.slice(0, 300),
          type: doc.type.slice(0, 120),
          score: doc.score,
          open_findings: doc.findings.filter((f) => f.severity !== 'pass').slice(0, 12).map((f) => `${f.title} (${f.category})`.slice(0, 200)),
          excerpt: doc.text.slice(0, LIBRARY_EXCERPT),
        }))
      const response = await fetch(`${apiBase()}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversation_id: `search-${crypto.randomUUID()}`,
          messages: [{ role: 'user', content: question.slice(0, 2_000) }],
          context: { page: 'AI Search', library },
        }),
      })
      if (response.ok) {
        const data = await response.json() as { reply?: string }
        const reply = data.reply?.trim()
        if (reply) {
          const cited = citedDocuments(reply, documents)
          return { answer: reply, mode: 'ai', sources: cited.map(source) }
        }
      }
    } catch {
      // Answer from the documents in the browser instead.
    }
  }

  const ranked = rankDocuments(question, documents)
  if (!ranked.length) {
    return {
      answer: `None of your ${documents.length} document${documents.length === 1 ? '' : 's'} mention “${question}”.${token ? ' The AI assistant could not be reached right now, so only the text of your documents was searched.' : ' Sign in to ask the AI assistant, which can also answer general questions.'}`,
      mode: 'keyword',
      sources: [],
    }
  }
  const top = ranked.slice(0, 3)
  const lines = top.map(({ doc, hits, terms }) => {
    const finding = doc.findings.find((f) => words(question).some((term) => `${f.title} ${f.explanation}`.toLowerCase().includes(term)))
    return `- **${doc.title}** (${doc.type}, score ${doc.score}/100): matches ${hits} of ${terms} search terms${finding ? `. Related finding: ${finding.title}.` : '.'}`
  })
  return {
    answer: `${top.length === 1 ? 'This document matches' : 'These documents match'} “${question}”:\n${lines.join('\n')}`,
    mode: 'keyword',
    sources: top.map(({ doc }) => source(doc)),
  }
}
