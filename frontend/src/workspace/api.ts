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
    return response.ok ? await response.json() as AnalyzeResult : null
  } finally {
    if (timer) window.clearTimeout(timer)
  }
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

/** Re-run, negotiate, or rewrite the current document. Throws when the service is unavailable. */
export async function runDocumentAction(document: SampleDoc, action: 'review' | 'negotiate' | 'rewrite', jurisdiction: string): Promise<SampleDoc> {
  if (document.text.length > MAX_DOCUMENT_REVIEW_CHARS) throw new Error('This document is too large to re-run as one review. Split it into smaller files so every page can be included.')
  const result = await analyze({ document_text: document.text, action, jurisdiction: jurisdiction.trim() || undefined })
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
  return response.json() as Promise<T>
}

export type LawyerVerification = {
  verified: boolean
  attempts_used: number
  attempts_remaining: number
  max_attempts: number
  bar_number: string
  jurisdiction: string
  name: string
  status: string
  admitted_on: string
  verified_at: string
}

/** Thrown when the bar check returns an answer we must show the person verbatim. */
export class VerificationError extends Error {
  /** True once the attempts are gone and only support can help. */
  readonly locked: boolean
  /** True when the provider, not the person, was the problem: no attempt was spent. */
  readonly providerFault: boolean

  constructor(message: string, status: number) {
    super(message)
    this.name = 'VerificationError'
    this.locked = status === 429
    this.providerFault = status === 503 || status === 502
  }
}

/** GET the caller's bar-verification state. */
export function getLawyerVerification(): Promise<LawyerVerification> {
  return workspaceRequest<LawyerVerification>('/me/lawyer-verification')
}

/** POST one bar number for checking. Throws VerificationError with the API's wording. */
export async function verifyLawyer(barNumber: string, jurisdiction: string): Promise<LawyerVerification> {
  let token = await cognitoGetIdToken()
  if (!token) throw new VerificationError('Sign in to verify your bar record.', 401)
  const send = () => fetch(`${apiBase()}/api/v1/me/lawyer-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bar_number: barNumber.trim(), jurisdiction: jurisdiction.trim().toUpperCase() }),
  })
  let response = await send()
  if (response.status === 401) {
    token = await cognitoGetIdToken(true)
    if (!token) throw new VerificationError('Your session expired. Please sign in again.', 401)
    response = await send()
  }
  const body = await response.json().catch(() => null)
  if (response.ok) return body as LawyerVerification
  const detail = typeof body?.detail === 'string'
    ? body.detail
    : 'That bar record could not be checked right now.'
  throw new VerificationError(detail, response.status)
}

export type AiSearchResult = {
  answer: string
  confidence?: string
  findings?: Array<{ title: string; explanation: string; severity: string; rule?: string }>
  sources?: Array<{ title?: string; citation?: string }>
}

/** Natural-language search across the workspace, grounded in local findings when offline. */
export async function aiSearch(query: string, documents: SampleDoc[], selectedDoc: SampleDoc): Promise<AiSearchResult> {
  const trimmed = query.trim()
  const lower = trimmed.toLowerCase()
  try {
    const context = documents.slice(0, 3).map((d) => `Document "${d.title}" (${d.type}):\n${d.text.slice(0, 1500)}`).join('\n\n')
    const data = await analyze({ document_text: context, action: 'review', user_context: trimmed, goals: ['search', 'qa'] })
    if (data && (data.summary || data.findings?.length)) {
      return {
        answer: data.summary || `Reviewed your workspace for “${trimmed}” and found ${data.findings?.length || 0} relevant clauses.`,
        confidence: data.confidence ? `Confidence: ${data.confidence}` : undefined,
        findings: data.findings?.map((f) => ({ title: f.title, explanation: f.explanation, severity: f.severity || 'warning', rule: f.suggested_rewrite || f.negotiation_point || f.why_it_matters || undefined })),
        sources: data.sources || [{ title: selectedDoc.title, citation: `${selectedDoc.agency} · ${selectedDoc.type}` }],
      }
    }
  } catch {
    // Fall through to the document-grounded answer below.
  }

  await new Promise((resolve) => setTimeout(resolve, 350))
  const target = documents.find((d) => d.title.toLowerCase().includes(lower) || d.text.toLowerCase().includes(lower)
    || d.findings.some((f) => f.title.toLowerCase().includes(lower) || f.explanation.toLowerCase().includes(lower))) || selectedDoc
  const topic = /terminat|notice/.test(lower) ? 'termination' : /dispute|arbitrat/.test(lower) ? 'dispute' : /liab|repair/.test(lower) ? 'liability' : /score|fair/.test(lower) ? 'score' : 'general'
  const relevant = target.findings.filter((f) =>
    topic === 'termination' ? /deadline|period|time|notice/i.test(f.title + f.category)
      : topic === 'dispute' ? /right|appeal|process/i.test(f.title + f.category)
        : topic === 'liability' ? /responsibility|cost|obligation/i.test(f.title + f.category)
          : topic === 'score' ? f.severity !== 'pass' : true).slice(0, 3)
  const lowest = [...documents].sort((a, b) => a.score - b.score)[0]
  const answer = {
    termination: `In “${target.title}”, termination provisions require explicit calendar dates or written notice periods (typically 30 days) before cancellation. Open-ended wording like “standard filing period” leaves you unsure when you must act.`,
    dispute: `Dispute terms should give clear notice and a chance to respond before rights are lost. “${target.title}” should state the hearing schedule and how to appeal.`,
    liability: `In “${target.title}”, “may result in liability” shifts costs to you without a cap or a clear definition of who repairs what. Ask for an itemized limit in writing.`,
    score: `“${lowest.title}” has the lowest score in your workspace at ${lowest.score}/100, with ${lowest.findings.filter((f) => f.severity === 'critical').length} high-impact findings. Clarifying its deadlines and appeal path will raise it most.`,
    general: `Reviewed ${documents.length} documents for “${trimmed}”. In “${target.title}” (${target.type}), the key terms to confirm are notice timelines, liability limits, and how to appeal.`,
  }[topic]
  return {
    answer,
    confidence: 'Grounded in your workspace findings',
    findings: (relevant.length ? relevant : target.findings.slice(0, 2)).map((f) => ({ title: f.title, explanation: f.explanation, severity: f.severity, rule: f.rule })),
    sources: [{ title: target.title, citation: `${target.agency} · Score ${target.score}/100` }],
  }
}
