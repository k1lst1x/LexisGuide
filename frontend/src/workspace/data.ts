/* Workspace data: document model, sample documents, and text extraction.
   Extracted from the original DashboardV2 so views can share it. */
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

export type SampleDoc = {
  id: string
  title: string
  type: string
  version: string
  score: number
  priorityScore?: number
  deadline?: string | null
  deadlineConfidence?: string
  status: string
  agency: string
  date: string
  hash: string
  text: string
  summary?: string
  assessment?: string
  confidence?: string
  nextSteps?: string[]
  sources?: Array<{ title: string; citation: string; url?: string | null; support: string }>
  findings: Array<{
    id: string
    title: string
    severity: 'critical' | 'warning' | 'pass'
    category: string
    explanation: string
    evidence: string
    rule: string
    whyItMatters?: string
    negotiationPoint?: string
    suggestedRewrite?: string
  }>
}

export type NavItem = 'overview' | 'assistant' | 'linter' | 'documents' | 'chain' | 'team' | 'settings'
export type WorkspaceSummary = {
  id: string
  name: string
  owner_id: string
  created_at: string
  role: string
  linked_document_id?: string | null
  linked_document_title?: string | null
}
export type WorkspaceMember = { user_id: string; email: string; name: string; role: string; joined_at: string }
export type WorkspaceMessage = { id: string; user: string; authorEmail?: string; text: string; time: string; saved?: boolean; attachment?: string }
export type WorkspaceTask = { id: string; title: string; detail: string; completed: boolean }
export type AssistantAction = 'evidence' | 'revision' | 'task' | 'message' | 'assign' | 'due-date' | 'policy'
export type AssistantApprovalAction = Exclude<AssistantAction, 'evidence' | 'policy'>
export type AssistantScope = 'finding' | 'document' | 'selected-documents' | 'workspace'
export type AssistantReview = { title: string; severity: string; evidence: string; whyItMatters: string; rule: string; suggestedRewrite?: string; confidence?: string; questions?: string[] }
export type AssistantMessage = { id: string; role: 'assistant' | 'user'; text: string; findings?: Array<{ title: string; severity: string }>; review?: AssistantReview; documentId?: string; documentVersion?: string }


export const LAST_SECTION_KEY = 'lexisguide:last-section'
export const DOCUMENT_TUTORIAL_SEEN_KEY = 'lexisguide:document-tutorial-seen'
export const MESSAGE_STORAGE_KEY = 'lexisguide:space-messages'
export const ASSISTANT_STORAGE_KEY = 'lexisguide:assistant-messages'
export const defaultWorkspaceMessages: WorkspaceMessage[] = [
  { id: 'message-elena', user: 'Elena Moritz (Legal Aid)', text: 'The appeal deadline is completely missing in v1. We should add a 30-day requirement.', time: '10:14 AM' },
  { id: 'message-agency', user: 'Agency Reviewer', text: 'Agreed. Updating notice to include deadline date of Oct 14, 2026.', time: '10:28 AM' },
]

export const assistantPageGuidance: Record<NavItem, string> = {
  overview: 'Home shows what needs attention: the next document to review, upcoming deadlines, open findings by category, and every document score against the pass line.',
  assistant: 'AI Assistant is a dedicated conversation space. Ask about the current document, its findings, a legal term, or how to use LexisGuide.',
  linter: 'Review is the main workspace. The finding queue is on the left, the highlighted document is in the middle, and the plain-language explanation, rule, and next step are on the right. Mark each finding resolved as you go.',
  documents: 'Documents lists every file with its score, open findings, and deadline. Add a file or paste text, then open it in Review.',
  chain: 'Activity shows how a document improved across versions, with the score trend and each review milestone.',
  team: 'Messages keeps the review conversation, linked files, and tasks together in one shared space.',
  settings: 'Settings holds your account, review preferences, notifications, and time spent in review.',
}
export const assistantQuickPrompts: Record<NavItem, string[]> = {
  overview: ['What should I review first?', 'Explain this document rating'],
  assistant: ['What should I review first?', 'Explain the highest-impact finding', 'Summarise this document in plain language', 'What evidence supports this review?'],
  linter: ['Explain this finding in plain language', 'Show exact document evidence', 'Draft a 30-day deadline revision', 'What could happen if we do nothing?'],
  documents: ['How do I add a document?', 'Which document is most urgent?'],
  chain: ['What changed in this review?', 'How do versions work?'],
  team: ['How do I share this review?', 'How do I create a task?'],
  settings: ['What can I manage here?', 'How is activity tracked?'],
}

/* ───────── Sample Data ───────── */
export const sampleDocs: SampleDoc[] = [
  {
    id: 'doc-1',
    title: 'Notice of Supplemental Benefits Denial (Ref #8942-B)',
    type: 'Administrative Denial',
    version: 'v1.0 (Audit Flagged)',
    score: 54,
    priorityScore: 92,
    deadline: null,
    deadlineConfidence: 'low',
    status: 'Needs Improvement',
    agency: 'Department of Human Services · Division of Eligibility',
    date: 'September 12, 2026',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    text: `DEPARTMENT OF HUMAN SERVICES
NOTICE OF SUPPLEMENTAL BENEFITS DENIAL
Date of Notice: September 12, 2026
Case ID: DHS-8942-B

Dear Applicant,

Please be advised that your application for Supplemental Housing Assistance under Regulation 42-A has been DENIED following administrative review.

Reason for Decision:
The documentation provided regarding household composition was deemed incomplete under Section 42-A(3)(b). 

Rights to Appeal:
You have the right to request an administrative hearing if you disagree with this decision. Appeals must be submitted within the standard filing period. Failure to submit an appeal within the prescribed timeframe will result in final forfeiture of rights.

For inquiries, contact the central administrative portal.`,
    findings: [
      {
        id: 'f-1',
        title: 'Appeal filing deadline is vague',
        severity: 'critical',
        category: 'Deadline Clarity',
        explanation: 'The notice states "within the standard filing period" without specifying an exact calendar date or specific number of days (e.g. 30 days).',
        evidence: 'Appeals must be submitted within the standard filing period.',
        rule: 'PROC-RULE-104: Explicit Filing Deadline Requirement'
      },
      {
        id: 'f-2',
        title: 'Appeal destination & filing procedure missing',
        severity: 'critical',
        category: 'Appeal Path',
        explanation: 'The notice instructs to contact "the central administrative portal" but does not provide an address, URL, form number, or filing instructions.',
        evidence: 'For inquiries, contact the central administrative portal.',
        rule: 'PROC-RULE-201: Verifiable Appeal Destination Requirement'
      },
      {
        id: 'f-3',
        title: 'Consequences of inaction not fully detailed',
        severity: 'warning',
        category: 'Consequences',
        explanation: 'States "final forfeiture of rights" but does not explain whether re-application is permitted or if existing benefits are affected.',
        evidence: 'Failure to submit an appeal within the prescribed timeframe will result in final forfeiture of rights.',
        rule: 'PROC-RULE-305: Plain-Language Consequence Explanation'
      },
      {
        id: 'f-4',
        title: 'Issuing agency & Regulation authority identified',
        severity: 'pass',
        category: 'Legal Authority',
        explanation: 'The issuing body (Department of Human Services) and regulatory basis (Regulation 42-A) are explicitly cited.',
        evidence: 'Department of Human Services ... Regulation 42-A',
        rule: 'PROC-RULE-001: Statutory Basis Identification'
      }
    ]
  },
  {
    id: 'doc-2',
    title: 'Revised Notice of Benefits Denial (Remediated)',
    type: 'Administrative Denial',
    version: 'v4.0 (Remediated)',
    score: 89,
    priorityScore: 28,
    deadline: '2026-10-14T17:00:00-04:00',
    deadlineConfidence: 'high',
    status: 'Passed Due Process',
    agency: 'Department of Human Services · Division of Eligibility',
    date: 'September 14, 2026',
    hash: '7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504d972549a',
    text: `DEPARTMENT OF HUMAN SERVICES
NOTICE OF SUPPLEMENTAL BENEFITS DENIAL
Date of Notice: September 14, 2026
Case ID: DHS-8942-B

Dear Applicant,

Your application for Supplemental Housing Assistance under Regulation 42-A has been DENIED due to missing income verification documents under Section 42-A(3)(b).

HOW TO APPEAL THIS DECISION:
If you disagree with this denial, you have 30 CALENDAR DAYS from the date of this notice (DEADLINE: October 14, 2026 at 5:00 PM EST) to submit an appeal.

WHERE TO SUBMIT YOUR APPEAL:
1. Online: Visit https://dhs.gov/appeals/file and enter Case ID: DHS-8942-B.
2. By Mail: Send Form DHS-APP-1 to Appeals Bureau, 100 Capitol Way, Suite 400, Washington DC 20001.

WHAT HAPPENS IF YOU DO NOT APPEAL:
If no appeal is received by October 14, 2026, this decision becomes final. You may re-apply for benefits after 90 days with updated documentation.`,
    findings: [
      {
        id: 'f-21',
        title: 'Explicit filing deadline verified',
        severity: 'pass',
        category: 'Deadline Clarity',
        explanation: 'Filing deadline is explicitly stated as 30 calendar days (October 14, 2026 at 5:00 PM EST).',
        evidence: 'DEADLINE: October 14, 2026 at 5:00 PM EST',
        rule: 'PROC-RULE-104: Explicit Filing Deadline Requirement'
      },
      {
        id: 'f-22',
        title: 'Verifiable filing destination & options provided',
        severity: 'pass',
        category: 'Appeal Path',
        explanation: 'Provides both an online portal URL and physical mailing address with form references.',
        evidence: 'https://dhs.gov/appeals/file ... 100 Capitol Way, Suite 400',
        rule: 'PROC-RULE-201: Verifiable Appeal Destination Requirement'
      },
      {
        id: 'f-23',
        title: 'Clear explanation of consequences and re-application terms',
        severity: 'pass',
        category: 'Consequences',
        explanation: 'Explains what happens if no appeal is filed and specifies the 90-day re-application window.',
        evidence: 'You may re-apply for benefits after 90 days with updated documentation.',
        rule: 'PROC-RULE-305: Plain-Language Consequence Explanation'
      }
    ]
  },
  {
    id: 'doc-3',
    title: 'Residential Lease Agreement (Workspace Review)',
    type: 'Shared Agreement',
    version: 'v1.0 (Workspace Open)',
    score: 62,
    priorityScore: 78,
    deadline: null,
    deadlineConfidence: 'low',
    status: 'Needs Review',
    agency: 'Private Agreement · Landlord & Tenant Workspace',
    date: 'September 15, 2026',
    hash: 'b10a8db164e0754105b7a99be72e3fe5aa72e42ef9982736209e900c73245037',
    text: `RESIDENTIAL LEASE AGREEMENT
Property: 2042 North Chicago Suite #4B, Chicago, IL

Clause 4: Security Deposit
The Tenant agrees to deposit the sum of $2,400. Deposit will be returned upon tenancy expiration subject to deductions for damages.

Clause 8: Maintenance & Repairs
Tenant is responsible for keeping the premises clean. Major maintenance items shall be reported promptly. Failure to report maintenance issues may result in tenant liability.

Clause 12: Termination & Renewal
Either party may terminate this agreement upon written notice prior to term end.`,
    findings: [
      {
        id: 'f-31',
        title: 'Security deposit return timeframe unspecified',
        severity: 'warning',
        category: 'Financial Rights',
        explanation: 'Does not state the required statutory deadline (e.g. 21 days) for returning the security deposit after move-out.',
        evidence: 'Deposit will be returned upon tenancy expiration subject to deductions',
        rule: 'LEASE-RULE-102: Deposit Return Statutory Deadline'
      },
      {
        id: 'f-32',
        title: 'Repair responsibility boundaries ambiguous',
        severity: 'critical',
        category: 'Obligations',
        explanation: 'Unclear definition of "major maintenance items" versus landlord repair duties.',
        evidence: 'Failure to report maintenance issues may result in tenant liability.',
        rule: 'LEASE-RULE-204: Maintenance Liability Boundary'
      },
      {
        id: 'f-33',
        title: 'Termination notice period missing',
        severity: 'critical',
        category: 'Termination Terms',
        explanation: 'Fails to specify the required notice period (e.g., 30 or 60 days in advance).',
        evidence: 'Either party may terminate this agreement upon written notice prior to term end.',
        rule: 'LEASE-RULE-301: Mandatory Notice Period'
      }
    ]
  }
]

export function scanUploadedText(text: string): SampleDoc['findings'] {
  const checks = [
    { pattern: /within the standard filing period/i, title: 'Deadline is not specific', category: 'Deadline', explanation: 'The document mentions a filing period but does not say exactly when you must act. That can make it harder to protect your rights in time.', rule: 'Ask for a calendar date, time zone, and delivery method.' },
    { pattern: /forfeiture of rights/i, title: 'Rights may be lost', category: 'Consequences', explanation: 'This language says you could lose rights but does not clearly explain the outcome or available alternatives.', rule: 'Ask what rights are affected and whether you can still reapply or request review.' },
    { pattern: /may result in (?:tenant )?liability/i, title: 'Responsibility is unclear', category: 'Obligations', explanation: 'The document may shift costs or responsibility to you without defining the limit or the other party’s duties.', rule: 'Ask for the exact condition, cost, and responsibility in writing.' },
    { pattern: /may be adjusted/i, title: 'Amount can change without details', category: 'Cost', explanation: 'A price or payment can change, but the document does not explain how the amount is calculated or capped.', rule: 'Request the calculation, effective date, and any maximum increase.' },
    { pattern: /final forfeiture of rights/i, title: 'Loss of rights needs an explanation', category: 'Consequences', explanation: 'This phrase says rights can be lost without clearly explaining what can be recovered, appealed, or requested next.', rule: 'Ask which rights would be affected and how to request a review before any deadline.' },
    { pattern: /subject to deductions/i, title: 'Deductions are not defined', category: 'Money', explanation: 'The document allows deductions but does not say what qualifies, how costs are documented, or when any remainder is returned.', rule: 'Ask for the deduction rules, proof requirements, and a return date in writing.' },
    { pattern: /either party may terminate[^.]*\./i, title: 'Notice period is missing', category: 'Ending an agreement', explanation: 'The agreement permits termination but does not say how much advance notice is required. That can create an unexpected move-out or payment risk.', rule: 'Request a specific notice period and the delivery method for notice.' },
  ]

  const findings = checks.flatMap((check, index) => {
    const match = text.match(check.pattern)
    return match ? [{ id: `upload-${index}`, title: check.title, severity: 'warning' as const, category: check.category, explanation: check.explanation, evidence: match[0], rule: check.rule }] : []
  })

  return findings.length ? findings : [{ id: 'upload-clear', title: 'No common risk phrases found', severity: 'pass', category: 'Initial scan', explanation: 'The quick scan did not find one of its common risk patterns. Read the full document and seek advice for an important decision.', evidence: 'No matching language found in this quick text scan.', rule: 'This is a limited automated check, not legal advice.' }]
}

export type ExtractedDocument = {
  text: string
  type: string
}

export const readableTextExtensions = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'log'])

export function cleanExtractedText(text: string) {
  return text.replaceAll(String.fromCharCode(0), '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function fileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

export function fileTitle(file: File) {
  return file.name.replace(/\.[^/.]+$/, '') || 'Uploaded document'
}

export function looksLikeReadableText(text: string) {
  if (!text) return false
  const readableCharacters = [...text].filter((character) => character === '\n' || character === '\t' || (character >= ' ' && character <= '~')).length
  return readableCharacters / text.length > .72
}

export async function extractDocumentText(file: File): Promise<ExtractedDocument> {
  const extension = fileExtension(file)

  if (file.type === 'application/pdf' || extension === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const pages: string[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(content.items.map((item) => 'str' in item ? item.str : '').filter(Boolean).join(' '))
    }

    const text = cleanExtractedText(pages.join('\n\n'))
    if (!text) throw new Error('No selectable text was found in this PDF. If it is a scanned document, paste its text below to review it.')
    return { text, type: 'PDF document' }
  }

  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    const text = cleanExtractedText(result.value)
    if (!text) throw new Error('No readable text was found in this Word document. Try pasting the document text instead.')
    return { text, type: 'Word document' }
  }

  const rawText = await file.text()
  if (file.type === 'text/html' || extension === 'html' || extension === 'htm') {
    const text = cleanExtractedText(new DOMParser().parseFromString(rawText, 'text/html').body.textContent ?? '')
    if (!text) throw new Error('No readable text was found in this webpage file.')
    return { text, type: 'Web document' }
  }

  if (file.type === 'application/rtf' || extension === 'rtf') {
    const text = cleanExtractedText(rawText.replace(/\\par[d]?/g, '\n').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, ''))
    if (!text) throw new Error('No readable text was found in this RTF document.')
    return { text, type: 'Rich text document' }
  }

  if (!readableTextExtensions.has(extension) && !file.type.startsWith('text/') && !looksLikeReadableText(rawText)) {
    throw new Error('This file cannot be read as text in the browser yet. Add a PDF, DOCX, RTF, webpage, or text file—or paste the document text to review it.')
  }

  const text = cleanExtractedText(rawText)
  if (!text) throw new Error('This file does not contain readable text. If it is a scan or image, paste the document text to review it.')
  return { text, type: extension ? `${extension.toUpperCase()} document` : 'Uploaded document' }
}


/* ───────── Shared helpers ───────── */
export type Finding = SampleDoc['findings'][number]
export type Severity = Finding['severity']

export const SEVERITY: Record<Severity, { label: string; short: string; color: string; soft: string; icon: string }> = {
  critical: { label: 'High impact', short: 'High', color: '#b4412f', soft: '#fbe3dc', icon: '!' },
  warning: { label: 'Needs review', short: 'Review', color: '#c98a1a', soft: '#fdf0c7', icon: '▲' },
  pass: { label: 'Verified', short: 'Verified', color: '#2f8a5e', soft: '#e3f1e8', icon: '✓' },
}

export function normalizeSeverity(value: string): Severity {
  return /critical|high/i.test(value) ? 'critical' : /pass|low/i.test(value) ? 'pass' : 'warning'
}

export function documentKind(type: string) {
  if (/lease|housing|residential/i.test(type)) return { icon: '⌂', label: 'Housing' }
  if (/employment|work|offer/i.test(type)) return { icon: '▣', label: 'Work' }
  if (/school|education|student/i.test(type)) return { icon: '▤', label: 'School' }
  if (/benefit|administrative|government/i.test(type)) return { icon: '⌘', label: 'Public service' }
  return { icon: '▤', label: 'Document' }
}

export function documentDisplayName(document: SampleDoc) {
  if (document.id === 'doc-1') return 'Benefits decision · #8942-B'
  if (document.id === 'doc-2') return 'Updated benefits decision'
  if (document.id === 'doc-3') return 'Lease agreement'
  return document.title
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, pass: 2 }

/** Findings ordered worst first, keeping document order within a severity. */
export function bySeverity(findings: Finding[]) {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

export function openFindings(document: SampleDoc, resolved: string[] = []) {
  return bySeverity(document.findings.filter((finding) => finding.severity !== 'pass' && !resolved.includes(finding.id)))
}

export function scoreTone(score: number) {
  return score >= 80 ? 'good' : score >= 60 ? 'review' : 'risk'
}

/** Review milestones for the sample benefits notice, shown on Activity. */
export const reviewVersions = [
  { v: 'v1', title: 'Document received and fingerprinted', detail: 'Original notice uploaded; review trail started.', hash: 'e3b0c442…b855', score: 54, status: '2 high-impact findings', date: 'Sep 12' },
  { v: 'v2', title: 'Automated clarity review', detail: 'Checked against PROC-RULE-104 and PROC-RULE-201.', hash: null, score: 68, status: 'Deadline still vague', date: 'Sep 12' },
  { v: 'v3', title: 'Advocate review and citations', detail: 'Added the appeal URL and a 30-day deadline.', hash: null, score: 81, status: '1 item to review', date: 'Sep 13' },
  { v: 'v4', title: 'Revised notice exported', detail: 'All required appeal details now present.', hash: '7d865e95…549a', score: 89, status: 'Passes review', date: 'Sep 14' },
]

export const profileActivity = [
  { label: 'Mon', minutes: 42 },
  { label: 'Tue', minutes: 68 },
  { label: 'Wed', minutes: 31 },
  { label: 'Thu', minutes: 74 },
  { label: 'Fri', minutes: 56 },
  { label: 'Sat', minutes: 18 },
  { label: 'Sun', minutes: 37 },
]

export const defaultTasks: WorkspaceTask[] = [
  { id: 'task-deadline', title: 'Clarify the appeal deadline', detail: 'Linked to document review', completed: false },
  { id: 'task-destination', title: 'Confirm the filing destination', detail: 'Assigned to review queue', completed: false },
  { id: 'task-authority', title: 'Verify issuing authority', detail: 'Completed', completed: true },
]

export const PASS_SCORE = 80
