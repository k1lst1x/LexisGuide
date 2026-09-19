import React, { useState, useEffect, useRef } from 'react'

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
  { key: 'overview', label: 'Overview' },
  { key: 'linter', label: 'Audit Linter' },
  { key: 'documents', label: 'Documents' },
  { key: 'chain', label: 'Review Chain' },
  { key: 'team', label: 'Team' },
  { key: 'settings', label: 'Settings' },
]

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
    <div className="d2-gauge-container">
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

/* ───────── Main Dashboard V2 ───────── */
export function DashboardV2({ onClose, userEmail }: { onClose: () => void; userEmail?: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeNav, setActiveNav] = useState<NavItem>('overview')
  const [selectedDoc, setSelectedDoc] = useState<SampleDoc>(sampleDocs[0])
  const [activeFinding, setActiveFinding] = useState<string | null>(sampleDocs[0].findings[0]?.id || null)
  const [comments, setComments] = useState<Array<{ user: string; text: string; time: string }>>([
    { user: 'Elena Moritz (Legal Aid)', text: 'The appeal deadline is completely missing in v1. We should add a 30-day requirement.', time: '10:14 AM' },
    { user: 'Agency Reviewer', text: 'Agreed. Updating notice to include deadline date of Oct 14, 2026.', time: '10:28 AM' },
  ])
  const [newComment, setNewComment] = useState('')
  const [remediating, setRemediating] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleRemediate = () => {
    setRemediating(true)
    setTimeout(() => {
      setSelectedDoc(sampleDocs[1])
      setActiveFinding(sampleDocs[1].findings[0]?.id || null)
      setRemediating(false)
    }, 1200)
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

  const breadcrumbMap: Record<NavItem, string> = {
    overview: 'Overview',
    linter: 'Audit Linter',
    documents: 'Documents',
    chain: 'Review Chain',
    team: 'Team',
    settings: 'Settings',
  }

  return (
    <div className="d2-root">
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
                onClick={() => setActiveNav(item.key)}
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
          <div className="d2-breadcrumb">
            <span className="d2-bc-icon">{icons.home}</span>
            <span className="d2-bc-sep">{icons.chevronRight}</span>
            <span className="d2-bc-current">{breadcrumbMap[activeNav]}</span>
          </div>

          <div className="d2-topbar-right">
            <div className="d2-search-box">
              {icons.search}
              <span className="d2-search-text">Search...</span>
              <kbd className="d2-search-kbd">⌘K</kbd>
            </div>
            <button className="d2-icon-btn d2-notif-btn" aria-label="Notifications">
              {icons.bell}
              <span className="d2-notif-dot" />
            </button>
            <div className="d2-user-menu-anchor" ref={userMenuRef}>
              <button className="d2-avatar-btn" onClick={() => setUserMenuOpen(!userMenuOpen)}>
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
                  <button className="d2-dropdown-item" onClick={onClose}>
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
            <div className="d2-page d2-overview-page">
              <div className="d2-page-header">
                <h1 className="d2-page-title">Dashboard Overview</h1>
                <select
                  className="d2-doc-select"
                  value={selectedDoc.id}
                  onChange={(e) => {
                    const found = sampleDocs.find(d => d.id === e.target.value)
                    if (found) {
                      setSelectedDoc(found)
                      setActiveFinding(found.findings[0]?.id || null)
                    }
                  }}
                >
                  {sampleDocs.map(d => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>

              {/* KPI Row */}
              <div className="d2-kpi-row">
                <div className="d2-kpi-card d2-kpi-score">
                  <ScoreGauge score={selectedDoc.score} />
                  <div className="d2-kpi-info">
                    <span className="d2-kpi-label">Fairness Score</span>
                    <span className={`d2-kpi-status ${selectedDoc.score < 65 ? 'd2-status-red' : selectedDoc.score < 80 ? 'd2-status-amber' : 'd2-status-green'}`}>
                      {selectedDoc.status}
                    </span>
                  </div>
                </div>

                <div className="d2-kpi-card">
                  <div className="d2-kpi-number d2-red">{criticalCount}</div>
                  <span className="d2-kpi-label">Critical Issues</span>
                  <div className="d2-kpi-bar"><div className="d2-kpi-bar-fill d2-bar-red" style={{ width: `${(criticalCount / Math.max(selectedDoc.findings.length, 1)) * 100}%` }} /></div>
                </div>

                <div className="d2-kpi-card">
                  <div className="d2-kpi-number d2-amber">{warningCount}</div>
                  <span className="d2-kpi-label">Warnings</span>
                  <div className="d2-kpi-bar"><div className="d2-kpi-bar-fill d2-bar-amber" style={{ width: `${(warningCount / Math.max(selectedDoc.findings.length, 1)) * 100}%` }} /></div>
                </div>

                <div className="d2-kpi-card">
                  <div className="d2-kpi-number d2-green">{passCount}</div>
                  <span className="d2-kpi-label">Passed Checks</span>
                  <div className="d2-kpi-bar"><div className="d2-kpi-bar-fill d2-bar-green" style={{ width: `${(passCount / Math.max(selectedDoc.findings.length, 1)) * 100}%` }} /></div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="d2-quick-row">
                <div className="d2-info-card">
                  <span className="d2-info-tag">{selectedDoc.type}</span>
                  <h3 className="d2-info-title">{selectedDoc.title}</h3>
                  <p className="d2-info-meta">{selectedDoc.agency} · Issued {selectedDoc.date}</p>
                  <p className="d2-info-meta" style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '8px', color: '#9ca3af' }}>
                    SHA-256: {selectedDoc.hash.slice(0, 32)}...
                  </p>
                  <div className="d2-info-version">{selectedDoc.version}</div>
                </div>

                <div className="d2-actions-card">
                  <h3 className="d2-actions-title">Quick Actions</h3>
                  {selectedDoc.score < 75 && (
                    <button className="d2-action-btn d2-action-primary" onClick={handleRemediate} disabled={remediating}>
                      {remediating ? '⚙ Running AI Remediation...' : '⚡ Run Auto-Remediation (v1 → v4)'}
                    </button>
                  )}
                  <button className="d2-action-btn" onClick={() => setActiveNav('linter')}>
                    View Audit Findings ({selectedDoc.findings.length})
                  </button>
                  <button className="d2-action-btn" onClick={() => setActiveNav('chain')}>
                    View Review Chain
                  </button>
                  <button className="d2-action-btn" onClick={() => setActiveNav('documents')}>
                    Open Document Viewer
                  </button>
                </div>
              </div>

              {/* Recent Findings Summary */}
              <div className="d2-section-card">
                <h3 className="d2-section-title">Recent Findings</h3>
                <div className="d2-findings-mini">
                  {selectedDoc.findings.slice(0, 3).map(f => (
                    <div key={f.id} className="d2-finding-mini" onClick={() => { setActiveFinding(f.id); setActiveNav('linter'); }}>
                      <span className={`d2-sev-dot d2-sev-${f.severity}`} />
                      <span className="d2-finding-mini-title">{f.title}</span>
                      <span className="d2-finding-mini-cat">{f.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═════ LINTER ═════ */}
          {activeNav === 'linter' && (
            <div className="d2-page">
              <div className="d2-page-header">
                <h1 className="d2-page-title">Procedural Fairness Linter</h1>
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
            <div className="d2-page">
              <div className="d2-page-header">
                <h1 className="d2-page-title">Document Evidence Viewer</h1>
                <div className="d2-info-version">{selectedDoc.version}</div>
              </div>

              <div className="d2-doc-viewer">
                <div className="d2-doc-meta-bar">
                  <span className="d2-doc-type-tag">{selectedDoc.type}</span>
                  <span className="d2-doc-agency">{selectedDoc.agency} · {selectedDoc.date}</span>
                </div>

                <div className="d2-paper">
                  <div className="d2-paper-watermark">CONFIDENTIAL · LEGAL DISCLOSURE</div>
                  <pre className="d2-paper-text">
                    {selectedDoc.text.split('\n').map((line, idx) => {
                      const isHighlighted = selectedFindingObj && line.includes(selectedFindingObj.evidence.slice(0, 20))
                      return (
                        <span key={idx} className={`d2-text-line ${isHighlighted ? 'd2-line-hl' : ''}`}>
                          {line}
                          {'\n'}
                        </span>
                      )
                    })}
                  </pre>
                </div>

                <div className="d2-hash-bar">
                  <span className="d2-hash-label">SHA-256 PROVENANCE:</span>
                  <code className="d2-hash-value">{selectedDoc.hash}</code>
                </div>
              </div>
            </div>
          )}

          {/* ═════ CHAIN ═════ */}
          {activeNav === 'chain' && (
            <div className="d2-page">
              <div className="d2-page-header">
                <h1 className="d2-page-title">Verifiable Review Chain</h1>
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
            <div className="d2-page">
              <div className="d2-page-header">
                <h1 className="d2-page-title">Team Workspace</h1>
                <button className="d2-action-btn d2-btn-sm" onClick={() => alert('Secure invite link copied!')}>+ Invite Member</button>
              </div>

              <div className="d2-team-layout">
                <div className="d2-team-members-card">
                  <h3>Workspace Members</h3>
                  <div className="d2-member-list">
                    <div className="d2-member">
                      <div className="d2-member-avatar" style={{ background: 'linear-gradient(135deg, #ff6b00, #ea580c)' }}>E</div>
                      <div><strong>Elena Moritz</strong><p>Legal Aid Director</p></div>
                      <span className="d2-online-dot" />
                    </div>
                    <div className="d2-member">
                      <div className="d2-member-avatar" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>A</div>
                      <div><strong>Agency Reviewer</strong><p>Compliance Officer</p></div>
                      <span className="d2-online-dot" />
                    </div>
                    {userEmail && (
                      <div className="d2-member">
                        <div className="d2-member-avatar" style={{ background: 'linear-gradient(135deg, #f97316, #ff8c00)' }}>{userEmail[0].toUpperCase()}</div>
                        <div><strong>You</strong><p>{userEmail}</p></div>
                        <span className="d2-online-dot" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="d2-chat-card">
                  <h3>Discussion</h3>
                  <div className="d2-chat-messages">
                    {comments.map((c, idx) => (
                      <div key={idx} className="d2-chat-msg">
                        <div className="d2-chat-msg-header">
                          <strong>{c.user}</strong>
                          <span>{c.time}</span>
                        </div>
                        <p>{c.text}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleAddComment} className="d2-chat-form">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="d2-chat-input"
                    />
                    <button type="submit" className="d2-chat-send">Send</button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* ═════ SETTINGS ═════ */}
          {activeNav === 'settings' && (
            <div className="d2-page">
              <div className="d2-page-header">
                <h1 className="d2-page-title">Settings</h1>
              </div>

              <div className="d2-settings-grid">
                <div className="d2-settings-card">
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

                <div className="d2-settings-card">
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

                <div className="d2-settings-card">
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
              </div>
            </div>
          )}

          {/* ═════ GUIDE (sub-panel available from overview/linter) ═════ */}
        </main>
      </div>
    </div>
  )
}
