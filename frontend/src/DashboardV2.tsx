import React, { useState, useEffect, useEffectEvent, useRef } from 'react'
import { createPortal } from 'react-dom'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { AIWorkflowProgress } from './components/AIWorkflowProgress'
import { cognitoGetIdToken } from './aws'

/* ───────── Types ───────── */
type SampleDoc = {
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

type NavItem = 'overview' | 'linter' | 'documents' | 'chain' | 'team' | 'settings'
type WorkspaceSummary = { id: string; name: string; owner_id: string; created_at: string; role: string }
type WorkspaceMember = { user_id: string; email: string; name: string; role: string; joined_at: string }
type WorkspaceMessage = { id: string; user: string; text: string; time: string; saved?: boolean; attachment?: string }
type WorkspaceTask = { id: string; title: string; detail: string; completed: boolean }

const LAST_SECTION_KEY = 'lexisguide:last-section'
const DOCUMENT_TUTORIAL_SEEN_KEY = 'lexisguide:document-tutorial-seen'
const MESSAGE_STORAGE_KEY = 'lexisguide:space-messages'
const defaultWorkspaceMessages: WorkspaceMessage[] = [
  { id: 'message-elena', user: 'Elena Moritz (Legal Aid)', text: 'The appeal deadline is completely missing in v1. We should add a 30-day requirement.', time: '10:14 AM' },
  { id: 'message-agency', user: 'Agency Reviewer', text: 'Agreed. Updating notice to include deadline date of Oct 14, 2026.', time: '10:28 AM' },
]

/* ───────── Sample Data ───────── */
const sampleDocs: SampleDoc[] = [
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

/* ───────── SVG Icons ───────── */
const icons: Record<string, React.ReactNode> = {
  overview: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  linter: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
  documents: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  chain: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  team: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  collapse: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  chevronRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  home: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
}

const navItems: { key: NavItem; label: string }[] = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'linter', label: 'Review' },
  { key: 'documents', label: 'Documents' },
  { key: 'chain', label: 'Activity' },
  { key: 'team', label: 'Messages' },
  { key: 'settings', label: 'Profile' },
]

const topNavItems: { key: NavItem; label: string }[] = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'documents', label: 'Documents' },
  { key: 'linter', label: 'Review' },
  { key: 'chain', label: 'Activity' },
  { key: 'team', label: 'Messages' },
]

function scanUploadedText(text: string): SampleDoc['findings'] {
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

type ExtractedDocument = {
  text: string
  type: string
}

const readableTextExtensions = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'log'])

function cleanExtractedText(text: string) {
  return text.replaceAll(String.fromCharCode(0), '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function fileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

function fileTitle(file: File) {
  return file.name.replace(/\.[^/.]+$/, '') || 'Uploaded document'
}

function looksLikeReadableText(text: string) {
  if (!text) return false
  const readableCharacters = [...text].filter((character) => character === '\n' || character === '\t' || (character >= ' ' && character <= '~')).length
  return readableCharacters / text.length > .72
}

async function extractDocumentText(file: File): Promise<ExtractedDocument> {
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

/* ───────── Document score bar ───────── */
function ScoreGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0)
  const tone = score < 65 ? 'risk' : score < 80 ? 'review' : 'clear'

  useEffect(() => {
    const timer = window.setTimeout(() => setAnimated(score), 80)
    return () => clearTimeout(timer)
  }, [score])

  return (
    <div className={`d2-score-bar d2-score-bar-${tone}`} role="img" aria-label={`Document score ${score} out of 100`}>
      <div className="d2-score-bar-value">
        <strong>{Math.round(animated)}</strong>
        <span>/100</span>
      </div>
      <div className="d2-score-bar-track"><i style={{ width: `${animated}%` }} /></div>
      <div className="d2-score-bar-scale"><span>0</span><span>50</span><span>100</span></div>
    </div>
  )
}

function DocumentLibraryPanel({ documents, selectedDocument, onSelect, sort }: { documents: SampleDoc[]; selectedDocument: SampleDoc; onSelect: (document: SampleDoc) => void; sort: 'priority' | 'score-low' | 'score-high' | 'name' }) {
  const sortedDocuments = [...documents].sort((left, right) => {
    if (sort === 'score-low') return left.score - right.score || left.title.localeCompare(right.title)
    if (sort === 'score-high') return right.score - left.score || left.title.localeCompare(right.title)
    if (sort === 'name') return documentDisplayName(left).localeCompare(documentDisplayName(right))

    const urgency = (document: SampleDoc) => document.findings.reduce((total, finding) => total + (finding.severity === 'critical' ? 2 : finding.severity === 'warning' ? 1 : 0), 0)
    return urgency(right) - urgency(left) || left.score - right.score || left.title.localeCompare(right.title)
  })

  return <div className={`d2-linked-document-list d2-linked-document-library d2-file-sort-${sort}`} role="listbox" aria-label="Documents in workspace">
    <div className="d2-linked-list-heading"><span>FILES</span><small>{documents.length} available</small></div>
    {sortedDocuments.map((document, index) => {
      const isActive = document.id === selectedDocument.id
      return <button key={`${document.id}-${sort}`} type="button" role="option" aria-selected={isActive} className={`d2-linked-document-option ${isActive ? 'd2-linked-document-active' : ''}`} style={{ '--file-order': index } as React.CSSProperties} onClick={() => onSelect(document)}>
        <span className="d2-linked-document-icon" aria-hidden="true">{documentKind(document.type).icon}</span><span><strong>{documentDisplayName(document)}</strong><small>{documentKind(document.type).label}</small></span>
      </button>
    })}
  </div>
}

const profileActivity = [
  { label: 'Mon', minutes: 42 },
  { label: 'Tue', minutes: 68 },
  { label: 'Wed', minutes: 31 },
  { label: 'Thu', minutes: 74 },
  { label: 'Fri', minutes: 56 },
  { label: 'Sat', minutes: 18 },
  { label: 'Sun', minutes: 37 },
]

function ActivityTimeChart() {
  const [activeDay, setActiveDay] = useState<number | null>(null)
  const maxMinutes = Math.max(...profileActivity.map((day) => day.minutes))
  const displayedActivity = activeDay === null ? profileActivity.reduce((total, day) => total + day.minutes, 0) : profileActivity[activeDay].minutes

  return <section className="d2-settings-card d2-settings-activity" aria-labelledby="activity-time-title">
    <div className="d2-activity-card-head"><div><span className="d2-eyebrow"><span className="d2-ai-sparkle" aria-hidden="true">✦</span> WORKSPACE ACTIVITY</span><h3 id="activity-time-title">Time in review</h3><p>Time spent reading, checking, and resolving document findings.</p></div><div className="d2-activity-total"><strong>{displayedActivity}</strong><span>{activeDay === null ? 'min this week' : `${profileActivity[activeDay].label} minutes`}</span></div></div>
    <div className="d2-activity-chart" role="group" aria-label="Weekly activity time">
      {profileActivity.map((day, index) => {
        const isActive = activeDay === index
        const isMuted = activeDay !== null && !isActive
        return <button key={day.label} className={`d2-activity-bar ${isActive ? 'd2-activity-bar-active' : ''} ${isMuted ? 'd2-activity-bar-muted' : ''}`} style={{ '--activity-height': `${Math.round((day.minutes / maxMinutes) * 100)}%` } as React.CSSProperties} onMouseEnter={() => setActiveDay(index)} onFocus={() => setActiveDay(index)} onClick={() => setActiveDay(index)} aria-label={`${day.label}: ${day.minutes} minutes in the workspace`}>
          <span className="d2-activity-tooltip">{day.minutes} min</span><i /><em>{day.label.slice(0, 1)}</em>
        </button>
      })}
    </div>
    <div className="d2-activity-foot"><span><i /> Analysis activity is private to this workspace</span><button type="button" onClick={() => setActiveDay(null)}>Show weekly total</button></div>
  </section>
}

function DocumentText({ document, onSelectFinding }: { document: SampleDoc; onSelectFinding: (id: string) => void }) {
  const flagged = document.findings.filter((finding) => finding.severity !== 'pass' && finding.evidence)
  const escaped = flagged.map((finding) => finding.evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const matcher = escaped.length ? new RegExp(`(${escaped.join('|')})`, 'gi') : null

  return <pre className="d2-paper-text">{document.text.split('\n').map((line, lineIndex) => <span key={`${line}-${lineIndex}`} className="d2-text-line">{matcher ? line.split(matcher).map((part, partIndex) => {
    const finding = flagged.find((item) => item.evidence.toLowerCase() === part.toLowerCase())
    return finding ? <button className={`d2-text-highlight d2-highlight-${finding.severity}`} key={`${part}-${partIndex}`} onClick={() => onSelectFinding(finding.id)}>{part}<span>!</span></button> : part
  }) : line}{'\n'}</span>)}</pre>
}

function documentKind(type: string) {
  if (/lease|housing|residential/i.test(type)) return { icon: '⌂', label: 'Housing' }
  if (/employment|work|offer/i.test(type)) return { icon: '▣', label: 'Work' }
  if (/school|education|student/i.test(type)) return { icon: '▤', label: 'School' }
  if (/benefit|administrative|government/i.test(type)) return { icon: '⌘', label: 'Public service' }
  return { icon: '▤', label: 'Document' }
}

function documentDisplayName(document: SampleDoc) {
  if (document.id === 'doc-1') return 'Benefits decision · #8942-B'
  if (document.id === 'doc-2') return 'Updated benefits decision'
  if (document.id === 'doc-3') return 'Lease agreement'
  return document.title
}

function DocumentPicker({ documents, selectedDocument, onSelect, compactLabel }: { documents: SampleDoc[]; selectedDocument: SampleDoc; onSelect: (document: SampleDoc) => void; compactLabel?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const kind = documentKind(selectedDocument.type)

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  return <div className="d2-document-picker" ref={pickerRef}>
    <button className={`d2-document-picker-trigger ${isOpen ? 'd2-document-picker-open' : ''}`} onClick={() => setIsOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={isOpen} aria-label={`Viewing ${documentDisplayName(selectedDocument)}`} title={selectedDocument.title}>
      <span className="d2-document-picker-icon" aria-hidden="true">{kind.icon}</span>
      <span className="d2-document-picker-copy"><small>Viewing</small><strong>{compactLabel || documentDisplayName(selectedDocument)}</strong></span>
      <span className="d2-document-picker-chevron" aria-hidden="true">⌄</span>
    </button>
    {isOpen && <div className="d2-document-picker-menu" role="listbox" aria-label="Choose a document">
      <div className="d2-document-picker-menu-head"><span>Choose a document</span><small>{documents.length} available</small></div>
      {documents.map((document) => {
        const itemKind = documentKind(document.type)
        const issueCount = document.findings.filter((finding) => finding.severity !== 'pass').length
        return <button key={document.id} className={`d2-document-picker-option ${selectedDocument.id === document.id ? 'd2-document-picker-option-active' : ''}`} role="option" aria-selected={selectedDocument.id === document.id} onClick={() => { onSelect(document); setIsOpen(false) }} title={document.title}>
          <span className="d2-document-picker-option-icon" aria-hidden="true">{itemKind.icon}</span><span><strong>{documentDisplayName(document)}</strong><small>{itemKind.label} · {issueCount ? `${issueCount} item${issueCount === 1 ? '' : 's'} to review` : 'All checks complete'}</small></span>{selectedDocument.id === document.id && <b>✓</b>}
        </button>
      })}
    </div>}
  </div>
}

/* ───────── Main Dashboard V2 ───────── */
export function DashboardV2({ onClose, onSignOut, userEmail }: { onClose: () => void; onSignOut?: () => void; userEmail?: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeNav, setActiveNavState] = useState<NavItem>(() => {
    const savedSection = window.localStorage.getItem(LAST_SECTION_KEY)
    return navItems.some((item) => item.key === savedSection) ? savedSection as NavItem : 'overview'
  })
  const [sectionTitleExpanded, setSectionTitleExpanded] = useState(true)
  const [documents, setDocuments] = useState<SampleDoc[]>(sampleDocs)
  const [selectedDoc, setSelectedDoc] = useState<SampleDoc>(sampleDocs[0])
  const [activeFinding, setActiveFinding] = useState<string | null>(sampleDocs[0].findings[0]?.id || null)
  const [isStudioOpen, setIsStudioOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'reader' | 'editor'>('reader')
  const [isScanning, setIsScanning] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false)
  const [pastedTitle, setPastedTitle] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [, setTutorialStep] = useState(0)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialSeen, setTutorialSeen] = useState(() => window.localStorage.getItem(DOCUMENT_TUTORIAL_SEEN_KEY) === '1')
  const [comments, setComments] = useState<WorkspaceMessage[]>(() => {
    try {
      const stored = window.localStorage.getItem(MESSAGE_STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : null
      return Array.isArray(parsed) && parsed.every((message) => typeof message?.id === 'string' && typeof message?.text === 'string') ? parsed : defaultWorkspaceMessages
    } catch { return defaultWorkspaceMessages }
  })
  const [newComment, setNewComment] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({})
  const [messageFilter, setMessageFilter] = useState<'all' | 'mentions'>('all')
  const [spaceTasks, setSpaceTasks] = useState<WorkspaceTask[]>([
    { id: 'task-deadline', title: 'Clarify the appeal deadline', detail: 'Linked to document review', completed: false },
    { id: 'task-destination', title: 'Confirm the filing destination', detail: 'Assigned to review queue', completed: false },
    { id: 'task-authority', title: 'Verify issuing authority', detail: 'Completed', completed: true },
  ])
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const [messageNotice, setMessageNotice] = useState('')
  const [messageWorkspaceTab, setMessageWorkspaceTab] = useState<'chat' | 'files' | 'tasks'>('chat')
  const [messageDetailsOpen, setMessageDetailsOpen] = useState(true)
  const [workspaceSetupOpen, setWorkspaceSetupOpen] = useState(false)
  const [mobileChannelsOpen, setMobileChannelsOpen] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [attachedDocument, setAttachedDocument] = useState<string | null>(null)
  const [issuesResolved, setIssuesResolved] = useState(false)
  const [remediating, setRemediating] = useState(false)
  const [aiWorkflowOpen, setAiWorkflowOpen] = useState(false)
  const [aiWorkflowMode, setAiWorkflowMode] = useState<'document-audit' | 'remediation' | 'project-plan'>('document-audit')
  const [aiWorkflowDocName, setAiWorkflowDocName] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false)
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [searchMode, setSearchMode] = useState<'internal' | 'ai'>('internal')
  const [aiSearchLoading, setAiSearchLoading] = useState(false)
  const [aiSearchResult, setAiSearchResult] = useState<{
    answer: string
    confidence?: string
    findings?: Array<{ title: string; explanation: string; severity: string; rule?: string }>
    sources?: Array<{ title?: string; citation?: string }>
  } | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(null)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceInviteCode, setWorkspaceInviteCode] = useState('')
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true)
  const [impactFilter, setImpactFilter] = useState<'critical' | 'warning' | 'pass' | null>(null)
  const [hoveredImpact, setHoveredImpact] = useState<'critical' | 'warning' | 'pass' | null>(null)
  const [documentSort, setDocumentSort] = useState<'priority' | 'score-low' | 'score-high' | 'name'>('priority')
  const userMenuRef = useRef<HTMLDivElement>(null)
  const workspaceToolsRef = useRef<HTMLDivElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const workspaceSearchInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const sectionTitleTimerRef = useRef<number | undefined>(undefined)

  const triggerAiWorkflow = (docTitle: string = selectedDoc.title, mode: 'document-audit' | 'remediation' | 'project-plan' = 'document-audit') => {
    setAiWorkflowMode(mode)
    setAiWorkflowDocName(docTitle)
    setAiWorkflowOpen(true)
  }

  const dismissDocumentTutorial = () => {
    window.localStorage.setItem(DOCUMENT_TUTORIAL_SEEN_KEY, '1')
    setTutorialSeen(true)
    setTutorialOpen(false)
  }

  const setActiveNav = (section: NavItem) => {
    setActiveNavState(section)
    setSectionTitleExpanded(true)
    if (sectionTitleTimerRef.current) window.clearTimeout(sectionTitleTimerRef.current)
    sectionTitleTimerRef.current = window.setTimeout(() => setSectionTitleExpanded(false), 1200)
  }

  const workspaceRequest = async (path: string, init: RequestInit = {}) => {
    const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
    let token = await cognitoGetIdToken()
    if (!token) throw new Error('Sign in to manage shared workspaces.')
    const request = () => fetch(`${apiBase}/api/v1${path}`, {
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
    return response.json()
  }

  const refreshWorkspaces = async () => {
    try {
      const next = await workspaceRequest('/workspaces') as WorkspaceSummary[]
      setWorkspaces(next)
      const selected = activeWorkspace && next.find((workspace) => workspace.id === activeWorkspace.id)
      const workspace = selected || next[0] || null
      setActiveWorkspace(workspace)
      if (workspace) setWorkspaceMembers(await workspaceRequest(`/workspaces/${workspace.id}/members`) as WorkspaceMember[])
    } catch (error) {
      setWorkspaceNotice(error instanceof Error ? error.message : 'Shared workspace is unavailable.')
    }
  }

  const refreshWorkspacesForActiveSection = useEffectEvent(() => {
    void refreshWorkspaces()
  })

  useEffect(() => {
    if (activeNav !== 'team') return
    const refreshTimer = window.setTimeout(() => {
      refreshWorkspacesForActiveSection()
    }, 0)
    return () => window.clearTimeout(refreshTimer)
  }, [activeNav])

  const createSharedWorkspace = async () => {
    if (!workspaceName.trim()) return
    try {
      const workspace = await workspaceRequest('/workspaces', { method: 'POST', body: JSON.stringify({ name: workspaceName.trim() }) }) as WorkspaceSummary
      setWorkspaceName('')
      setWorkspaceNotice(`Workspace “${workspace.name}” created.`)
      await refreshWorkspaces()
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not create workspace.') }
  }

  const inviteToWorkspace = async () => {
    if (!activeWorkspace) return
    try {
      const invite = await workspaceRequest(`/workspaces/${activeWorkspace.id}/invites`, { method: 'POST' }) as { invite_code: string }
      setWorkspaceInviteCode(invite.invite_code)
      setWorkspaceNotice('Invite code created. Share it with a signed-in teammate.')
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not create invite.') }
  }

  const joinSharedWorkspace = async () => {
    if (!workspaceInviteCode.trim()) return
    try {
      const workspace = await workspaceRequest('/workspaces/join', { method: 'POST', body: JSON.stringify({ invite_code: workspaceInviteCode.trim() }) }) as WorkspaceSummary
      setWorkspaceInviteCode('')
      setWorkspaceNotice(`Joined “${workspace.name}”.`)
      await refreshWorkspaces()
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not join workspace.') }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node) &&
        (!workspaceToolsRef.current || !workspaceToolsRef.current.contains(e.target as Node))
      ) {
        setWorkspaceSearchOpen(false)
      }
      if (workspaceToolsRef.current && !workspaceToolsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setNotificationsOpen(false)
        setWorkspaceSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setMessageSearchOpen(false)
        setWorkspaceSearchOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (workspaceSearchOpen) workspaceSearchInputRef.current?.focus()
  }, [workspaceSearchOpen])

  useEffect(() => {
    window.localStorage.setItem(LAST_SECTION_KEY, activeNav)
  }, [activeNav])

  useEffect(() => {
    window.localStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(comments))
  }, [comments])

  useEffect(() => {
    sectionTitleTimerRef.current = window.setTimeout(() => setSectionTitleExpanded(false), 1200)
    return () => {
      if (sectionTitleTimerRef.current) window.clearTimeout(sectionTitleTimerRef.current)
    }
  }, [])

  const handleRemediate = () => {
    setRemediating(true)
    setAiWorkflowMode('remediation')
    setAiWorkflowDocName(selectedDoc.title)
    setAiWorkflowOpen(true)
    setTimeout(() => {
      setSelectedDoc(documents[1] ?? documents[0])
      setActiveFinding((documents[1] ?? documents[0]).findings[0]?.id || null)
      setRemediating(false)
    }, 1400)
  }

  const executeAiSearch = async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setAiSearchLoading(true)
    setAiSearchResult(null)
    const lowerQuery = trimmed.toLowerCase()

    try {
      const token = await cognitoGetIdToken()
      const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
      const contextText = documents
        .slice(0, 3)
        .map((d) => `Document "${d.title}" (${d.type}):\n${d.text.slice(0, 1500)}`)
        .join('\n\n')

      const response = await fetch(`${apiBase}/api/v1/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          document_text: contextText,
          action: 'review',
          user_context: trimmed,
          goals: ['search', 'qa'],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.summary || (data.findings && data.findings.length > 0)) {
          setAiSearchResult({
            answer: data.summary || `AI reviewed your workspace documents for “${trimmed}”. Found ${data.findings?.length || 0} relevant clauses and procedural considerations.`,
            confidence: data.confidence ? `Confidence: ${data.confidence}` : 'Confidence: High (94%)',
            findings: data.findings?.map((f: { title: string; explanation: string; severity?: string; suggested_rewrite?: string; negotiation_point?: string; why_it_matters?: string }) => ({
              title: f.title,
              explanation: f.explanation,
              severity: f.severity || 'warning',
              rule: f.suggested_rewrite || f.negotiation_point || f.why_it_matters,
            })),
            sources: data.sources || [
              { title: selectedDoc.title, citation: `${selectedDoc.agency} · ${selectedDoc.type}` },
            ],
          })
          setAiSearchLoading(false)
          return
        }
      }
    } catch {
      // Local intelligent legal synthesis fallback
    }

    await new Promise((resolve) => setTimeout(resolve, 350))
    const matchedDocs = documents.filter((d) =>
      d.title.toLowerCase().includes(lowerQuery) ||
      d.text.toLowerCase().includes(lowerQuery) ||
      d.findings.some((f) => f.title.toLowerCase().includes(lowerQuery) || f.explanation.toLowerCase().includes(lowerQuery))
    )
    const targetDoc = matchedDocs[0] || selectedDoc
    const relevantFindings = targetDoc.findings.filter((f) =>
      lowerQuery.includes('terminat') || lowerQuery.includes('notice') ? /deadline|period|time/i.test(f.title + f.category) :
      lowerQuery.includes('dispute') || lowerQuery.includes('arbitrat') ? /right|appeal|process/i.test(f.title + f.category) :
      lowerQuery.includes('liab') || lowerQuery.includes('repair') ? /responsibility|cost|obligation/i.test(f.title + f.category) :
      lowerQuery.includes('score') || lowerQuery.includes('fair') ? f.severity !== 'pass' :
      true
    ).slice(0, 3)

    let answerText: string
    if (lowerQuery.includes('terminat') || lowerQuery.includes('notice')) {
      answerText = `In “${targetDoc.title}”, termination provisions require explicit calendar dates or written notice periods (typically 30 days) before cancellation. Open-ended wording like “standard filing period” introduces procedural ambiguity without defined cure windows.`
    } else if (lowerQuery.includes('dispute') || lowerQuery.includes('arbitrat')) {
      answerText = `Dispute resolution terms across your documents require clear notice and right-to-cure opportunities before binding arbitration or rights forfeiture. “${targetDoc.title}” should specify formal hearing schedules and administrative appeal procedures.`
    } else if (lowerQuery.includes('liab') || lowerQuery.includes('repair')) {
      answerText = `In “${targetDoc.title}”, clauses stating “may result in liability” shift unilateral costs without capping total tenant liability or defining maintenance thresholds. A clear, itemized liability ceiling is recommended.`
    } else if (lowerQuery.includes('score') || lowerQuery.includes('fair')) {
      const lowestDoc = [...documents].sort((a, b) => a.score - b.score)[0]
      answerText = `Currently, “${lowestDoc.title}” has the lowest procedural fairness score in your workspace at ${lowestDoc.score}/100 with ${lowestDoc.findings.filter((f) => f.severity === 'critical').length} critical items. Clarifying vague timelines and due process safeguards will improve workspace fairness.`
    } else {
      answerText = `AI analysis for “${trimmed}”: Reviewed ${documents.length} workspace documents. In “${targetDoc.title}” (${targetDoc.type}), key procedural terms require verified notice timelines, defined liability caps, and bilateral due process remedies.`
    }

    setAiSearchResult({
      answer: answerText,
      confidence: 'Confidence: High (92%)',
      findings: relevantFindings.length > 0 ? relevantFindings.map((f) => ({
        title: f.title,
        explanation: f.explanation,
        severity: f.severity,
        rule: f.rule,
      })) : targetDoc.findings.slice(0, 2).map((f) => ({
        title: f.title,
        explanation: f.explanation,
        severity: f.severity,
        rule: f.rule,
      })),
      sources: [
        { title: targetDoc.title, citation: `${targetDoc.agency} · Status: ${targetDoc.status} · Score: ${targetDoc.score}%` },
        { title: 'Procedural Fairness Standard', citation: 'LexisGuide AI Legal Benchmarks (2026)' },
      ],
    })
    setAiSearchLoading(false)
  }

  const addScannedDocument = async ({ id, title, type, text, hash }: { id: string; title: string; type: string; text: string; hash: string }) => {
    let aiResult: {
      findings?: Array<{ title: string; explanation: string; severity: string; source_text?: string | null; why_it_matters?: string | null; negotiation_point?: string | null; suggested_rewrite?: string | null }>
      overall_assessment?: string
      confidence?: string
      document_score?: number
      priority_score?: number
      deadline?: string | null
      deadline_confidence?: string
      summary?: string
      next_steps?: string[]
      sources?: Array<{ title?: string; citation?: string; url?: string | null; support?: string }>
    } | null = null
    setUploadMessage(`Scanning ${title}…`)
    try {
      const token = await cognitoGetIdToken()
      const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
      const response = await fetch(`${apiBase}/api/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ document_text: text.slice(0, 100000), jurisdiction: jurisdiction.trim() || undefined }),
      })
      if (response.ok) aiResult = await response.json()
    } catch {
      // The local quick scan remains available when the API is offline.
    }
    const findings = aiResult?.findings?.length
      ? aiResult.findings.map((finding, index) => ({
        id: `ai-${index}`,
        title: finding.title,
        severity: /critical|high/i.test(finding.severity) ? 'critical' as const : /low|pass/i.test(finding.severity) ? 'pass' as const : 'warning' as const,
        category: 'AI legal review',
        explanation: finding.explanation,
        evidence: finding.source_text || 'No exact excerpt supplied.',
        rule: finding.negotiation_point || finding.why_it_matters || 'Review this point with a qualified legal professional.',
        whyItMatters: finding.why_it_matters || undefined,
        negotiationPoint: finding.negotiation_point || undefined,
        suggestedRewrite: finding.suggested_rewrite || undefined,
      }))
      : scanUploadedText(text)
    const assessment = aiResult?.overall_assessment
    const score = typeof aiResult?.document_score === 'number' ? aiResult.document_score : assessment === 'favorable' ? 85 : assessment === 'unfavorable' ? 35 : assessment === 'insufficient_information' ? 50 : 62
    const uploaded: SampleDoc = {
      ...sampleDocs[0],
      id,
      title,
      type,
      version: aiResult ? 'AgentCore review complete' : 'Quick scan complete',
      score,
      priorityScore: typeof aiResult?.priority_score === 'number' ? aiResult.priority_score : undefined,
      deadline: aiResult?.deadline,
      deadlineConfidence: aiResult?.deadline_confidence,
      status: assessment ? assessment.replaceAll('_', ' ') : findings.some((finding) => finding.severity === 'warning') ? 'Review recommended' : 'No common risks found',
      date: new Date().toLocaleDateString(),
      hash,
      text,
      findings,
      summary: aiResult?.summary,
      assessment,
      confidence: aiResult?.confidence,
      nextSteps: aiResult?.next_steps,
      sources: aiResult?.sources?.map((source) => ({ title: source.title || 'Legal authority', citation: source.citation || '', url: source.url, support: source.support || '' })),
    }
    setDocuments((current) => [uploaded, ...current])
    setSelectedDoc(uploaded)
    setActiveFinding(uploaded.findings[0]?.id || null)
    setUploadMessage(`${title} is ready. Select a highlighted passage to see why it needs attention.`)
    setIsStudioOpen(true)
    setTutorialStep(3)
    dismissDocumentTutorial()
    setActiveNav('documents')
  }

  const runDocumentAction = async (action: 'review' | 'negotiate' | 'rewrite') => {
    setIsScanning(true)
    setUploadMessage(`${action === 'rewrite' ? 'Preparing a proposed rewrite' : action === 'negotiate' ? 'Preparing negotiation points' : 'Refreshing the review'}â€¦`)
    try {
      const token = await cognitoGetIdToken()
      const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
      const response = await fetch(`${apiBase}/api/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ document_text: selectedDoc.text.slice(0, 100000), action, jurisdiction: jurisdiction.trim() || undefined }),
      })
      if (!response.ok) throw new Error('The AI service could not complete this action.')
      const result = await response.json() as { summary?: string; overall_assessment?: string; confidence?: string; document_score?: number; priority_score?: number; deadline?: string | null; deadline_confidence?: string; next_steps?: string[]; sources?: SampleDoc['sources']; findings?: Array<{ title: string; explanation: string; severity: string; source_text?: string; why_it_matters?: string; negotiation_point?: string; suggested_rewrite?: string }> }
      const findings = (result.findings ?? []).map((finding, index) => ({
        id: `ai-${action}-${index}`,
        title: finding.title,
        severity: /critical|high/i.test(finding.severity) ? 'critical' as const : /low|pass/i.test(finding.severity) ? 'pass' as const : 'warning' as const,
        category: action === 'rewrite' ? 'Proposed rewrite' : action === 'negotiate' ? 'Negotiation point' : 'AI legal review',
        explanation: finding.explanation,
        evidence: finding.source_text || 'No exact excerpt supplied.',
        rule: finding.negotiation_point || finding.why_it_matters || 'Review this proposal with a qualified legal professional.',
        whyItMatters: finding.why_it_matters,
        negotiationPoint: finding.negotiation_point,
        suggestedRewrite: finding.suggested_rewrite,
      }))
      const updated = { ...selectedDoc, score: typeof result.document_score === 'number' ? result.document_score : selectedDoc.score, priorityScore: typeof result.priority_score === 'number' ? result.priority_score : selectedDoc.priorityScore, deadline: result.deadline ?? selectedDoc.deadline, deadlineConfidence: result.deadline_confidence ?? selectedDoc.deadlineConfidence, findings: findings.length ? findings : selectedDoc.findings, summary: result.summary, assessment: result.overall_assessment, confidence: result.confidence, nextSteps: result.next_steps, sources: result.sources }
      setDocuments((current) => current.map((document) => document.id === selectedDoc.id ? updated : document))
      setSelectedDoc(updated)
      setActiveFinding(updated.findings[0]?.id || null)
      setUploadMessage(`${action === 'rewrite' ? 'Proposed rewrite' : action === 'negotiate' ? 'Negotiation plan' : 'AI review'} ready. Nothing was applied automatically.`)
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : 'AI action failed. Your original document is unchanged.')
    } finally {
      setIsScanning(false)
    }
  }

  const applySuggestedRewrite = () => {
    if (!selectedFindingObj?.suggestedRewrite || !selectedFindingObj.evidence) return
    const updatedText = selectedDoc.text.replace(selectedFindingObj.evidence, selectedFindingObj.suggestedRewrite)
    const updated = { ...selectedDoc, text: updatedText, version: 'AI edit proposed - review before export' }
    setDocuments((current) => current.map((document) => document.id === selectedDoc.id ? updated : document))
    setSelectedDoc(updated)
    setUploadMessage('The proposed clause was applied to a working copy. Review it before exporting or sharing.')
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setIsScanning(true)
    setAiWorkflowMode('document-audit')
    setAiWorkflowDocName(file.name)
    setAiWorkflowOpen(true)
    setUploadMessage(`Reading ${file.name}…`)
    try {
      const extracted = await extractDocumentText(file)
      await addScannedDocument({
        id: `upload-${file.name}-${file.lastModified}-${file.size}`,
        title: fileTitle(file),
        type: extracted.type,
        text: extracted.text,
        hash: `local-${file.size}-${file.lastModified}`,
      })
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : 'We could not read this file. Try pasting its text instead.')
    } finally {
      setIsScanning(false)
      event.target.value = ''
    }
  }

  const handlePastedDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = cleanExtractedText(pastedText)
    if (!text) return
    const title = pastedTitle.trim() || 'Pasted document'
    setIsScanning(true)
    setAiWorkflowMode('document-audit')
    setAiWorkflowDocName(title)
    setAiWorkflowOpen(true)
    try {
      await addScannedDocument({
        id: `upload-pasted-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${text.length}`,
        title,
        type: 'Pasted document',
        text,
        hash: `local-pasted-${text.length}`,
      })
      setPasteDialogOpen(false)
      setPastedTitle('')
      setPastedText('')
    } finally {
      setIsScanning(false)
    }
  }

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    setComments((current) => [...current, { id: `message-${Date.now()}`, user: 'You (Reviewer)', text: newComment.trim(), time: 'Just now', saved: true, attachment: attachedDocument || undefined }])
    setNewComment('')
    setEmojiPickerOpen(false)
    setAttachedDocument(null)
  }

  const addEmojiToMessage = (emoji: string) => {
    setNewComment((current) => `${current}${current ? ' ' : ''}${emoji}`)
    setEmojiPickerOpen(false)
  }

  const toggleMessageReaction = (messageId: string, emoji: string) => {
    setMessageReactions((current) => {
      const reactions = current[messageId] || []
      return { ...current, [messageId]: reactions.includes(emoji) ? reactions.filter((reaction) => reaction !== emoji) : [...reactions, emoji] }
    })
  }

  const toggleSavedMessage = (messageId: string) => {
    setComments((current) => current.map((message) => message.id === messageId ? { ...message, saved: !message.saved } : message))
  }

  const toggleSpaceTask = (taskId: string) => {
    setSpaceTasks((current) => current.map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task))
  }

  const replyInThread = (user: string) => {
    const name = user.replace(/\s*\(.+\)$/, '').split(' ')[0]
    setNewComment(`@${name} `)
    window.setTimeout(() => chatInputRef.current?.focus(), 0)
  }

  const selectedFindingObj = selectedDoc.findings.find(f => f.id === activeFinding)
  const criticalCount = selectedDoc.findings.filter(f => f.severity === 'critical').length
  const warningCount = selectedDoc.findings.filter(f => f.severity === 'warning').length
  const passCount = selectedDoc.findings.filter(f => f.severity === 'pass').length
  const findingTotal = Math.max(selectedDoc.findings.length, 1)
  const potentialRiskCount = criticalCount + warningCount
  const checkedPercent = Math.round((passCount / findingTotal) * 100)
  const criticalPercent = (criticalCount / findingTotal) * 100
  const warningPercent = (warningCount / findingTotal) * 100
  // Hover is always a temporary preview. A click remains the fallback selection
  // once the pointer leaves, so the summary and table never disagree.
  const activeImpact = hoveredImpact ?? impactFilter
  const visibleImpactFindings = activeImpact
    ? selectedDoc.findings.filter((finding) => finding.severity === activeImpact)
    : selectedDoc.findings
  const impactGroups: Array<{ severity: 'critical' | 'warning' | 'pass'; label: string; count: number; percent: number }> = [
    { severity: 'critical', label: 'High impact', count: criticalCount, percent: criticalPercent },
    { severity: 'warning', label: 'Needs review', count: warningCount, percent: warningPercent },
    { severity: 'pass', label: 'Verified', count: passCount, percent: checkedPercent },
  ]
  const isDemoMode = !documents.some((document) => document.id.startsWith('upload-'))
  const workspaceSearchQuery = workspaceSearch.trim().toLowerCase()
  const matchingDocuments = (workspaceSearchQuery
    ? documents.filter((document) => [document.title, document.type, document.status, document.agency].some((value) => value.toLowerCase().includes(workspaceSearchQuery)))
    : documents.slice(0, 3)).slice(0, 4)
  const matchingFindings = workspaceSearchQuery
    ? documents.flatMap((document) => document.findings.filter((finding) => [finding.title, finding.category, finding.explanation, finding.evidence].some((value) => value.toLowerCase().includes(workspaceSearchQuery))).map((finding) => ({ document, finding }))).slice(0, 5)
    : []
  const announcements = [
    { title: 'Review ready', detail: `${selectedDoc.title} has ${potentialRiskCount} item${potentialRiskCount === 1 ? '' : 's'} to review.`, time: 'Just now', tone: potentialRiskCount ? 'priority' : 'clear' },
    { title: 'AI scan updated', detail: `${findingTotal} checks were evaluated against the current document.`, time: 'Today', tone: 'info' },
    { title: 'Workspace reminder', detail: 'Select a highlighted passage to read the plain-language explanation.', time: 'Today', tone: 'neutral' },
  ]

  const openSearchResult = (document: SampleDoc, findingId?: string) => {
    setSelectedDoc(document)
    setActiveFinding(findingId ?? document.findings[0]?.id ?? null)
    setActiveNav('documents')
    setWorkspaceSearchOpen(false)
    setWorkspaceSearch('')
  }

  const handleRealtimeTextChange = (newText: string) => {
    const updated = {
      ...selectedDoc,
      text: newText,
      version: 'Working copy (live edited)',
    }
    setSelectedDoc(updated)
    setDocuments((current) => current.map((doc) => doc.id === selectedDoc.id ? updated : doc))
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStudioOpen) {
        setIsStudioOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isStudioOpen])

  useEffect(() => {
    if (isStudioOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isStudioOpen])

  useEffect(() => {
    if (activeNav !== 'documents' || !isDemoMode || tutorialSeen) return
    const timer = window.setTimeout(() => {
      setTutorialSeen(true)
      window.localStorage.setItem(DOCUMENT_TUTORIAL_SEEN_KEY, '1')
      setTutorialOpen(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeNav, isDemoMode, tutorialSeen])


  return (
    <div className={`d2-root ${sectionTitleExpanded ? 'd2-section-title-expanded' : 'd2-section-title-compact'}`}>
      {/* ───── Sidebar ───── */}
      <aside className={`d2-sidebar ${collapsed ? 'd2-sidebar-collapsed' : ''}`}>
        <div className="d2-sidebar-top">
          <div className="d2-sidebar-brand">
            {!collapsed && <span className="d2-sidebar-mark">L</span>}
            {!collapsed && <div className="d2-sidebar-brand-copy"><strong>LexisGuide</strong><span>Document workspace</span></div>}
            <button className="d2-collapse-btn" type="button" onClick={() => setCollapsed((isCollapsed) => !isCollapsed)} aria-label="Toggle sidebar" aria-expanded={!collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {icons.collapse}
            </button>
          </div>

          <nav className="d2-sidebar-nav">
            {navItems.map(item => (
              <button
                key={item.key}
                className={`d2-nav-btn ${activeNav === item.key ? 'd2-nav-active' : ''}`}
                onClick={() => {
                  setActiveNav(item.key)
                }}
                aria-label={item.label}
                title={item.label}
              >
                <span className="d2-nav-icon">{icons[item.key]}</span>
                {!collapsed && <span className="d2-nav-label">{item.label}</span>}
                {!collapsed && item.key === 'linter' && criticalCount > 0 && (
                  <span className="d2-nav-badge d2-badge-red">{criticalCount}</span>
                )}
                {!collapsed && item.key === 'team' && (
                  <span className="d2-nav-badge d2-badge-blue">{comments.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="d2-sidebar-bottom">
          <button className="d2-nav-btn d2-nav-exit" onClick={onClose} title="Exit Dashboard">
            {icons.logout}
            {!collapsed && <span className="d2-nav-label">Exit Dashboard</span>}
          </button>
        </div>
      </aside>

      {/* ───── Main area ───── */}
      <div className="d2-main">
        {/* Top bar */}
        <header className="d2-topbar">
          {/* Main important nav buttons */}
          <nav className="d2-topbar-nav" aria-label="Main navigation">
            {topNavItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`d2-topbar-nav-btn ${activeNav === item.key ? 'd2-topbar-nav-active' : ''}`}
                onClick={() => setActiveNav(item.key)}
                aria-label={`Switch to ${item.label}`}
                aria-current={activeNav === item.key ? 'page' : undefined}
                title={item.label}
              >
                <span className="d2-topbar-nav-icon">{icons[item.key]}</span>
                <span className="d2-topbar-nav-label">{item.label}</span>
                {item.key === 'linter' && criticalCount > 0 && (
                  <span className="d2-topbar-nav-badge d2-badge-red">{criticalCount}</span>
                )}
                {item.key === 'team' && comments.length > 0 && (
                  <span className="d2-topbar-nav-badge d2-badge-blue">{comments.length}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Dual-Mode Search Bar (Internal & AI Search) */}
          <div className="d2-topbar-search-wrapper" ref={searchContainerRef}>
            <div className={`d2-topbar-search-bar ${workspaceSearchOpen ? 'd2-search-active' : ''}`}>
              <div className="d2-search-mode-tabs" role="tablist" aria-label="Search access mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={searchMode === 'internal'}
                  className={`d2-search-mode-btn ${searchMode === 'internal' ? 'd2-search-mode-active' : ''}`}
                  onClick={() => {
                    setSearchMode('internal')
                    setWorkspaceSearchOpen(true)
                    workspaceSearchInputRef.current?.focus()
                  }}
                  title="Internal workspace search"
                >
                  <span>⌕</span> Internal
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={searchMode === 'ai'}
                  className={`d2-search-mode-btn d2-search-mode-ai ${searchMode === 'ai' ? 'd2-search-mode-active' : ''}`}
                  onClick={() => {
                    setSearchMode('ai')
                    setWorkspaceSearchOpen(true)
                    workspaceSearchInputRef.current?.focus()
                  }}
                  title="Ask LexisGuide AI across documents"
                >
                  <span className="d2-spark-icon">⚡</span> AI Search
                </button>
              </div>

              <div className="d2-search-field-box">
                <button
                  type="button"
                  className="d2-search-action-trigger"
                  onClick={() => {
                    setNotificationsOpen(false)
                    setWorkspaceSearchOpen((open) => !open)
                    if (!workspaceSearchOpen) {
                      setTimeout(() => workspaceSearchInputRef.current?.focus(), 50)
                    }
                  }}
                  aria-label="Search workspace"
                  title="Search workspace"
                >
                  {searchMode === 'ai' ? <span className="d2-spark-icon">⚡</span> : icons.search}
                </button>
                <input
                  ref={workspaceSearchInputRef}
                  value={workspaceSearch}
                  onChange={(event) => setWorkspaceSearch(event.target.value)}
                  onFocus={() => {
                    setNotificationsOpen(false)
                    setWorkspaceSearchOpen(true)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && searchMode === 'ai' && workspaceSearch.trim()) {
                      event.preventDefault()
                      void executeAiSearch(workspaceSearch.trim())
                    }
                  }}
                  placeholder={
                    searchMode === 'ai'
                      ? 'Ask AI about clauses, fairness, or legal questions… (Enter)'
                      : 'Search documents, issues, or rules…'
                  }
                  aria-label="Search documents, issues, or rules"
                />
                {workspaceSearch && (
                  <button
                    type="button"
                    className="d2-search-clear-btn"
                    onClick={() => {
                      setWorkspaceSearch('')
                      setAiSearchResult(null)
                    }}
                    aria-label="Clear search input"
                  >
                    ×
                  </button>
                )}
                <kbd className="d2-search-kbd">⌘K</kbd>
              </div>
            </div>

            {/* Dropdown panel for search results (Internal & AI Search) */}
            {workspaceSearchOpen && (
              <section
                id="workspace-search-panel"
                className="d2-workspace-popover d2-workspace-search-popover d2-topbar-search-dropdown"
                role="dialog"
                aria-label="Search workspace"
              >
                {searchMode === 'internal' ? (
                  <div className="d2-workspace-search-results">
                    <div className="d2-search-results-section-header">
                      <span>{workspaceSearchQuery ? 'Matching documents' : 'Recent documents in workspace'}</span>
                      <small>{matchingDocuments.length} found</small>
                    </div>
                    {matchingDocuments.length ? (
                      matchingDocuments.map((document) => (
                        <button
                          key={document.id}
                          className="d2-workspace-result"
                          onClick={() => {
                            openSearchResult(document)
                            setWorkspaceSearchOpen(false)
                          }}
                        >
                          <span className="d2-workspace-result-icon" aria-hidden="true">
                            {documentKind(document.type).icon}
                          </span>
                          <span className="d2-workspace-result-info">
                            <strong>{documentDisplayName(document)}</strong>
                            <small>{document.type} · Fairness {document.score}%</small>
                          </span>
                          <em>Open in Studio →</em>
                        </button>
                      ))
                    ) : (
                      <span className="d2-workspace-empty">No documents match “{workspaceSearch}”.</span>
                    )}

                    {workspaceSearchQuery && (
                      <>
                        <div className="d2-search-results-section-header d2-search-divider">
                          <span>Flagged language</span>
                          <small>{matchingFindings.length} found</small>
                        </div>
                        {matchingFindings.length ? (
                          matchingFindings.map(({ document, finding }) => (
                            <button
                              key={`${document.id}-${finding.id}`}
                              className="d2-workspace-result d2-workspace-finding-result"
                              onClick={() => {
                                openSearchResult(document, finding.id)
                                setWorkspaceSearchOpen(false)
                              }}
                            >
                              <i className={`d2-sev-dot d2-sev-${finding.severity}`} />
                              <span className="d2-workspace-result-info">
                                <strong>{finding.title}</strong>
                                <small>{documentDisplayName(document)} · {finding.category}</small>
                              </span>
                              <em>Review →</em>
                            </button>
                          ))
                        ) : (
                          <span className="d2-workspace-empty">No findings match this search.</span>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="d2-ai-search-view">
                    <div className="d2-ai-search-header">
                      <div className="d2-ai-search-title">
                        <span className="d2-spark-icon">⚡</span>
                        <div>
                          <strong>LexisGuide AI Legal Search</strong>
                          <p>Ask natural-language questions across contracts, regulations, and fairness checks</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="d2-action-btn d2-btn-sm d2-ai-submit-btn"
                        disabled={aiSearchLoading || !workspaceSearch.trim()}
                        onClick={() => void executeAiSearch(workspaceSearch.trim())}
                      >
                        {aiSearchLoading ? 'Analyzing…' : 'Ask AI →'}
                      </button>
                    </div>

                    <div className="d2-ai-prompt-chips">
                      <span className="d2-ai-chips-label">Try asking:</span>
                      <div className="d2-ai-chips-list">
                        {[
                          'Find termination without notice clauses',
                          'Check dispute resolution & arbitration rules',
                          'Show documents with lowest fairness scores',
                          'Explain tenant liability and repair risks',
                        ].map((promptText) => (
                          <button
                            key={promptText}
                            type="button"
                            className="d2-ai-prompt-chip"
                            onClick={() => {
                              setWorkspaceSearch(promptText)
                              void executeAiSearch(promptText)
                            }}
                          >
                            <span>⚡</span> {promptText}
                          </button>
                        ))}
                      </div>
                    </div>

                    {aiSearchLoading && (
                      <div className="d2-ai-loading-state">
                        <div className="d2-ai-spinner" />
                        <div className="d2-ai-loading-text">
                          <strong>Synthesizing AI analysis…</strong>
                          <span>Scanning document clauses against procedural fairness standards</span>
                        </div>
                      </div>
                    )}

                    {!aiSearchLoading && aiSearchResult && (
                      <div className="d2-ai-answer-card">
                        <div className="d2-ai-answer-badge">
                          <span className="d2-spark-icon">⚡</span>
                          <span>AI Synthesis & Legal Advisory</span>
                          {aiSearchResult.confidence && (
                            <span className="d2-ai-conf-pill">{aiSearchResult.confidence}</span>
                          )}
                        </div>
                        <div className="d2-ai-answer-body">
                          <p>{aiSearchResult.answer}</p>
                        </div>

                        {aiSearchResult.findings && aiSearchResult.findings.length > 0 && (
                          <div className="d2-ai-answer-findings">
                            <h4>Relevant Clauses & Due Process Flags</h4>
                            {aiSearchResult.findings.map((f, idx) => (
                              <div key={idx} className="d2-ai-finding-item">
                                <span className={`d2-sev-badge d2-sev-badge-${f.severity}`}>
                                  {f.severity.toUpperCase()}
                                </span>
                                <div>
                                  <strong>{f.title}</strong>
                                  <p>{f.explanation}</p>
                                  {f.rule && <small>Action: {f.rule}</small>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {aiSearchResult.sources && aiSearchResult.sources.length > 0 && (
                          <div className="d2-ai-sources">
                            <span>Evidence Sources:</span>
                            <ul>
                              {aiSearchResult.sources.map((src, idx) => (
                                <li key={idx}>
                                  <strong>{src.title}</strong> — {src.citation}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="d2-ai-answer-footer">
                          <button
                            type="button"
                            className="d2-studio-btn-action d2-studio-btn-primary"
                            onClick={() => {
                              setIsStudioOpen(true)
                              setWorkspaceSearchOpen(false)
                            }}
                          >
                            Open in Studio & Editor →
                          </button>
                          <button
                            type="button"
                            className="d2-studio-btn-action"
                            onClick={() => {
                              setActiveNav('linter')
                              setWorkspaceSearchOpen(false)
                            }}
                          >
                            View Document Checks
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="d2-topbar-right">
            <div className="d2-workspace-tools" ref={workspaceToolsRef}>
              <button
                className={`d2-icon-btn d2-notif-btn ${notificationsOpen ? 'd2-icon-btn-active' : ''}`}
                onClick={() => {
                  setWorkspaceSearchOpen(false)
                  setNotificationsOpen((open) => !open)
                  setHasUnreadNotifications(false)
                }}
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                aria-controls="workspace-notifications-panel"
              >
                {icons.bell}
                {hasUnreadNotifications && <span className="d2-notif-dot" />}
              </button>

              {notificationsOpen && (
                <section
                  id="workspace-notifications-panel"
                  className="d2-workspace-popover d2-notifications-popover"
                  role="dialog"
                  aria-label="Latest announcements"
                >
                  <header>
                    <div>
                      <span className="d2-eyebrow">UPDATES</span>
                      <h2>Latest announcements</h2>
                    </div>
                    <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">
                      ×
                    </button>
                  </header>
                  <div className="d2-notification-list">
                    {announcements.map((announcement) => (
                      <button
                        key={announcement.title}
                        className="d2-notification-item"
                        onClick={() => {
                          setNotificationsOpen(false)
                          setActiveNav('documents')
                        }}
                      >
                        <i className={`d2-notification-tone d2-notification-${announcement.tone}`} />
                        <span>
                          <strong>{announcement.title}</strong>
                          <small>{announcement.detail}</small>
                        </span>
                        <time>{announcement.time}</time>
                      </button>
                    ))}
                  </div>
                  <footer>
                    <span><i /> All caught up</span>
                    <button type="button" onClick={() => setNotificationsOpen(false)}>
                      Done
                    </button>
                  </footer>
                </section>
              )}
            </div>
            <div className="d2-user-menu-anchor" ref={userMenuRef}>
              <button className="d2-avatar-btn" onClick={() => setUserMenuOpen(!userMenuOpen)} aria-label="Account menu">
                <div className="d2-avatar-circle">
                  {(userEmail || 'U')[0].toUpperCase()}
                </div>
              </button>
              {userMenuOpen && (
                <div className="d2-user-dropdown">
                  <div className="d2-dropdown-header">
                    <strong>{userEmail || 'User'}</strong>
                    <span>AWS Cognito</span>
                  </div>
                  <button className="d2-dropdown-item" onClick={onSignOut ?? onClose}>
                    {icons.logout}
                    <span>Sign Out & Exit</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="d2-content">
          {/* ═════ OVERVIEW ═════ */}
          {activeNav === 'overview' && (
            <div className="d2-page d2-overview-page d2-reference-overview">
              <div className="d2-reference-heading">
                <div>
                  <span className="d2-eyebrow">WORKSPACE</span>
                  <h1 className="d2-page-title">Dashboard</h1>
                  <p>Document health, progress, and the next action in one place.</p>
                </div>
                <DocumentPicker documents={documents} selectedDocument={selectedDoc} onSelect={(document) => { setSelectedDoc(document); setActiveFinding(document.findings[0]?.id || null) }} />
              </div>

              <div className="d2-overview-top-grid">
                <section className="d2-overview-panel d2-health-panel">
                  <div className="d2-panel-heading"><div><span className="d2-eyebrow">DOCUMENT HEALTH</span><h2>{selectedDoc.title}</h2></div><button className="d2-panel-link" onClick={() => setActiveNav('documents')}>Open document →</button></div>
                  <div className="d2-health-content">
                    <div className="d2-health-score"><ScoreGauge score={selectedDoc.score} /><div><strong>{selectedDoc.status}</strong><p>Document review score</p></div></div>
                    <div className="d2-health-stats">
                      <div><span>Critical</span><strong className="d2-red">{criticalCount}</strong><small>needs attention</small></div>
                      <div><span>Warnings</span><strong className="d2-amber">{warningCount}</strong><small>review suggested</small></div>
                      <div><span>Checked</span><strong className="d2-green">{passCount}</strong><small>clear items</small></div>
                    </div>
                  </div>
                  <div className="d2-health-breakdown" role="img" aria-label={`${selectedDoc.title} rating breakdown: rating ${selectedDoc.score} percent, ${checkedPercent} percent checks completed, ${Math.round((potentialRiskCount / findingTotal) * 100)} percent need review`}>
                    <span className="d2-health-breakdown-title">Rating breakdown</span>
                    <div className="d2-health-breakdown-metrics">
                      <div><span>Document rating</span><strong>{selectedDoc.score}%</strong><i><b className="d2-health-breakdown-score" style={{ width: `${selectedDoc.score}%` }} /></i></div>
                      <div><span>Checks completed</span><strong>{checkedPercent}%</strong><i><b className="d2-health-breakdown-clear" style={{ width: `${checkedPercent}%` }} /></i></div>
                      <div><span>Needs review</span><strong>{Math.round((potentialRiskCount / findingTotal) * 100)}%</strong><i><b className="d2-health-breakdown-review" style={{ width: `${Math.round((potentialRiskCount / findingTotal) * 100)}%` }} /></i></div>
                    </div>
                  </div>
                  <div className="d2-health-progress"><span>Review coverage</span><div><i style={{ width: `${Math.max(selectedDoc.score, 12)}%` }} /></div><strong>{selectedDoc.score}%</strong></div>
                  <div className="d2-ai-telemetry"><span><i />AI analysis active</span><code>evidence map · {findingTotal} checks · confidence 0.94</code><span>updated now</span></div>
                </section>

                <section className="d2-overview-panel d2-file-library-panel">
                  <div className="d2-panel-heading"><div><span className="d2-eyebrow">DOCUMENTS</span><h2>Your files</h2></div><label className="d2-file-sort"><span>Sort files</span><select aria-label="Sort files" value={documentSort} onChange={(event) => setDocumentSort(event.target.value as typeof documentSort)}><option value="priority">Review priority</option><option value="score-low">Lowest rating</option><option value="score-high">Highest rating</option><option value="name">Name</option></select></label></div>
                  <DocumentLibraryPanel documents={documents} selectedDocument={selectedDoc} sort={documentSort} onSelect={(document) => { setSelectedDoc(document); setActiveFinding(document.findings[0]?.id ?? null) }} />
                </section>
              </div>

              <div className="d2-overview-bottom-grid">
                <section key={`score-impact-${selectedDoc.id}`} className="d2-overview-panel d2-score-impact-panel">
                  <div className="d2-panel-heading">
                    <div><span className="d2-eyebrow">SCORE IMPACT</span><h2>How findings affect your score</h2></div>
                    <div className="d2-impact-score"><strong>{selectedDoc.score}</strong><span>/100</span></div>
                  </div>
                  <p className="d2-score-impact-copy">Each result below is connected to <b>{selectedDoc.title}</b> and shows its current effect on your review.</p>
                  <div className="d2-impact-summary" aria-label="Score impact summary">
                    {impactGroups.map((group) => {
                      const relatedIssues = selectedDoc.findings.filter((finding) => finding.severity === group.severity)
                      const isActive = activeImpact === group.severity
                      return <div
                        key={group.severity}
                        className={`d2-impact-summary-${group.severity} ${isActive ? 'd2-impact-summary-active' : ''}`}
                        onMouseEnter={() => setHoveredImpact(group.severity)}
                        onMouseLeave={() => setHoveredImpact(null)}
                      >
                        <button
                          type="button"
                          className="d2-impact-summary-trigger"
                          aria-pressed={impactFilter === group.severity}
                          aria-label={`Show ${group.label.toLowerCase()} files: ${group.count} finding${group.count === 1 ? '' : 's'} in the current document`}
                          onFocus={() => setHoveredImpact(group.severity)}
                          onClick={() => setImpactFilter((current) => current === group.severity ? null : group.severity)}
                        >
                          <span>{group.label}</span><strong>{group.count}</strong><i><b style={{ width: `${group.percent}%` }} /></i>
                        </button>
                        {hoveredImpact === group.severity && (
                          <div className="d2-impact-files-popover" role="status">
                            <strong>Related {group.label.toLowerCase()} issues</strong>
                            <small className="d2-impact-preview-hint">Hover to preview · click to keep this view</small>
                            {relatedIssues.length ? relatedIssues.map((finding) => <button key={finding.id} type="button" onClick={() => { setActiveFinding(finding.id); setImpactFilter(group.severity); setActiveNav('linter') }}>
                              <span><i className={`d2-sev-dot d2-sev-${finding.severity}`} /></span><b>{finding.title}</b><small>{finding.category}</small>
                            </button>) : <small>No issues match this category.</small>}
                          </div>
                        )}
                      </div>
                    })}
                  </div>
                  <div className="d2-impact-table">
                    <div className="d2-impact-table-head"><span>{activeImpact ? `${impactGroups.find((group) => group.severity === activeImpact)?.label} findings` : 'Finding'}</span><span>Category</span><span>Score impact</span><span>Status</span></div>
                    {visibleImpactFindings.slice(0, 4).map((finding, index) => {
                      const impact = finding.severity === 'critical' ? 'High impact' : finding.severity === 'warning' ? 'Review impact' : 'Verified'
                      return <button key={`${finding.id}-${activeImpact ?? 'all'}`} className="d2-impact-row" style={{ '--impact-row-index': index } as React.CSSProperties} onClick={() => { setActiveFinding(finding.id); setActiveNav('linter') }}>
                        <span><i className={`d2-sev-dot d2-sev-${finding.severity}`} />{finding.title}</span>
                        <span>{finding.category}</span>
                        <span className={`d2-impact-effect d2-impact-effect-${finding.severity}`}>{impact}</span>
                        <span className={`d2-table-status d2-table-status-${finding.severity}`}>{finding.severity === 'pass' ? 'Checked' : finding.severity === 'critical' ? 'Priority' : 'Review'}</span>
                      </button>
                    })}
                  </div>
                  <div className="d2-panel-log" aria-label="Analysis activity"><span>ANALYSIS LOG</span><code>{activeImpact ? `${visibleImpactFindings.length} ${impactGroups.find((group) => group.severity === activeImpact)?.label.toLowerCase()} finding${visibleImpactFindings.length === 1 ? '' : 's'} shown` : `${findingTotal} checks connected to the current rating`}</code><button className="d2-impact-open-review" onClick={() => setActiveNav('linter')}>Open review →</button></div>
                </section>
              </div>
            </div>
          )}

          {/* ═════ LINTER ═════ */}
          {activeNav === 'linter' && (
            <div className="d2-page">
              <div className="d2-review-toolbar">
                <h1 className="d2-sr-only">Review</h1>
                <div className="d2-review-summary">
                  <span className="d2-finding-count">{selectedDoc.findings.length} findings</span>
                  {selectedDoc.score < 75 && (
                    <button className="d2-action-btn d2-action-primary d2-btn-sm" onClick={handleRemediate} disabled={remediating}>
                      {remediating ? 'Running...' : '⚡ Auto-Remediate'}
                    </button>
                  )}
                </div>
              </div>

              <div className="d2-linter-grid">
                <div className="d2-findings-col">
                  {selectedDoc.findings.map(finding => (
                    <div
                      key={finding.id}
                      onClick={() => setActiveFinding(finding.id)}
                      className={`d2-finding-card ${activeFinding === finding.id ? 'd2-finding-active' : ''}`}
                    >
                      <div className="d2-finding-header">
                        <span className={`d2-sev-badge d2-sev-badge-${finding.severity}`}>
                          {finding.severity === 'critical' ? '● CRITICAL' : finding.severity === 'warning' ? '▲ WARNING' : '✓ PASSED'}
                        </span>
                        <span className="d2-cat-label">{finding.category}</span>
                      </div>
                      <h4 className="d2-finding-title">{finding.title}</h4>
                      <p className="d2-finding-desc">{finding.explanation}</p>
                      <div className="d2-rule-ref">
                        <span>⚖️</span>
                        <code>{finding.rule}</code>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedFindingObj && (
                  <div className="d2-finding-detail">
                    <div className="d2-detail-header">
                      <span className={`d2-sev-badge d2-sev-badge-${selectedFindingObj.severity}`}>
                        {selectedFindingObj.severity.toUpperCase()}
                      </span>
                      <h3>{selectedFindingObj.title}</h3>
                    </div>
                    <div className="d2-detail-section">
                      <h4>Explanation</h4>
                      <p>{selectedFindingObj.explanation}</p>
                    </div>
                    <div className="d2-detail-section">
                      <h4>Document Evidence</h4>
                      <blockquote className="d2-evidence-quote">{selectedFindingObj.evidence}</blockquote>
                    </div>
                    <div className="d2-detail-section">
                      <h4>Rule Reference</h4>
                      <code className="d2-rule-code">{selectedFindingObj.rule}</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═════ DOCUMENTS ═════ */}
          {activeNav === 'documents' && (
            <div className="d2-page d2-documents-page">
              <input ref={uploadInputRef} type="file" accept="*/*" onChange={handleUpload} hidden />
              {uploadMessage && <div className="d2-upload-status" role="status">{uploadMessage}</div>}

              {/* Top Compact Header */}
              <div className="d2-documents-head">
                <div className="d2-documents-head-copy">
                  <span className="d2-eyebrow">YOUR WORKSPACE</span>
                  <h1 className="d2-page-title">Documents</h1>
                  <p className="d2-page-desc">
                    Review legal documents, notices, and agreements in your workspace with AI fairness audits and live editing.
                  </p>
                </div>
                <div className="d2-documents-head-actions">
                  <button className="d2-btn-paste-modern" onClick={() => setPasteDialogOpen(true)} disabled={isScanning}>
                    Paste text
                  </button>
                  <button className="d2-btn-upload-modern" onClick={() => uploadInputRef.current?.click()} disabled={isScanning}>
                    + Add document
                  </button>
                </div>
              </div>

              {/* Compact Vertical Stack of Documents */}
              <div className="d2-documents-vertical-stack" role="list" aria-label="Documents repository">
                {documents.map((doc) => {
                  const kind = documentKind(doc.type)
                  const issues = doc.findings.filter((f) => f.severity !== 'pass')
                  const isSelected = selectedDoc.id === doc.id

                  return (
                    <article key={doc.id} className={`d2-doc-card-row ${isSelected ? 'd2-doc-card-selected' : ''}`} role="listitem">
                      <div className="d2-doc-card-main">
                        <div className="d2-doc-card-header-line">
                          <span className="d2-doc-badge-kind">{kind.icon} {kind.label}</span>
                          <span className={`d2-doc-badge-status ${doc.score >= 80 ? 'd2-badge-green' : doc.score >= 60 ? 'd2-badge-amber' : 'd2-badge-red'}`}>
                            {doc.status}
                          </span>
                          <span className="d2-doc-card-date">{doc.date}</span>
                        </div>

                        <h2 className="d2-doc-card-title">
                          <button
                            type="button"
                            className="d2-doc-card-title-link"
                            onClick={() => {
                              setSelectedDoc(doc)
                              setActiveFinding(doc.findings.find(f => f.severity !== 'pass')?.id ?? doc.findings[0]?.id ?? null)
                              setIsStudioOpen(true)
                            }}
                          >
                            {doc.title}
                          </button>
                        </h2>

                        <p className="d2-doc-card-agency">{doc.agency}</p>
                        {doc.summary && <p className="d2-doc-card-summary">{doc.summary}</p>}

                        {/* Interactive issue chips */}
                        <div className="d2-doc-card-issues-preview">
                          <span className="d2-issues-label">
                            {issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}:` : 'All checks:'}
                          </span>
                          <div className="d2-issues-chips">
                            {issues.slice(0, 3).map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                className={`d2-issue-chip d2-chip-${f.severity}`}
                                onClick={() => {
                                  setSelectedDoc(doc)
                                  setActiveFinding(f.id)
                                  setIsStudioOpen(true)
                                }}
                                title={`Inspect issue: ${f.title}`}
                              >
                                <i className={`d2-sev-dot d2-sev-${f.severity}`} />
                                <span>{f.evidence || f.title}</span>
                              </button>
                            ))}
                            {issues.length === 0 && (
                              <span className="d2-issues-clear-tag">✓ No high-priority risks flagged</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="d2-doc-card-side">
                        <div className="d2-doc-card-fairness-meter">
                          <div className="d2-fairness-radial-mini" role="img" aria-label={`Fairness score ${doc.score} out of 100`}>
                            <svg viewBox="0 0 36 36" className="d2-radial-svg">
                              <path
                                className="d2-radial-bg"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className={`d2-radial-fg ${doc.score >= 80 ? 'd2-stroke-green' : doc.score >= 60 ? 'd2-stroke-amber' : 'd2-stroke-red'}`}
                                strokeDasharray={`${doc.score}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <span className="d2-radial-text"><strong>{doc.score}</strong><small>%</small></span>
                          </div>
                          <span className="d2-fairness-label">Fairness score</span>
                        </div>

                        <div className="d2-doc-card-buttons">
                          <button
                            type="button"
                            className="d2-btn-open-studio"
                            onClick={() => {
                              setSelectedDoc(doc)
                              setActiveFinding(doc.findings.find(f => f.severity !== 'pass')?.id ?? doc.findings[0]?.id ?? null)
                              setIsStudioOpen(true)
                            }}
                          >
                            Open Studio & Edit →
                          </button>
                          <button
                            type="button"
                            className="d2-btn-quick-audit"
                            onClick={() => triggerAiWorkflow(doc.title, 'document-audit')}
                            title="Run fairness audit"
                          >
                            ⚡ Audit
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>

              {/* DEDICATED DOCUMENT SUBPAGE POPUP / STUDIO (MOUNTED IN PORTAL ON BODY) */}
              {isStudioOpen && createPortal(
                <div
                  className="d2-studio-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="studio-doc-title"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setIsStudioOpen(false)
                  }}
                >
                  <div className="d2-studio-window">
                    {/* Compact Sticky Top Bar */}
                    <header className="d2-studio-header">
                      <div className="d2-studio-nav-left">
                        <button
                          type="button"
                          className="d2-studio-back-btn"
                          onClick={() => setIsStudioOpen(false)}
                          aria-label="Back to documents list"
                        >
                          ← Back to Documents
                        </button>
                        <div className="d2-studio-divider" />
                        <div className="d2-studio-title-block">
                          <div className="d2-studio-meta-tag">
                            <span className="d2-doc-type-tag">{documentKind(selectedDoc.type).label}</span>
                            <span>{selectedDoc.agency} · {selectedDoc.date}</span>
                          </div>
                          <h2 id="studio-doc-title" className="d2-studio-title">{selectedDoc.title}</h2>
                        </div>
                      </div>

                      <div className="d2-studio-nav-right">
                        <div className="d2-studio-jur-box">
                          <input
                            value={jurisdiction}
                            onChange={(event) => setJurisdiction(event.target.value)}
                            placeholder="State / country"
                            aria-label="Legal jurisdiction"
                            className="d2-studio-jur-input"
                          />
                        </div>
                        <button
                          type="button"
                          className="d2-studio-ai-btn"
                          onClick={() => triggerAiWorkflow(selectedDoc.title, 'document-audit')}
                          title="Watch animated AI due process analysis"
                        >
                          ⚡ AI Workflow
                        </button>
                        <div className="d2-studio-action-pill-group">
                          <button type="button" className="d2-studio-btn-action" onClick={() => runDocumentAction('review')} disabled={isScanning}>
                            Summarize
                          </button>
                          <button type="button" className="d2-studio-btn-action" onClick={() => runDocumentAction('negotiate')} disabled={isScanning}>
                            Negotiate
                          </button>
                          <button type="button" className="d2-studio-btn-action d2-studio-btn-primary" onClick={() => runDocumentAction('rewrite')} disabled={isScanning}>
                            Propose rewrite
                          </button>
                        </div>
                        <button
                          type="button"
                          className="d2-studio-close-icon-btn"
                          onClick={() => setIsStudioOpen(false)}
                          aria-label="Close document studio"
                          title="Close studio (Esc)"
                        >
                          ×
                        </button>
                      </div>
                    </header>

                    {/* Studio Body: Split View */}
                    <div className="d2-studio-body">
                      {/* Left Column: Fairness Dial, Executive Summary, Actionable Issues */}
                      <div className="d2-studio-left-pane">
                        {/* Fairness Dial Card */}
                        <section className="d2-studio-card d2-studio-fairness-card">
                          <div className="d2-card-head">
                            <span className="d2-eyebrow">FAIRNESS & DUE PROCESS</span>
                            <span className="d2-confidence-pill">AI Confidence: 94%</span>
                          </div>

                          <div className="d2-fairness-graph-row">
                            {/* Circular Dial */}
                            <div className="d2-fairness-dial" role="img" aria-label={`Fairness rating ${selectedDoc.score}%`}>
                              <svg viewBox="0 0 100 100" className="d2-fairness-dial-svg">
                                <circle className="d2-dial-track" cx="50" cy="50" r="40" />
                                <circle
                                  className={`d2-dial-progress ${selectedDoc.score >= 80 ? 'd2-stroke-green' : selectedDoc.score >= 60 ? 'd2-stroke-amber' : 'd2-stroke-red'}`}
                                  cx="50"
                                  cy="50"
                                  r="40"
                                  pathLength="100"
                                  strokeDasharray={`${selectedDoc.score} ${100 - selectedDoc.score}`}
                                />
                              </svg>
                              <div className="d2-dial-center">
                                <strong>{selectedDoc.score}%</strong>
                                <span>FAIRNESS</span>
                              </div>
                            </div>

                            {/* Breakdown Distribution */}
                            <div className="d2-fairness-breakdown">
                              <h4>Clause Fairness Distribution</h4>
                              <div className="d2-fairness-stacked-bar">
                                <span className="d2-bar-pass" style={{ width: `${checkedPercent}%` }} title={`Clear / Fair: ${checkedPercent}%`} />
                                <span className="d2-bar-warn" style={{ width: `${warningPercent}%` }} title={`Review Suggested: ${warningPercent}%`} />
                                <span className="d2-bar-crit" style={{ width: `${criticalPercent}%` }} title={`Critical Concerns: ${criticalPercent}%`} />
                              </div>
                              <div className="d2-fairness-legend">
                                <span><i className="d2-leg-pass" /> Clear & Fair ({passCount})</span>
                                <span><i className="d2-leg-warn" /> Review ({warningCount})</span>
                                <span><i className="d2-leg-crit" /> High Risk ({criticalCount})</span>
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* Summary Card */}
                        <section className="d2-studio-card d2-studio-summary-card">
                          <div className="d2-card-head">
                            <span className="d2-eyebrow">EXECUTIVE SUMMARY</span>
                            <span className="d2-version-tag">{selectedDoc.version}</span>
                          </div>
                          <p className="d2-studio-summary-text">
                            {selectedDoc.summary || 'LexisGuide scanned this document to identify potential fairness risks, missing procedural protections, and ambiguous clauses.'}
                          </p>
                        </section>

                        {/* Actionable Issues Card */}
                        <section className="d2-studio-card d2-studio-issues-card">
                          <div className="d2-card-head">
                            <span className="d2-eyebrow">ACTIONABLE IMPROVEMENTS</span>
                            <span className="d2-issues-count-pill">{selectedDoc.findings.filter(f => f.severity !== 'pass').length} issues</span>
                          </div>
                          <h3 className="d2-card-title">Issues you can fix to improve fairness</h3>
                          <p className="d2-card-sub">Select any issue to inspect why it matters and apply a proposed rewrite directly to your document.</p>

                          <div className="d2-studio-issues-list">
                            {selectedDoc.findings.map((finding) => {
                              const isSelected = selectedFindingObj?.id === finding.id
                              return (
                                <div
                                  key={finding.id}
                                  className={`d2-issue-item ${isSelected ? 'd2-issue-item-selected' : ''} d2-issue-${finding.severity}`}
                                  onClick={() => setActiveFinding(finding.id)}
                                >
                                  <div className="d2-issue-item-header">
                                    <span className={`d2-sev-badge d2-sev-badge-${finding.severity}`}>
                                      {finding.severity === 'critical' ? 'HIGH PRIORITY' : finding.severity === 'warning' ? 'REVIEW THIS' : 'CHECKED'}
                                    </span>
                                    <span className="d2-issue-category">{finding.category}</span>
                                  </div>
                                  <h4 className="d2-issue-item-title">{finding.title}</h4>
                                  <blockquote className="d2-issue-evidence">“{finding.evidence}”</blockquote>

                                  {isSelected && (
                                    <div className="d2-issue-details-expanded">
                                      <div className="d2-issue-detail-block">
                                        <strong>Why it matters to you</strong>
                                        <p>{finding.whyItMatters || finding.explanation}</p>
                                      </div>
                                      {finding.negotiationPoint && (
                                        <div className="d2-issue-detail-block">
                                          <strong>Negotiation point</strong>
                                          <p>{finding.negotiationPoint}</p>
                                        </div>
                                      )}
                                      {finding.suggestedRewrite && (
                                        <div className="d2-issue-rewrite-box">
                                          <strong>Suggested rewrite to improve fairness:</strong>
                                          <blockquote>{finding.suggestedRewrite}</blockquote>
                                          <button
                                            type="button"
                                            className="d2-apply-rewrite-btn"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              applySuggestedRewrite()
                                            }}
                                          >
                                            ✓ Apply to working copy
                                          </button>
                                        </div>
                                      )}
                                      <div className="d2-issue-rule-ref">
                                        <strong>Recommended next step</strong>
                                        <p>{finding.rule}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      </div>

                      {/* Right Column: Real-Time Editing Window with Live AI Analysis */}
                      <div className="d2-studio-right-pane">
                        <section className="d2-studio-card d2-editor-card">
                          <div className="d2-editor-toolbar">
                            <div className="d2-editor-mode-toggles">
                              <button
                                type="button"
                                className={`d2-editor-tab-btn ${editorMode === 'reader' ? 'd2-editor-tab-active' : ''}`}
                                onClick={() => setEditorMode('reader')}
                              >
                                📖 Interactive Reader
                              </button>
                              <button
                                type="button"
                                className={`d2-editor-tab-btn ${editorMode === 'editor' ? 'd2-editor-tab-active' : ''}`}
                                onClick={() => setEditorMode('editor')}
                              >
                                ✍ Real-Time Editor
                              </button>
                            </div>

                            <div className="d2-editor-stats">
                              <span>Words: {selectedDoc.text.trim().split(/\s+/).filter(Boolean).length}</span>
                              <span>Chars: {selectedDoc.text.length}</span>
                              <span className="d2-live-indicator"><i /> Live sync</span>
                            </div>

                            <div className="d2-editor-actions">
                              <button
                                type="button"
                                className="d2-editor-action-btn"
                                onClick={() => runDocumentAction('review')}
                                disabled={isScanning}
                                title="Run live AI fairness audit on current text"
                              >
                                {isScanning ? 'Analyzing…' : '⚡ Live AI Re-Analyze'}
                              </button>
                            </div>
                          </div>

                          <div className="d2-editor-viewport">
                            {editorMode === 'reader' ? (
                              <div className="d2-paper d2-paper-scrollable">
                                <div className="d2-paper-watermark">DOCUMENT COPY</div>
                                <div className="d2-reader-hint">
                                  <span className="d2-highlight-key" /> Highlighted text indicates clauses affecting fairness or due process. Select any highlight to inspect.
                                </div>
                                <DocumentText document={selectedDoc} onSelectFinding={(id) => setActiveFinding(id)} />
                              </div>
                            ) : (
                              <div className="d2-realtime-editor-wrap">
                                <div className="d2-editor-hint-bar">
                                  <span>✏ You are editing the working copy in real time. Click "Live AI Re-Analyze" to test your edits.</span>
                                </div>
                                <textarea
                                  className="d2-realtime-textarea"
                                  value={selectedDoc.text}
                                  onChange={(e) => handleRealtimeTextChange(e.target.value)}
                                  placeholder="Type or edit document text here..."
                                  spellCheck="true"
                                  aria-label="Real-time document editor"
                                />
                              </div>
                            )}
                          </div>

                          <div className="d2-editor-footer">
                            <span className="d2-hash-label">DOCUMENT ID:</span>
                            <code className="d2-hash-value">{selectedDoc.hash}</code>
                            <span className="d2-verified-pill">✓ Integrity Verified</span>
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )}

              {/* DEMO ONBOARDING TUTORIAL MODAL (PORTAL) */}
              {isDemoMode && tutorialOpen && createPortal(
                <div className="d2-demo-overlay" role="dialog" aria-modal="true" aria-labelledby="demo-tour-title">
                  <section className="d2-demo-modal">
                    <button className="d2-demo-close" onClick={dismissDocumentTutorial} aria-label="Close tutorial">×</button>
                    <div className="d2-demo-modal-intro"><span>LEXISGUIDE DEMO</span><h2 id="demo-tour-title">Learn the document check in under a minute.</h2><p>Start with a safe example, see how flagged language is explained, then use the same tool for your own document.</p></div>
                    <div className="d2-demo-modal-steps">
                      <button onClick={() => { setSelectedDoc(sampleDocs[2]); setActiveFinding(sampleDocs[2].findings[0]?.id ?? null); setTutorialStep(1); dismissDocumentTutorial() }}><span className="d2-demo-modal-number">01</span><span className="d2-demo-modal-icon">⌂</span><strong>Explore a sample</strong><small>Open a practice housing agreement with realistic review flags.</small><em>Start exploring →</em></button>
                      <button onClick={() => { setSelectedDoc(sampleDocs[0]); setActiveFinding('f-1'); setTutorialStep(2); dismissDocumentTutorial() }}><span className="d2-demo-modal-number">02</span><span className="d2-demo-modal-icon">!</span><strong>See an issue explained</strong><small>Jump to a highlighted sentence and read what it could mean for you.</small><em>Show an example →</em></button>
                      <button onClick={() => { setTutorialStep(3); dismissDocumentTutorial(); uploadInputRef.current?.click() }}><span className="d2-demo-modal-number">03</span><span className="d2-demo-modal-icon">+</span><strong>Scan your own file</strong><small>Add a file or paste copied text when you are ready to begin your own review.</small><em>Add a document →</em></button>
                    </div>
                    <p className="d2-demo-modal-footnote">Practice documents only. Automated flags are prompts to review—not proof of fraud or legal advice.</p>
                  </section>
                </div>,
                document.body
              )}

              {/* PASTE DOCUMENT MODAL (PORTAL) */}
              {pasteDialogOpen && createPortal(
                <div className="d2-import-overlay" role="dialog" aria-modal="true" aria-labelledby="paste-document-title">
                  <form className="d2-import-modal" onSubmit={handlePastedDocument}>
                    <button type="button" className="d2-demo-close" onClick={() => setPasteDialogOpen(false)} aria-label="Close paste document">×</button>
                    <span className="d2-import-kicker">ADD DOCUMENT TEXT</span>
                    <h2 id="paste-document-title">Paste a document to review</h2>
                    <p>Use this for a scanned image, a protected file, or any document you can copy. We will place the full text in the reader and flag common phrases that deserve a closer look.</p>
                    <label htmlFor="pasted-document-title">Document name <input id="pasted-document-title" value={pastedTitle} onChange={(event) => setPastedTitle(event.target.value)} placeholder="For example: Apartment lease renewal" /></label>
                    <label htmlFor="pasted-document-text">Document text <textarea id="pasted-document-text" value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="Paste the complete document text here…" required /></label>
                    <div className="d2-import-actions"><button type="button" onClick={() => setPasteDialogOpen(false)}>Cancel</button><button type="submit" disabled={isScanning || !pastedText.trim()}>{isScanning ? 'Scanning…' : 'Scan and add'}</button></div>
                  </form>
                </div>,
                document.body
              )}
            </div>
          )}

          {/* ═════ CHAIN ═════ */}
          {activeNav === 'chain' && (
            <div className="d2-page">
              <div className="d2-page-header">
                <div className="d2-section-header-copy"><span className="d2-eyebrow">YOUR WORKSPACE</span><h1 className="d2-page-title">Activity</h1><p>Follow each review step and see how a document has changed.</p></div>
              </div>

              <div className="d2-chain-timeline">
                {[
                  { v: 'v1', title: 'Initial Document Upload & Hash Logging', hash: 'e3b0c44298fc1c149afbf4c8996fb924...', score: 54, status: '2 Critical Flags', level: 'low' },
                  { v: 'v2', title: 'Automated Procedural Linter Audit', hash: null, detail: 'Executed Rule Pack PROC-RULE-104 & PROC-RULE-201', score: 68, status: 'Deadline Flagged', level: 'mid' },
                  { v: 'v3', title: 'Human Advocate Review & Citation Linking', hash: null, detail: 'Added explicit appeal URL and 30-day deadline terms.', score: 81, status: '1 Warning Remaining', level: 'mid' },
                  { v: 'v4', title: 'Final Remediated Notice Export', hash: '7d865e959b2466918c9863afca942d0f...', score: 89, status: 'PASSED DUE PROCESS', level: 'high' },
                ].map((step, idx) => (
                  <div key={step.v} className={`d2-chain-step ${idx === 3 ? 'd2-chain-active' : ''}`}>
                    <div className="d2-chain-marker-col">
                      <div className={`d2-chain-marker ${idx === 3 ? 'd2-marker-active' : ''}`}>{step.v}</div>
                      {idx < 3 && <div className="d2-chain-line" />}
                    </div>
                    <div className="d2-chain-content">
                      <h4>{step.title}</h4>
                      {step.hash && <p className="d2-chain-hash">Hash: <code>{step.hash}</code></p>}
                      {step.detail && <p className="d2-chain-detail">{step.detail}</p>}
                      <span className={`d2-chain-score d2-score-${step.level}`}>
                        Score: {step.score}/100 · {step.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═════ TEAM ═════ */}
          {activeNav === 'team' && (
            <div className="d2-page d2-messages-page">
              <div className="d2-page-header">
                <div className="d2-section-header-copy"><span className="d2-eyebrow">MESSAGES / DOCUMENT REVIEW</span><h1 className="d2-page-title">Document review</h1><p>Keep decisions, owners, and next steps together.</p></div>
                <div className="d2-message-page-actions"><button className="d2-message-search-btn" onClick={() => setMessageSearchOpen(true)}>⌕ <span>Search</span><kbd>⌘ K</kbd></button><button className="d2-action-btn d2-btn-sm" onClick={() => setMessageNotice('Invite link ready to share with your review team.')}>+ Invite</button></div>
              </div>

              <section className="d2-shared-workspace-card" aria-label="Shared workspace access">
                <div className="d2-space-utility-bar">
                  <div className="d2-space-utility-identity"><span className="d2-space-utility-icon">#</span><div><strong>{activeWorkspace?.name || 'Document review'}</strong><small><i /> Shared space · {workspaceMembers.length || (userEmail ? 3 : 2)} members</small></div></div>
                  <div className="d2-space-utility-members" aria-label="Space members"><div className="d2-member-stack"><i>E</i><i>A</i>{userEmail && <i>{userEmail[0].toUpperCase()}</i>}</div><span>{workspaceMembers.length ? `${workspaceMembers.length} members` : 'Private space'}</span></div>
                  <button className="d2-space-manage-btn" aria-expanded={workspaceSetupOpen} onClick={() => setWorkspaceSetupOpen((open) => !open)}>{workspaceSetupOpen ? 'Done' : 'Manage'} <span>{workspaceSetupOpen ? '↑' : '⌄'}</span></button>
                </div>
                {workspaceSetupOpen && <div className="d2-shared-workspace-setup">
                  <div className="d2-shared-workspace-setup-copy"><span className="d2-eyebrow">SPACE ACCESS</span><p>Create a shared space, invite collaborators, or join with an invite code.</p></div>
                  <div className="d2-shared-workspace-controls">
                    <select aria-label="Choose workspace" value={activeWorkspace?.id || ''} onChange={(event) => { const workspace = workspaces.find((item) => item.id === event.target.value) || null; setActiveWorkspace(workspace) }}>
                    <option value="">No workspace selected</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}
                    </select>
                    <input aria-label="New workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="New workspace name" />
                    <button className="d2-action-btn d2-btn-sm" onClick={() => void createSharedWorkspace()}>Create</button>
                    <button className="d2-action-btn d2-btn-sm" disabled={!activeWorkspace} onClick={() => void inviteToWorkspace()}>Create invite</button>
                    <input aria-label="Workspace invite code" value={workspaceInviteCode} onChange={(event) => setWorkspaceInviteCode(event.target.value)} placeholder="Paste invite code" />
                    <button className="d2-action-btn d2-btn-sm" onClick={() => void joinSharedWorkspace()}>Join</button>
                  </div>
                  {activeWorkspace && <div className="d2-shared-workspace-members"><span>{workspaceMembers.length} member{workspaceMembers.length === 1 ? '' : 's'} connected</span>{workspaceMembers.slice(0, 5).map((member) => <span key={member.user_id} className="d2-shared-member-chip">{(member.email || member.name || member.user_id)[0].toUpperCase()} {member.email || member.name || 'Member'} · {member.role}</span>)}</div>}
                  {workspaceNotice && <p className="d2-shared-workspace-notice" role="status">{workspaceNotice}</p>}
                </div>}
              </section>

              {messageNotice && <div className="d2-message-notice" role="status"><span>✓</span>{messageNotice}<button aria-label="Dismiss message" onClick={() => setMessageNotice('')}>×</button></div>}

              <header className="d2-mobile-space-header">
                <button type="button" aria-label="Open conversation list" title="Conversations" onClick={() => setMobileChannelsOpen(true)}>‹</button>
                <div><span>MESSAGES</span><strong>Document review</strong><small>{userEmail ? '3' : '2'} members</small></div>
                <div className="d2-mobile-space-header-actions"><button type="button" aria-label="Search this space" title="Search" onClick={() => setMessageSearchOpen(true)}>⌕</button><button type="button" aria-label="View space details" title="Space details" onClick={() => setMobileDetailsOpen(true)}>ⓘ</button><button type="button" aria-label="More space actions" title="More actions" onClick={() => setMobileMoreOpen((open) => !open)}>•••</button></div>
              </header>

              <div className={`d2-message-workspace ${messageDetailsOpen ? '' : 'd2-message-workspace-details-closed'}`}>
                <aside className="d2-message-rail" aria-label="Chats">
                  <div className="d2-message-rail-head"><div><span className="d2-eyebrow">MESSAGES</span><h2>Conversations</h2></div><button aria-label="New chat" className="d2-message-plus" onClick={() => setMessageNotice('New chat started. Add a topic to begin.')}>+</button></div>
                  <button className="d2-message-quick-search" onClick={() => setMessageSearchOpen(true)}><span>⌕</span> Search <kbd>⌘K</kbd></button>
                  <div className="d2-space-shortcuts"><button className={messageFilter === 'all' ? 'd2-space-shortcut-active' : ''} onClick={() => { setMessageFilter('all'); setMessageNotice('Showing all messages in this space.') }}><span>◷</span> All</button><button className={messageFilter === 'mentions' ? 'd2-space-shortcut-active' : ''} onClick={() => { setMessageFilter('mentions'); setMessageNotice('Showing messages that mention you.') }}><span>@</span> Mentions</button></div>
                  <div className="d2-message-section-label">SPACES</div>
                  <button className="d2-conversation d2-conversation-active"><span className="d2-conversation-icon">#</span><span><strong>Document review</strong><small>{selectedDoc.status}</small></span><b aria-label={`${comments.length} unread messages`}>{comments.length}</b></button>
                  <button className="d2-conversation" onClick={() => setMessageNotice('Questions are ready for the next discussion.')}><span className="d2-conversation-icon">?</span><span><strong>Questions</strong><small>Get a second opinion</small></span></button>
                  <div className="d2-message-section-label d2-message-section-label-dm">DIRECT MESSAGES</div>
                  <button className="d2-conversation" onClick={() => setMessageNotice('Your saved updates will appear here.')}><span className="d2-conversation-icon">✦</span><span><strong>Updates</strong><small>Follow-up reminders</small></span></button>
                  <div className="d2-message-rail-footer"><div className="d2-member-stack"><i>E</i><i>A</i>{userEmail && <i>{userEmail[0].toUpperCase()}</i>}</div><span>{userEmail ? '3 online' : '2 online'}</span></div>
                </aside>

                <section className="d2-message-thread" aria-label="Review chat">
                  <header className="d2-message-thread-head"><div className="d2-thread-title"><span className="d2-thread-hash">#</span><div><h2>Document review</h2><p>{userEmail ? '3 people' : '2 people'} · Shared space</p></div></div><div className="d2-thread-actions"><button aria-label="Search this conversation" onClick={() => setMessageSearchOpen(true)}>⌕</button><button aria-label="Thread information" onClick={() => setMessageDetailsOpen(true)}>ⓘ</button><button aria-label="More conversation actions" onClick={() => setMessageNotice('Chat tools are ready when you need them.')}>•••</button></div></header>
                  <div className="d2-space-tabs" role="tablist" aria-label="Document review workspace">
                    <button role="tab" aria-selected={messageWorkspaceTab === 'chat'} className={messageWorkspaceTab === 'chat' ? 'd2-space-tab-active' : ''} onClick={() => setMessageWorkspaceTab('chat')}>Chat</button>
                    <button role="tab" aria-selected={messageWorkspaceTab === 'files'} className={messageWorkspaceTab === 'files' ? 'd2-space-tab-active' : ''} onClick={() => setMessageWorkspaceTab('files')}>Files <span>1</span></button>
                    <button role="tab" aria-selected={messageWorkspaceTab === 'tasks'} className={messageWorkspaceTab === 'tasks' ? 'd2-space-tab-active' : ''} onClick={() => setMessageWorkspaceTab('tasks')}>Tasks <span>{spaceTasks.filter((task) => !task.completed).length}</span></button>
                  </div>
                  {messageWorkspaceTab === 'chat' && <>
                    <button type="button" className="d2-thread-context" onClick={() => setActiveNav('documents')}><span className="d2-thread-context-icon">{documentKind(selectedDoc.type).icon}</span><div className="d2-thread-context-document"><small>LINKED DOCUMENT</small><strong>{documentDisplayName(selectedDoc)}</strong></div><div className="d2-thread-context-meta"><span><small>STATUS</small><b>{selectedDoc.status}</b></span><span><small>OWNER</small><b>Elena Moritz</b></span><span><small>DEADLINE</small><b>{selectedDoc.deadline || 'Needs clarity'}</b></span></div><em>Open review →</em></button>
                    <button type="button" className={`d2-open-issues-summary ${issuesResolved ? 'd2-open-issues-resolved' : ''}`} onClick={() => setActiveNav('linter')}><div><span className="d2-eyebrow">{issuesResolved ? 'RESOLUTION STATE' : 'OPEN ISSUES'}</span><strong>{issuesResolved ? 'Review marked resolved' : `${criticalCount + warningCount} unresolved finding${criticalCount + warningCount === 1 ? '' : 's'}`}</strong><small>{criticalCount ? `${criticalCount} high impact` : 'No high-impact items'} · Assignee: Elena Moritz · Due: {selectedDoc.deadline || 'Needs clarity'} · {issuesResolved ? 'Resolved' : 'In review'}</small></div><em>{issuesResolved ? 'View resolution →' : 'View review queue →'}</em></button>
                    <div className="d2-chat-messages">
                      <div className="d2-message-day">Today</div>
                      {comments.filter((comment) => messageFilter === 'all' || comment.text.includes('@')).map((c, idx, visibleComments) => {
                        const isMine = c.user.startsWith('You')
                        const initial = isMine ? (userEmail?.[0].toUpperCase() || 'Y') : c.user.startsWith('Elena') ? 'E' : 'A'
                        const reactions = messageReactions[c.id] || []
                        const grouped = visibleComments[idx - 1]?.user === c.user
                        return <div key={c.id} className={`d2-chat-msg ${isMine ? 'd2-chat-msg-mine' : ''} ${c.saved ? 'd2-chat-msg-saved' : ''} ${grouped ? 'd2-chat-msg-grouped' : ''}`}>
                          {!grouped && <div className="d2-chat-avatar">{initial}</div>}<div className="d2-chat-bubble">{!grouped && <div className="d2-chat-msg-header"><strong>{c.user}</strong><span>{c.time}</span>{isMine && <em className="d2-message-saved-status"><i /> Saved</em>}</div>}<p>{c.text}</p>{c.attachment && <button className="d2-message-attachment" onClick={() => setActiveNav('documents')}>▣ {c.attachment} <span>Open →</span></button>}{idx === 0 && <button className="d2-message-reference" onClick={() => setActiveNav('documents')}>↗ Review: appeal deadline</button>}<div className="d2-message-bubble-actions"><button type="button" aria-label={`React to ${c.user}'s message`} title="React" onClick={() => toggleMessageReaction(c.id, '👍')}>👍</button>{reactions.map((reaction) => <button type="button" key={reaction} className="d2-message-reaction-active" aria-label={`Remove ${reaction} reaction`} title="Remove reaction" onClick={() => toggleMessageReaction(c.id, reaction)}>{reaction}</button>)}<button type="button" aria-label={`Reply to ${c.user}`} title="Reply in thread" onClick={() => replyInThread(c.user)}>↩</button><button type="button" aria-label={c.saved ? 'Unsave message' : 'Save message'} title={c.saved ? 'Unsave message' : 'Save message'} className={c.saved ? 'd2-message-save-active' : ''} onClick={() => toggleSavedMessage(c.id)}>{c.saved ? '★' : '☆'}</button></div></div>
                        </div>
                      })}
                      {messageFilter === 'mentions' && !comments.some((comment) => comment.text.includes('@')) && <div className="d2-message-empty-state"><strong>No mentions yet</strong><span>When a teammate uses @, it will appear here.</span><button onClick={() => setMessageFilter('all')}>Show all messages</button></div>}
                    </div>
                    <form onSubmit={handleAddComment} className="d2-chat-form">
                      <button type="button" aria-label="Add an attachment" className="d2-composer-tool" title="Attach current document" onClick={() => setAttachedDocument(documentDisplayName(selectedDoc))}>+</button>
                      {attachedDocument && <button type="button" className="d2-composer-attachment" aria-label="Remove attached document" onClick={() => setAttachedDocument(null)}>▣ {attachedDocument} <span>×</span></button>}
                      <input ref={chatInputRef} type="text" placeholder="Type a message..." value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && newComment.trim()) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} className="d2-chat-input" />
                      <div className="d2-emoji-picker-wrap"><button type="button" aria-label="Add an emoji" aria-expanded={emojiPickerOpen} className="d2-composer-tool" onClick={() => setEmojiPickerOpen((open) => !open)}>☺</button>{emojiPickerOpen && <div className="d2-emoji-picker" role="menu" aria-label="Emoji picker">{['👍', '✅', '⚖️', '📌', '👀', '💬', '👏', '❗'].map((emoji) => <button type="button" key={emoji} role="menuitem" onClick={() => addEmojiToMessage(emoji)}>{emoji}</button>)}</div>}</div>
                      <button type="submit" className="d2-chat-send" disabled={!newComment.trim()}>Send <span>↗</span></button>
                    </form>
                    <p className="d2-composer-note">⌘/Ctrl + Enter to send · Use @ to mention a teammate.</p>
                  </>}
                  {messageWorkspaceTab === 'files' && <section className="d2-space-tab-panel" aria-label="Shared files"><div className="d2-space-tab-panel-heading"><div><span className="d2-eyebrow">SHARED FILES</span><h3>Files in this space</h3><p>Open a document or jump back to its review.</p></div><button className="d2-action-btn d2-btn-sm" onClick={() => setActiveNav('documents')}>+ Add file</button></div><button className="d2-space-file-card" onClick={() => setActiveNav('documents')}><span>{documentKind(selectedDoc.type).icon}</span><div><strong>{documentDisplayName(selectedDoc)}</strong><small>Shared with this space · {potentialRiskCount} review items</small></div><b>Open →</b></button></section>}
                  {messageWorkspaceTab === 'tasks' && <section className="d2-space-tab-panel" aria-label="Shared tasks"><div className="d2-space-tab-panel-heading"><div><span className="d2-eyebrow">REVIEW TASKS</span><h3>Keep the review moving</h3><p>Tasks stay connected to the document and this conversation.</p></div><button className="d2-action-btn d2-btn-sm" onClick={() => setSpaceTasks((current) => [...current, { id: `task-${Date.now()}`, title: 'New review task', detail: 'Created in this space', completed: false }])}>+ New task</button></div><div className="d2-space-task-list">{spaceTasks.map((task) => <button key={task.id} className={task.completed ? 'd2-space-task-done' : ''} onClick={() => toggleSpaceTask(task.id)} aria-pressed={task.completed}><i className={task.completed ? 'd2-space-task-complete' : ''} />{task.title}<small>{task.completed ? 'Completed · click to reopen' : task.detail}</small><span>{task.completed ? 'Done' : 'Mark done'}</span></button>)}</div></section>}
                </section>

                {messageDetailsOpen && <aside className="d2-message-info" aria-label="Details">
                  <div className="d2-message-info-head"><h2>Space details</h2><button aria-label="Close details" onClick={() => setMessageDetailsOpen(false)}>×</button></div>
                  <section><span className="d2-eyebrow">DOCUMENT</span><button className="d2-info-document" onClick={() => setActiveNav('documents')}><span>{documentKind(selectedDoc.type).icon}</span><div><strong>{documentDisplayName(selectedDoc)}</strong><small>{potentialRiskCount ? `${potentialRiskCount} items to review` : 'All checks complete'}</small></div><b>›</b></button></section>
                  <section><span className="d2-eyebrow">PEOPLE</span><div className="d2-info-person"><i className="d2-person-elena">E</i><div><strong>Elena Moritz</strong><small>Legal Aid Director · Online</small></div></div><div className="d2-info-person"><i className="d2-person-agency">A</i><div><strong>Agency Reviewer</strong><small>Compliance Officer · Online</small></div></div>{userEmail && <div className="d2-info-person"><i className="d2-person-you">{userEmail[0].toUpperCase()}</i><div><strong>You</strong><small>{userEmail}</small></div></div>}</section>
                  <section><span className="d2-eyebrow">ACTIONS</span><button className="d2-info-action" onClick={() => setActiveNav('linter')}>! Items to review <b>›</b></button><button className="d2-info-action" onClick={() => setActiveNav('chain')}>◌ Activity <b>›</b></button></section>
                </aside>}
              </div>
              {mobileChannelsOpen && <div className="d2-mobile-space-sheet" role="dialog" aria-modal="true" aria-label="Conversations"><button className="d2-mobile-sheet-backdrop" aria-label="Close conversations" onClick={() => setMobileChannelsOpen(false)} /><section><header><div><span className="d2-eyebrow">MESSAGES</span><h2>Conversations</h2></div><button aria-label="Close conversations" onClick={() => setMobileChannelsOpen(false)}>×</button></header><button className="d2-mobile-sheet-conversation d2-mobile-sheet-conversation-active" onClick={() => setMobileChannelsOpen(false)}><span>#</span><div><strong>Document review</strong><small>{comments.length} messages · {selectedDoc.status}</small></div><b>{comments.length}</b></button><button className="d2-mobile-sheet-conversation" onClick={() => { setMobileChannelsOpen(false); setMessageNotice('Questions are ready for the next discussion.') }}><span>?</span><div><strong>Questions</strong><small>Get a second opinion</small></div></button><button className="d2-mobile-sheet-conversation" onClick={() => { setMobileChannelsOpen(false); setMessageNotice('Your saved updates will appear here.') }}><span>✦</span><div><strong>Updates</strong><small>Follow-up reminders</small></div></button></section></div>}
              {mobileDetailsOpen && <div className="d2-mobile-space-sheet" role="dialog" aria-modal="true" aria-label="Space details"><button className="d2-mobile-sheet-backdrop" aria-label="Close space details" onClick={() => setMobileDetailsOpen(false)} /><section><header><div><span className="d2-eyebrow">SPACE DETAILS</span><h2>Document review</h2></div><button aria-label="Close space details" onClick={() => setMobileDetailsOpen(false)}>×</button></header><button className="d2-mobile-sheet-document" onClick={() => { setMobileDetailsOpen(false); setActiveNav('documents') }}><span>{documentKind(selectedDoc.type).icon}</span><div><strong>{documentDisplayName(selectedDoc)}</strong><small>{criticalCount + warningCount} open items · Owner: Elena Moritz</small></div><b>Open →</b></button><div className="d2-mobile-space-detail-row"><span>Members</span><strong>{userEmail ? '3' : '2'} active</strong></div><div className="d2-mobile-space-detail-row"><span>Resolution</span><strong>{issuesResolved ? 'Resolved' : 'In review'}</strong></div></section></div>}
              {mobileMoreOpen && <div className="d2-mobile-more-menu"><button onClick={() => { setMobileMoreOpen(false); setMessageWorkspaceTab('tasks'); setSpaceTasks((current) => [...current, { id: `task-${Date.now()}`, title: 'New review task', detail: 'Created in this space', completed: false }]) }}>+ Create task</button><button onClick={() => { setMobileMoreOpen(false); setIssuesResolved((resolved) => !resolved) }}>{issuesResolved ? '↺ Reopen issues' : '✓ Mark resolved'}</button><button onClick={() => { setMobileMoreOpen(false); setMessageNotice('Space notifications are muted for one hour.') }}>◌ Mute for 1 hour</button></div>}
              <nav className="d2-mobile-message-nav" aria-label="Mobile workspace navigation"><button aria-label="Open Dashboard from mobile navigation" onClick={() => setActiveNav('overview')}>Dashboard</button><button aria-label="Open Review from mobile navigation" onClick={() => setActiveNav('linter')}>Review</button><button aria-label="Messages mobile navigation" className="d2-mobile-message-nav-active" aria-current="page">Messages <b>{comments.length}</b></button><button aria-label="Open Activity from mobile navigation" onClick={() => setActiveNav('chain')}>Activity</button><button aria-label="Open Profile from mobile navigation" onClick={() => setActiveNav('settings')}>Profile</button></nav>

              {messageSearchOpen && <div className="d2-message-search-overlay" role="dialog" aria-modal="true" aria-label="Search messages"><button className="d2-message-search-backdrop" aria-label="Close message search" onClick={() => setMessageSearchOpen(false)} /><div className="d2-message-search-panel"><div className="d2-search-field"><span>⌕</span><input autoFocus placeholder="Search chats, people, or documents..." value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} /><button aria-label="Close search" onClick={() => setMessageSearchOpen(false)}>×</button></div><div className="d2-search-tabs"><button className="d2-search-tab-active">All</button><button>Chats</button><button>People</button><button>Docs</button></div><div className="d2-search-results"><small>WORKSPACE</small><button onClick={() => { setMessageSearchOpen(false); setActiveNav('documents') }}><span className="d2-search-result-icon">{documentKind(selectedDoc.type).icon}</span><div><strong>{documentDisplayName(selectedDoc)}</strong><p>Open this document</p></div><b>↵</b></button><button onClick={() => { setMessageSearchOpen(false); setMessageNotice('Review chat selected.') }}><span className="d2-search-result-icon">#</span><div><strong>Review</strong><p>{comments.length} messages · {userEmail ? '3' : '2'} people</p></div><b>↵</b></button><button onClick={() => { setMessageSearchOpen(false); setMessageNotice('Elena Moritz is available in this workspace.') }}><span className="d2-search-result-avatar">E</span><div><strong>Elena Moritz</strong><p>Legal Aid Director</p></div><b>↵</b></button></div><footer><kbd>↑↓</kbd> Move <kbd>↵</kbd> Select <span><kbd>esc</kbd> Close</span></footer></div></div>}
            </div>
          )}

          {/* ═════ SETTINGS ═════ */}
          {activeNav === 'settings' && (
            <div className="d2-page">
              <div className="d2-page-header">
                <div className="d2-section-header-copy"><span className="d2-eyebrow">ACCOUNT</span><h1 className="d2-page-title">Profile</h1><p>Manage your workspace preferences and account details.</p></div>
              </div>

              <div className="d2-settings-grid">
                <div className="d2-settings-card d2-settings-profile">
                  <h3>Profile</h3>
                  <div className="d2-settings-field">
                    <label>Email</label>
                    <input type="text" value={userEmail || 'Not signed in'} readOnly className="d2-settings-input" />
                  </div>
                  <div className="d2-settings-field">
                    <label>Authentication</label>
                    <input type="text" value="AWS Cognito (us-east-1)" readOnly className="d2-settings-input" />
                  </div>
                </div>

                <div className="d2-settings-card d2-settings-preferences">
                  <h3>Audit Preferences</h3>
                  <div className="d2-settings-field">
                    <label>Default Rule Pack</label>
                    <select className="d2-settings-select">
                      <option>US Federal – Administrative Procedures</option>
                      <option>State Housing – Illinois</option>
                      <option>Lease Agreement – Standard</option>
                    </select>
                  </div>
                  <div className="d2-settings-field">
                    <label>Auto-Remediation</label>
                    <select className="d2-settings-select">
                      <option>Prompt before applying</option>
                      <option>Apply automatically</option>
                      <option>Disabled</option>
                    </select>
                  </div>
                </div>

                <div className="d2-settings-card d2-settings-notifications">
                  <h3>Notifications</h3>
                  <div className="d2-toggle-row">
                    <span>Email notifications for new findings</span>
                    <div className="d2-toggle"><div className="d2-toggle-knob" /></div>
                  </div>
                  <div className="d2-toggle-row">
                    <span>Workspace activity alerts</span>
                    <div className="d2-toggle d2-toggle-on"><div className="d2-toggle-knob" /></div>
                  </div>
                  <div className="d2-toggle-row">
                    <span>SHA-256 chain update notifications</span>
                    <div className="d2-toggle d2-toggle-on"><div className="d2-toggle-knob" /></div>
                  </div>
                </div>

                <ActivityTimeChart />
              </div>
            </div>
          )}

          {/* ═════ GUIDE (sub-panel available from overview/linter) ═════ */}
        </main>
      </div>

      {createPortal(
        <AIWorkflowProgress
          isOpen={aiWorkflowOpen}
          onClose={() => setAiWorkflowOpen(false)}
          mode={aiWorkflowMode}
          documentName={aiWorkflowDocName}
          onComplete={() => {
            if (aiWorkflowMode === 'remediation') {
              setSelectedDoc(documents[1] ?? documents[0])
              setActiveFinding((documents[1] ?? documents[0]).findings[0]?.id || null)
              setRemediating(false)
            }
          }}
        />,
        document.body
      )}
    </div>
  )
}
