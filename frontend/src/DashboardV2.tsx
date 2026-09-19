import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { AIWorkflowProgress } from './components/AIWorkflowProgress'

/* ───────── Types ───────── */
type SampleDoc = {
  id: string
  title: string
  type: string
  version: string
  score: number
  status: string
  agency: string
  date: string
  hash: string
  text: string
  findings: Array<{
    id: string
    title: string
    severity: 'critical' | 'warning' | 'pass'
    category: string
    explanation: string
    evidence: string
    rule: string
  }>
}

type NavItem = 'overview' | 'linter' | 'documents' | 'chain' | 'team' | 'settings'

const LAST_SECTION_KEY = 'lexisguide:last-section'

/* ───────── Sample Data ───────── */
const sampleDocs: SampleDoc[] = [
  {
    id: 'doc-1',
    title: 'Notice of Supplemental Benefits Denial (Ref #8942-B)',
    type: 'Administrative Denial',
    version: 'v1.0 (Audit Flagged)',
    score: 54,
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

/* ───────── Animated Score Gauge ───────── */
function ScoreGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animated / 100) * circumference
  const color = score < 65 ? '#ef4444' : score < 80 ? '#f59e0b' : '#22c55e'

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 100)
    return () => clearTimeout(timer)
  }, [score])

  return (
    <div className={`d2-gauge-container d2-gauge-live ${score < 65 ? 'd2-gauge-risk' : score < 80 ? 'd2-gauge-review' : 'd2-gauge-clear'}`}>
      <span className="d2-gauge-orbit" aria-hidden="true" />
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="65" cy="65" r={radius}
          fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="d2-gauge-label">
        <span className="d2-gauge-num" style={{ color }}>{Math.round(animated)}</span>
        <span className="d2-gauge-max">/100</span>
      </div>
    </div>
  )
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

function DocumentPicker({ documents, selectedDocument, onSelect }: { documents: SampleDoc[]; selectedDocument: SampleDoc; onSelect: (document: SampleDoc) => void }) {
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
    <button className={`d2-document-picker-trigger ${isOpen ? 'd2-document-picker-open' : ''}`} onClick={() => setIsOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={isOpen} title={selectedDocument.title}>
      <span className="d2-document-picker-icon" aria-hidden="true">{kind.icon}</span>
      <span className="d2-document-picker-copy"><small>Viewing</small><strong>{documentDisplayName(selectedDocument)}</strong></span>
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
  const [collapsed, setCollapsed] = useState(true)
  const [activeNav, setActiveNavState] = useState<NavItem>(() => {
    const savedSection = window.localStorage.getItem(LAST_SECTION_KEY)
    return navItems.some((item) => item.key === savedSection) ? savedSection as NavItem : 'overview'
  })
  const [sectionTitleExpanded, setSectionTitleExpanded] = useState(true)
  const [documents, setDocuments] = useState<SampleDoc[]>(sampleDocs)
  const [selectedDoc, setSelectedDoc] = useState<SampleDoc>(sampleDocs[0])
  const [activeFinding, setActiveFinding] = useState<string | null>(sampleDocs[0].findings[0]?.id || null)
  const [isScanning, setIsScanning] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false)
  const [pastedTitle, setPastedTitle] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [tutorialStep, setTutorialStep] = useState(0)
  const [tutorialStripOpen, setTutorialStripOpen] = useState(true)
  const [tutorialOpen, setTutorialOpen] = useState(true)
  const [comments, setComments] = useState<Array<{ user: string; text: string; time: string }>>([
    { user: 'Elena Moritz (Legal Aid)', text: 'The appeal deadline is completely missing in v1. We should add a 30-day requirement.', time: '10:14 AM' },
    { user: 'Agency Reviewer', text: 'Agreed. Updating notice to include deadline date of Oct 14, 2026.', time: '10:28 AM' },
  ])
  const [newComment, setNewComment] = useState('')
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const [messageNotice, setMessageNotice] = useState('')
  const [remediating, setRemediating] = useState(false)
  const [aiWorkflowOpen, setAiWorkflowOpen] = useState(false)
  const [aiWorkflowMode, setAiWorkflowMode] = useState<'document-audit' | 'remediation' | 'project-plan'>('document-audit')
  const [aiWorkflowDocName, setAiWorkflowDocName] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const sectionTitleTimerRef = useRef<number | undefined>(undefined)

  const triggerAiWorkflow = (docTitle: string = selectedDoc.title, mode: 'document-audit' | 'remediation' | 'project-plan' = 'document-audit') => {
    setAiWorkflowMode(mode)
    setAiWorkflowDocName(docTitle)
    setAiWorkflowOpen(true)
  }

  const setActiveNav = (section: NavItem) => {
    setActiveNavState(section)
    setSectionTitleExpanded(true)
    if (sectionTitleTimerRef.current) window.clearTimeout(sectionTitleTimerRef.current)
    sectionTitleTimerRef.current = window.setTimeout(() => setSectionTitleExpanded(false), 1200)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setMessageSearchOpen(true)
      }
      if (event.key === 'Escape') setMessageSearchOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(LAST_SECTION_KEY, activeNav)
  }, [activeNav])

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

  const addScannedDocument = async ({ id, title, type, text, hash }: { id: string; title: string; type: string; text: string; hash: string }) => {
    setUploadMessage(`Scanning ${title}…`)
    try {
      await fetch('/api/v1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_text: text.slice(0, 100000) }),
      })
    } catch {
      // The local quick scan remains available when the API is offline.
    }
    const findings = scanUploadedText(text)
    const uploaded: SampleDoc = {
      ...sampleDocs[0],
      id,
      title,
      type,
      version: 'Quick scan complete',
      score: findings.some((finding) => finding.severity === 'warning') ? 62 : 86,
      status: findings.some((finding) => finding.severity === 'warning') ? 'Review recommended' : 'No common risks found',
      date: new Date().toLocaleDateString(),
      hash,
      text,
      findings,
    }
    setDocuments((current) => [uploaded, ...current])
    setSelectedDoc(uploaded)
    setActiveFinding(uploaded.findings[0]?.id || null)
    setUploadMessage(`${title} is ready. Select a highlighted passage to see why it needs attention.`)
    setTutorialStep(3)
    setTutorialOpen(false)
    setActiveNav('documents')
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
    setComments([...comments, { user: 'You (Reviewer)', text: newComment.trim(), time: 'Just now' }])
    setNewComment('')
  }

  const selectedFindingObj = selectedDoc.findings.find(f => f.id === activeFinding)
  const criticalCount = selectedDoc.findings.filter(f => f.severity === 'critical').length
  const warningCount = selectedDoc.findings.filter(f => f.severity === 'warning').length
  const passCount = selectedDoc.findings.filter(f => f.severity === 'pass').length
  const findingTotal = Math.max(selectedDoc.findings.length, 1)
  const potentialRiskCount = criticalCount + warningCount
  const potentialRiskPercent = Math.round((potentialRiskCount / findingTotal) * 100)
  const checkedPercent = Math.round((passCount / findingTotal) * 100)
  const criticalPercent = (criticalCount / findingTotal) * 100
  const warningPercent = (warningCount / findingTotal) * 100
  const isDemoMode = !documents.some((document) => document.id.startsWith('upload-'))
  const workspaceAverage = Math.round(documents.reduce((total, document) => total + document.score, 0) / Math.max(documents.length, 1))
  const highestScore = Math.max(...documents.map((document) => document.score))

  const breadcrumbMap: Record<NavItem, string> = {
    overview: 'Dashboard',
    linter: 'Review',
    documents: 'Documents',
    chain: 'Activity',
    team: 'Messages',
    settings: 'Profile',
  }

  return (
    <div className={`d2-root ${sectionTitleExpanded ? 'd2-section-title-expanded' : 'd2-section-title-compact'}`}>
      {/* ───── Sidebar ───── */}
      <aside className={`d2-sidebar ${collapsed ? 'd2-sidebar-collapsed' : ''}`}>
        <div className="d2-sidebar-top">
          <div className="d2-sidebar-brand">
            {!collapsed && <span className="d2-sidebar-logo">LexisGuide</span>}
            <button className="d2-collapse-btn" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">
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
                  if (item.key === 'documents' && isDemoMode) setTutorialOpen(true)
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
          <div className="d2-workspace-title">
            <span className="d2-workspace-mark">L</span>
            <div>
              <strong>LexisGuide</strong>
              <span>Document workspace</span>
            </div>
          </div>

          <div className="d2-topbar-location">
            <span className="d2-topbar-location-dot" />
            <span>{breadcrumbMap[activeNav]}</span>
          </div>

          <div className="d2-topbar-right">
            <button className="d2-icon-btn d2-clean-icon-btn" aria-label="Search">{icons.search}</button>
            <button className="d2-icon-btn d2-notif-btn" aria-label="Notifications">
              {icons.bell}
              <span className="d2-notif-dot" />
            </button>
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
                    <div className="d2-health-score"><ScoreGauge score={selectedDoc.score} /><div><strong>{selectedDoc.status}</strong><p><span className="d2-ai-sparkle" aria-hidden="true">✦</span> AI review score</p></div></div>
                    <div className="d2-health-stats">
                      <div><span>Critical</span><strong className="d2-red">{criticalCount}</strong><small>needs attention</small></div>
                      <div><span>Warnings</span><strong className="d2-amber">{warningCount}</strong><small>review suggested</small></div>
                      <div><span>Checked</span><strong className="d2-green">{passCount}</strong><small>clear items</small></div>
                    </div>
                  </div>
                  <div className="d2-health-progress"><span>Review coverage</span><div><i style={{ width: `${Math.max(selectedDoc.score, 12)}%` }} /></div><strong>{selectedDoc.score}%</strong></div>
                  <div className="d2-ai-telemetry"><span><i />AI analysis active</span><code>evidence map · {findingTotal} checks · confidence 0.94</code><span>updated now</span></div>
                </section>

                <section className="d2-overview-panel d2-rating-chart-panel">
                  <div className="d2-panel-heading"><div><span className="d2-eyebrow"><span className="d2-ai-sparkle" aria-hidden="true">✦</span> DOCUMENT RATINGS</span><h2>Document score signal</h2></div><span className="d2-rating-average">Avg. {workspaceAverage}</span></div>
                  <div key={selectedDoc.id} className="d2-rating-bars" role="img" aria-label="Ratings by document">
                    {documents.slice(0, 5).map((document) => <button key={document.id} className={`d2-rating-bar ${selectedDoc.id === document.id ? 'd2-rating-bar-active' : ''}`} onClick={() => { setSelectedDoc(document); setActiveFinding(document.findings[0]?.id ?? null) }} aria-label={`${document.title}: ${document.score} out of 100`}>
                      <span className="d2-rating-bar-value">{document.score}</span><span className="d2-rating-bar-track"><i style={{ height: `${document.score}%` }} /></span><span className="d2-rating-bar-label">{document.title.replace('Notice of ', '').split(' ').slice(0, 2).join(' ')}</span>
                    </button>)}
                  </div>
                  <div className="d2-rating-chart-footer"><span>100-point scale · latest document revision</span><strong>Best: {highestScore}/100</strong></div>
                </section>
              </div>

              <div className="d2-overview-bottom-grid">
                <section className="d2-overview-panel d2-findings-panel">
                  <div className="d2-panel-heading"><div><span className="d2-eyebrow"><span className="d2-ai-sparkle" aria-hidden="true">✦</span> ITEMS TO REVIEW</span><h2>Finding activity</h2></div><button className="d2-panel-link" onClick={() => setActiveNav('linter')}>View all →</button></div>
                  <div className="d2-findings-table">
                    <div className="d2-findings-table-head"><span>Finding</span><span>Category</span><span>Status</span></div>
                    {selectedDoc.findings.slice(0, 4).map((finding) => <button key={finding.id} className="d2-finding-table-row" onClick={() => { setActiveFinding(finding.id); setActiveNav('linter') }}><span><i className={`d2-sev-dot d2-sev-${finding.severity}`} />{finding.title}</span><span>{finding.category}</span><span className={`d2-table-status d2-table-status-${finding.severity}`}>{finding.severity === 'pass' ? 'Checked' : finding.severity === 'critical' ? 'Priority' : 'Review'}</span></button>)}
                  </div>
                  <div className="d2-panel-log" aria-label="Analysis activity"><span>ANALYSIS_LOG</span><code>matched {selectedDoc.findings.length} signal{selectedDoc.findings.length === 1 ? '' : 's'} · routing review context</code><i>LIVE</i></div>
                </section>

                <section key={`rating-factors-${selectedDoc.id}`} className="d2-overview-panel d2-rating-factors-panel">
                  <div className="d2-panel-heading"><div><span className="d2-eyebrow"><span className="d2-ai-sparkle" aria-hidden="true">✦</span> RATING FACTORS</span><h2>What affected this score</h2></div><strong className="d2-rating-large">{selectedDoc.score}</strong></div>
                  <p className="d2-rating-factors-copy">The score reflects the findings in <b>{selectedDoc.title}</b>.</p>
                  <div className="d2-rating-factor-list">
                    <div><span><i className="d2-legend-critical" />High-priority concerns <b>{criticalCount}</b></span><em><i className="d2-factor-critical" style={{ width: `${criticalPercent}%` }} /></em></div>
                    <div><span><i className="d2-legend-warning" />Items to review <b>{warningCount}</b></span><em><i className="d2-factor-warning" style={{ width: `${warningPercent}%` }} /></em></div>
                    <div><span><i className="d2-legend-pass" />Checks completed <b>{passCount}</b></span><em><i className="d2-factor-pass" style={{ width: `${checkedPercent}%` }} /></em></div>
                  </div>
                  <div className="d2-factor-log"><code>rules evaluated: {findingTotal.toString().padStart(2, '0')} · evidence coverage: {selectedDoc.score}%</code><span>MODEL v1.0</span></div>
                  <button className="d2-balance-action" onClick={() => setActiveNav('documents')}>Read the highlighted passages</button>
                </section>
              </div>
            </div>
          )}

          {/* ═════ LINTER ═════ */}
          {activeNav === 'linter' && (
            <div className="d2-page">
              <div className="d2-page-header">
                <div className="d2-section-header-copy"><span className="d2-eyebrow">DOCUMENTS</span><h1 className="d2-page-title">Review</h1><p>See every item that needs your attention and why it matters.</p></div>
                <div className="d2-header-meta">
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
              <div className="d2-documents-hero">
                <div>
                  <span className="d2-eyebrow">DOCUMENT REVIEW</span>
                  <h1>Documents</h1>
                  <p>Understand a document before you agree. Add a PDF, Word, webpage, or text file—or paste its contents—then select a highlighted passage to see what it could mean for you.</p>
                </div>
                <div className="d2-document-hero-actions">
                  {isDemoMode && <button className="d2-demo-open-btn" onClick={() => setTutorialOpen(true)}>How does this work?</button>}
                  <button className="d2-paste-btn" onClick={() => triggerAiWorkflow(selectedDoc.title, 'document-audit')} title="Watch AI fairness & due process workflow execution">⚡ AI Workflow</button>
                  <button className="d2-paste-btn" onClick={() => setPasteDialogOpen(true)} disabled={isScanning}>Paste text</button>
                  <button className="d2-upload-btn d2-upload-btn-large" onClick={() => uploadInputRef.current?.click()} disabled={isScanning}>
                    <span>+</span>{isScanning ? 'Scanning document…' : 'Add document'}
                  </button>
                </div>
              </div>

              {uploadMessage && <div className="d2-upload-status" role="status">{uploadMessage}</div>}

              {isDemoMode && tutorialStripOpen && <section className="d2-demo-tutorial" aria-label="Document review tutorial">
                <button className="d2-demo-strip-close" onClick={() => setTutorialStripOpen(false)} aria-label="Close tutorial tips" title="Close tutorial tips">×</button>
                <div className="d2-demo-intro"><span className="d2-demo-badge">DEMO MODE</span><div><h2>Try it with a sample document</h2><p>Learn how LexisGuide works before adding a personal file. Nothing in these samples belongs to you.</p></div></div>
                <div className="d2-demo-steps">
                  <button className={`d2-demo-step ${tutorialStep === 1 ? 'd2-demo-step-active' : ''}`} onClick={() => { setSelectedDoc(sampleDocs[2]); setActiveFinding(sampleDocs[2].findings[0]?.id ?? null); setTutorialStep(1) }}><span>1</span><div><strong>Choose a sample</strong><small>Open a housing, benefit, or agreement example.</small></div></button>
                  <button className={`d2-demo-step ${tutorialStep === 2 ? 'd2-demo-step-active' : ''}`} onClick={() => { setSelectedDoc(sampleDocs[0]); setActiveFinding('f-1'); setTutorialStep(2) }}><span>2</span><div><strong>Select a highlight</strong><small>See a plain-language explanation and next step.</small></div></button>
                  <button className={`d2-demo-step ${tutorialStep === 3 ? 'd2-demo-step-active' : ''}`} onClick={() => { setTutorialStep(3); uploadInputRef.current?.click() }}><span>3</span><div><strong>Add your document</strong><small>Upload a file or paste its text for the same quick scan.</small></div></button>
                </div>
              </section>}

              <section key={selectedDoc.id} className="d2-document-insights" aria-label="Document scan summary">
                <div className="d2-insight-risk">
                  <div>
                    <span className="d2-eyebrow">SCAN SUMMARY</span>
                    <h2>Potential risk</h2>
                    <p>{potentialRiskCount ? `${potentialRiskCount} item${potentialRiskCount === 1 ? '' : 's'} should be reviewed before you agree.` : 'No common risk patterns were found in this scan.'}</p>
                  </div>
                  <div className="d2-risk-ring" role="img" aria-label={`${potentialRiskPercent}% of scan checks need review`}>
                    <svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="d2-risk-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fb7185"/><stop offset="100%" stopColor="#dc2626"/></linearGradient></defs><circle className="d2-ring-track" cx="50" cy="50" r="40"/><circle className="d2-ring-risk" cx="50" cy="50" r="40" pathLength="100" stroke="url(#d2-risk-gradient)" strokeDasharray={`${potentialRiskPercent} ${100 - potentialRiskPercent}`} /></svg>
                    <div className="d2-risk-ring-center"><strong>{potentialRiskPercent}%</strong><span>to review</span></div>
                  </div>
                </div>

                <div className="d2-insight-mix">
                  <div className="d2-insight-heading"><div><span className="d2-eyebrow">FINDING MIX</span><h2>Good and bad signals</h2></div><span>{findingTotal} checks</span></div>
                  <div className="d2-mix-bar" role="img" aria-label={`${criticalCount} high priority, ${warningCount} review, and ${passCount} checked findings`}>
                    {criticalCount > 0 && <span className="d2-mix-critical" style={{ width: `${criticalPercent}%` }}><b>{criticalPercent}%</b></span>}
                    {warningCount > 0 && <span className="d2-mix-warning" style={{ width: `${warningPercent}%` }}><b>{warningPercent}%</b></span>}
                    {passCount > 0 && <span className="d2-mix-pass" style={{ width: `${checkedPercent}%` }}><b>{checkedPercent}%</b></span>}
                  </div>
                  <div className="d2-mix-legend"><span><i className="d2-legend-critical" /><em>High priority</em><b>{criticalCount}</b></span><span><i className="d2-legend-warning" /><em>Review</em><b>{warningCount}</b></span><span><i className="d2-legend-pass" /><em>Checked</em><b>{passCount}</b></span></div>
                </div>

                <div className="d2-insight-categories">
                  <span className="d2-eyebrow">WHAT TO LOOK AT</span>
                  <div>{selectedDoc.findings.filter((finding) => finding.severity !== 'pass').slice(0, 3).map((finding) => <button key={finding.id} onClick={() => { setActiveFinding(finding.id); setActiveNav('documents') }}><i className={`d2-sev-dot d2-sev-${finding.severity}`} /><span>{finding.category}</span><b>›</b></button>)}{potentialRiskCount === 0 && <p>All completed checks are shown as clear.</p>}</div>
                </div>
              </section>

              <div className="d2-document-workspace">
                <aside className="d2-document-library" aria-label="Your documents">
                  <div className="d2-library-heading"><div><span className="d2-eyebrow">{isDemoMode ? 'PRACTICE FILES' : 'YOUR FILES'}</span><h2>{isDemoMode ? 'Sample documents' : 'Your documents'}</h2></div><span>{documents.length}</span></div>
                  <div className="d2-library-list">
                    {documents.map((document) => {
                      const kind = documentKind(document.type)
                      const issueCount = document.findings.filter((finding) => finding.severity !== 'pass').length
                      return <button key={document.id} className={`d2-library-item ${selectedDoc.id === document.id ? 'd2-library-item-active' : ''}`} onClick={() => { setSelectedDoc(document); setActiveFinding(document.findings.find((finding) => finding.severity !== 'pass')?.id ?? document.findings[0]?.id ?? null) }}>
                        <span className="d2-library-icon" aria-hidden="true">{kind.icon}</span>
                        <span className="d2-library-copy"><strong>{document.title}</strong><small>{kind.label} · {document.date}</small></span>
                        <span className={`d2-library-count ${issueCount ? 'd2-library-count-risk' : ''}`}>{issueCount ? `${issueCount} issue${issueCount === 1 ? '' : 's'}` : 'Checked'}</span>
                      </button>
                    })}
                  </div>
                  <div className="d2-library-actions"><button className="d2-library-add" onClick={() => uploadInputRef.current?.click()} disabled={isScanning}>+ Add another document</button><button className="d2-library-paste" onClick={() => setPasteDialogOpen(true)} disabled={isScanning}>Paste document text</button></div>
                  <p className="d2-library-note">{isDemoMode ? 'These examples are here to help you practice. Add a PDF, Word, text file, or pasted content when you are ready.' : 'PDF, Word, webpage, rich-text, and readable text files can be opened here. Your document stays in this browser for the quick scan.'}</p>
                </aside>

                <section className="d2-document-reader-section">
                  <div className="d2-reader-toolbar">
                    <div><span className="d2-doc-type-tag">{documentKind(selectedDoc.type).label}</span><h2>{selectedDoc.title}</h2><p>{selectedDoc.agency} · {selectedDoc.date}</p></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        className="d2-paste-btn"
                        style={{ padding: '6px 11px', fontSize: '11.5px', background: '#1e293b', color: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)', cursor: 'pointer' }}
                        onClick={() => triggerAiWorkflow(selectedDoc.title, 'document-audit')}
                        title="View real animated AI workflow execution"
                      >
                        ⚡ AI Workflow
                      </button>
                      <div className="d2-scan-summary"><strong>{selectedDoc.findings.filter((finding) => finding.severity !== 'pass').length}</strong><span>items to review</span></div>
                    </div>
                  </div>
                  <div className="d2-reader-hint"><span className="d2-highlight-key" /> Highlighted text may need a closer look. Select it to see why.</div>
                  <div className="d2-paper d2-paper-scrollable">
                    <div className="d2-paper-watermark">DOCUMENT COPY</div>
                    <DocumentText document={selectedDoc} onSelectFinding={(id) => setActiveFinding(id)} />
                  </div>
                  <div className="d2-hash-bar"><span className="d2-hash-label">DOCUMENT ID:</span><code className="d2-hash-value">{selectedDoc.hash}</code></div>
                </section>

                <aside className="d2-document-explanation d2-document-explanation-prominent">
                  {selectedFindingObj ? <>
                    <span className={`d2-sev-badge d2-sev-badge-${selectedFindingObj.severity}`}>{selectedFindingObj.severity === 'critical' ? 'HIGH PRIORITY' : selectedFindingObj.severity === 'warning' ? 'REVIEW THIS' : 'CHECKED'}</span>
                    <h2>{selectedFindingObj.title}</h2>
                    <p className="d2-explanation-intro">This is a potential issue, not a finding of fraud.</p>
                    <div className="d2-explanation-section"><span>Highlighted passage</span><blockquote>“{selectedFindingObj.evidence}”</blockquote></div>
                    <div className="d2-explanation-section"><span>Why it matters to you</span><p>{selectedFindingObj.explanation}</p></div>
                    <div className="d2-next-step"><span>Recommended next step</span><p>{selectedFindingObj.rule}</p></div>
                  </> : <><h2>Select a highlight</h2><p>Choose a highlighted word or sentence in the document to see a clear explanation here.</p></>}
                </aside>
              </div>

              {isDemoMode && tutorialOpen && createPortal(<div className="d2-demo-overlay" role="dialog" aria-modal="true" aria-labelledby="demo-tour-title">
                <section className="d2-demo-modal">
                  <button className="d2-demo-close" onClick={() => setTutorialOpen(false)} aria-label="Close tutorial">×</button>
                  <div className="d2-demo-modal-intro"><span>LEXISGUIDE DEMO</span><h2 id="demo-tour-title">Learn the document check in under a minute.</h2><p>Start with a safe example, see how flagged language is explained, then use the same tool for your own document.</p></div>
                  <div className="d2-demo-modal-steps">
                    <button onClick={() => { setSelectedDoc(sampleDocs[2]); setActiveFinding(sampleDocs[2].findings[0]?.id ?? null); setTutorialStep(1); setTutorialOpen(false) }}><span className="d2-demo-modal-number">01</span><span className="d2-demo-modal-icon">⌂</span><strong>Explore a sample</strong><small>Open a practice housing agreement with realistic review flags.</small><em>Start exploring →</em></button>
                    <button onClick={() => { setSelectedDoc(sampleDocs[0]); setActiveFinding('f-1'); setTutorialStep(2); setTutorialOpen(false) }}><span className="d2-demo-modal-number">02</span><span className="d2-demo-modal-icon">!</span><strong>See an issue explained</strong><small>Jump to a highlighted sentence and read what it could mean for you.</small><em>Show an example →</em></button>
                    <button onClick={() => { setTutorialStep(3); setTutorialOpen(false); uploadInputRef.current?.click() }}><span className="d2-demo-modal-number">03</span><span className="d2-demo-modal-icon">+</span><strong>Scan your own file</strong><small>Add a file or paste copied text when you are ready to begin your own review.</small><em>Add a document →</em></button>
                  </div>
                  <p className="d2-demo-modal-footnote">Practice documents only. Automated flags are prompts to review—not proof of fraud or legal advice.</p>
                </section>
              </div>, document.body)}
              {pasteDialogOpen && createPortal(<div className="d2-import-overlay" role="dialog" aria-modal="true" aria-labelledby="paste-document-title">
                <form className="d2-import-modal" onSubmit={handlePastedDocument}>
                  <button type="button" className="d2-demo-close" onClick={() => setPasteDialogOpen(false)} aria-label="Close paste document">×</button>
                  <span className="d2-import-kicker">ADD DOCUMENT TEXT</span>
                  <h2 id="paste-document-title">Paste a document to review</h2>
                  <p>Use this for a scanned image, a protected file, or any document you can copy. We will place the full text in the reader and flag common phrases that deserve a closer look.</p>
                  <label htmlFor="pasted-document-title">Document name <input id="pasted-document-title" value={pastedTitle} onChange={(event) => setPastedTitle(event.target.value)} placeholder="For example: Apartment lease renewal" /></label>
                  <label htmlFor="pasted-document-text">Document text <textarea id="pasted-document-text" value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="Paste the complete document text here…" required /></label>
                  <div className="d2-import-actions"><button type="button" onClick={() => setPasteDialogOpen(false)}>Cancel</button><button type="submit" disabled={isScanning || !pastedText.trim()}>{isScanning ? 'Scanning…' : 'Scan and add'}</button></div>
                </form>
              </div>, document.body)}
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
                <div className="d2-section-header-copy"><span className="d2-eyebrow">TEAM</span><h1 className="d2-page-title">Messages</h1><p>Keep document decisions, people, and next steps in one place.</p></div>
                <div className="d2-message-page-actions"><button className="d2-message-search-btn" onClick={() => setMessageSearchOpen(true)}>⌕ <span>Search</span><kbd>⌘ K</kbd></button><button className="d2-action-btn d2-btn-sm" onClick={() => setMessageNotice('Invite link ready to share with your review team.')}>+ Invite</button></div>
              </div>

              {messageNotice && <div className="d2-message-notice" role="status"><span>✓</span>{messageNotice}<button aria-label="Dismiss message" onClick={() => setMessageNotice('')}>×</button></div>}

              <div className="d2-message-workspace">
                <aside className="d2-message-rail" aria-label="Chats">
                  <div className="d2-message-rail-head"><div><span className="d2-eyebrow">INBOX</span><h2>Chats</h2></div><button aria-label="New chat" className="d2-message-plus" onClick={() => setMessageNotice('New chat started. Add a topic to begin.')}>+</button></div>
                  <button className="d2-message-quick-search" onClick={() => setMessageSearchOpen(true)}><span>⌕</span> Search <kbd>⌘K</kbd></button>
                  <div className="d2-message-section-label">WORKSPACE</div>
                  <button className="d2-conversation d2-conversation-active"><span className="d2-conversation-icon">#</span><span><strong>Review</strong><small>{selectedDoc.status}</small></span><b>{comments.length}</b></button>
                  <button className="d2-conversation" onClick={() => setMessageNotice('Questions are ready for the next discussion.')}><span className="d2-conversation-icon">?</span><span><strong>Questions</strong><small>Get a second opinion</small></span></button>
                  <button className="d2-conversation" onClick={() => setMessageNotice('Your saved updates will appear here.')}><span className="d2-conversation-icon">✦</span><span><strong>Updates</strong><small>Follow-up reminders</small></span></button>
                  <div className="d2-message-rail-footer"><div className="d2-member-stack"><i>E</i><i>A</i>{userEmail && <i>{userEmail[0].toUpperCase()}</i>}</div><span>{userEmail ? '3 online' : '2 online'}</span></div>
                </aside>

                <section className="d2-message-thread" aria-label="Review chat">
                  <header className="d2-message-thread-head"><div className="d2-thread-title"><span className="d2-thread-hash">#</span><div><h2>Review</h2><p>{userEmail ? '3 people' : '2 people'} · Document support</p></div></div><div className="d2-thread-actions"><button aria-label="Search this conversation" onClick={() => setMessageSearchOpen(true)}>⌕</button><button aria-label="Thread information" onClick={() => setMessageNotice('Details are open on the right.')}>ⓘ</button><button aria-label="More conversation actions" onClick={() => setMessageNotice('Chat tools are ready when you need them.')}>•••</button></div></header>
                  <div className="d2-thread-context"><span className="d2-thread-context-icon">{documentKind(selectedDoc.type).icon}</span><div><small>IN REVIEW</small><strong>{documentDisplayName(selectedDoc)}</strong></div><button onClick={() => setActiveNav('documents')}>Open →</button></div>
                  <div className="d2-chat-messages">
                    <div className="d2-message-day">Today</div>
                    {comments.map((c, idx) => {
                      const isMine = c.user.startsWith('You')
                      const initial = isMine ? (userEmail?.[0].toUpperCase() || 'Y') : c.user.startsWith('Elena') ? 'E' : 'A'
                      return <div key={`${c.time}-${idx}`} className={`d2-chat-msg ${isMine ? 'd2-chat-msg-mine' : ''}`}>
                        <div className="d2-chat-avatar">{initial}</div><div className="d2-chat-bubble"><div className="d2-chat-msg-header"><strong>{c.user}</strong><span>{c.time}</span></div><p>{c.text}</p>{idx === 0 && <button className="d2-message-reference" onClick={() => setActiveNav('documents')}>↗ Review: appeal deadline</button>}</div>
                      </div>
                    })}
                  </div>
                  <form onSubmit={handleAddComment} className="d2-chat-form">
                    <button type="button" aria-label="Add an attachment" className="d2-composer-tool" onClick={() => setMessageNotice('Attachments can be added from the Documents workspace.')}>+</button>
                    <input type="text" placeholder="Type a message..." value={newComment} onChange={(e) => setNewComment(e.target.value)} className="d2-chat-input" />
                    <button type="button" aria-label="Add an emoji" className="d2-composer-tool" onClick={() => setNewComment(`${newComment} ✓`)}>☺</button>
                    <button type="submit" className="d2-chat-send">Send <span>↗</span></button>
                  </form>
                  <p className="d2-composer-note">Enter to send · Linked to this review.</p>
                </section>

                <aside className="d2-message-info" aria-label="Details">
                  <div className="d2-message-info-head"><h2>Details</h2><button aria-label="Close details" onClick={() => setMessageNotice('Details remain available from Messages.')}>×</button></div>
                  <section><span className="d2-eyebrow">DOCUMENT</span><button className="d2-info-document" onClick={() => setActiveNav('documents')}><span>{documentKind(selectedDoc.type).icon}</span><div><strong>{documentDisplayName(selectedDoc)}</strong><small>{potentialRiskCount ? `${potentialRiskCount} items to review` : 'All checks complete'}</small></div><b>›</b></button></section>
                  <section><span className="d2-eyebrow">PEOPLE</span><div className="d2-info-person"><i className="d2-person-elena">E</i><div><strong>Elena Moritz</strong><small>Legal Aid Director · Online</small></div></div><div className="d2-info-person"><i className="d2-person-agency">A</i><div><strong>Agency Reviewer</strong><small>Compliance Officer · Online</small></div></div>{userEmail && <div className="d2-info-person"><i className="d2-person-you">{userEmail[0].toUpperCase()}</i><div><strong>You</strong><small>{userEmail}</small></div></div>}</section>
                  <section><span className="d2-eyebrow">ACTIONS</span><button className="d2-info-action" onClick={() => setActiveNav('linter')}>! Items to review <b>›</b></button><button className="d2-info-action" onClick={() => setActiveNav('chain')}>◌ Activity <b>›</b></button></section>
                </aside>
              </div>

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
