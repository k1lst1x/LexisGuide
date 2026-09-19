import { useState } from 'react'

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

export function Dashboard({ onClose }: { onClose: () => void }) {
  const [selectedDoc, setSelectedDoc] = useState<SampleDoc>(sampleDocs[0])
  const [activeFinding, setActiveFinding] = useState<string | null>(sampleDocs[0].findings[0]?.id || null)
  const [activeTab, setActiveTab] = useState<'linter' | 'guide' | 'chain' | 'workspace'>('linter')
  const [comments, setComments] = useState<Array<{ user: string; text: string; time: string }>>([
    { user: 'Elena Moritz (Legal Aid)', text: 'The appeal deadline is completely missing in v1. We should add a 30-day requirement.', time: '10:14 AM' },
    { user: 'Agency Reviewer', text: 'Agreed. Updating notice to include deadline date of Oct 14, 2026.', time: '10:28 AM' }
  ])
  const [newComment, setNewComment] = useState('')
  const [remediating, setRemediating] = useState(false)

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
    setComments([
      ...comments,
      { user: 'You (Reviewer)', text: newComment.trim(), time: 'Just now' }
    ])
    setNewComment('')
  }

  const selectedFindingObj = selectedDoc.findings.find(f => f.id === activeFinding)

  return (
    <div className="dash-overlay">
      <div className="dash-shell">
        
        {/* Top Dashboard Header */}
        <header className="dash-header">
          <div className="dash-brand">
            <span className="dash-logo">LexisGuide</span>
            <span className="dash-badge">PROCEDURAL FAIRNESS DASHBOARD</span>
          </div>
          
          <div className="dash-doc-selector">
            <label className="selector-label">SELECT AUDIT WORKFLOW:</label>
            <select 
              value={selectedDoc.id} 
              onChange={(e) => {
                const found = sampleDocs.find(d => d.id === e.target.value)
                if (found) {
                  setSelectedDoc(found)
                  setActiveFinding(found.findings[0]?.id || null)
                }
              }}
              className="dash-select"
            >
              {sampleDocs.map(d => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.score}/100 - {d.version})
                </option>
              ))}
            </select>
          </div>
          
          <button onClick={onClose} className="dash-close-btn" aria-label="Close dashboard">
            Exit Dashboard ✕
          </button>
        </header>
        
        {/* Main Dashboard Grid */}
        <div className="dash-body-grid">
          
          {/* Left Column: Document Evidence Viewer */}
          <section className="dash-col dash-left">
            <div className="col-card-header">
              <div className="meta-block">
                <span className="doc-type-badge">{selectedDoc.type}</span>
                <h2 className="doc-title">{selectedDoc.title}</h2>
                <p className="doc-agency">{selectedDoc.agency} · Issued {selectedDoc.date}</p>
              </div>
              <div className="version-pill">{selectedDoc.version}</div>
            </div>
            
            <div className="document-paper">
              <div className="paper-watermark">CONFIDENTIAL · LEGAL DISCLOSURE</div>
              <pre className="document-text-content">
                {selectedDoc.text.split('\n').map((line, idx) => {
                  const isHighlighted = selectedFindingObj && line.includes(selectedFindingObj.evidence.slice(0, 20))
                  return (
                    <span 
                      key={idx} 
                      className={`text-line ${isHighlighted ? 'line-highlighted' : ''}`}
                    >
                      {line}
                      {'\n'}
                    </span>
                  )
                })}
              </pre>
            </div>
            
            <div className="paper-footer-bar">
              <span className="hash-label">SHA-256 PROVENANCE HASH:</span>
              <code className="hash-code">{selectedDoc.hash}</code>
            </div>
          </section>
          
          {/* Right Column: Interactive Linter & Audit Workspace */}
          <section className="dash-col dash-right">
            
            {/* Score & Audit Overview Card */}
            <div className="score-hero-card">
              <div className="score-circle-block">
                <div className={`score-ring score-${selectedDoc.score < 65 ? 'low' : selectedDoc.score < 80 ? 'mid' : 'high'}`}>
                  <span className="score-num">{selectedDoc.score}</span>
                  <span className="score-max">/100</span>
                </div>
                <div className="score-meta">
                  <span className="score-status">{selectedDoc.status}</span>
                  <p className="score-subtext">Procedural Fairness & Due Process Audit</p>
                </div>
              </div>
              
              {selectedDoc.score < 75 && (
                <button 
                  onClick={handleRemediate} 
                  disabled={remediating}
                  className="remediate-btn"
                >
                  {remediating ? 'Running AI Remediation...' : 'Run Auto-Remediation (v1 → v4) ⚡'}
                </button>
              )}
            </div>
            
            {/* Dashboard Workspace Navigation Tabs */}
            <nav className="dash-nav-tabs">
              <button 
                className={`tab-btn ${activeTab === 'linter' ? 'active' : ''}`}
                onClick={() => setActiveTab('linter')}
              >
                Fairness Linter ({selectedDoc.findings.length})
              </button>
              <button 
                className={`tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
                onClick={() => setActiveTab('guide')}
              >
                Next-Step Guide
              </button>
              <button 
                className={`tab-btn ${activeTab === 'chain' ? 'active' : ''}`}
                onClick={() => setActiveTab('chain')}
              >
                Review Chain (SHA-256)
              </button>
              <button 
                className={`tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
                onClick={() => setActiveTab('workspace')}
              >
                Shared Workspace
              </button>
            </nav>
            
            {/* TAB 1: PROCEDURAL FAIRNESS LINTER */}
            {activeTab === 'linter' && (
              <div className="tab-panel">
                <div className="findings-list">
                  {selectedDoc.findings.map(finding => (
                    <div 
                      key={finding.id}
                      onClick={() => setActiveFinding(finding.id)}
                      className={`finding-card finding-${finding.severity} ${activeFinding === finding.id ? 'active-finding' : ''}`}
                    >
                      <div className="finding-top">
                        <span className={`severity-badge badge-${finding.severity}`}>
                          {finding.severity === 'critical' ? 'CRITICAL ISSUE' : finding.severity === 'warning' ? 'WARNING' : 'PASSED CHECK'}
                        </span>
                        <span className="category-tag">{finding.category}</span>
                      </div>
                      
                      <h4 className="finding-title">{finding.title}</h4>
                      <p className="finding-explanation">{finding.explanation}</p>
                      
                      <div className="rule-cite">
                        <span className="rule-icon">⚖️</span>
                        <code>{finding.rule}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* TAB 2: PLAIN-LANGUAGE NEXT-STEP GUIDE */}
            {activeTab === 'guide' && (
              <div className="tab-panel">
                <div className="guide-card-stack">
                  <div className="guide-box box-what">
                    <h3>1. WHAT HAPPENED</h3>
                    <p>The agency issued a denial for Supplemental Housing Assistance under Regulation 42-A citing incomplete household documentation.</p>
                  </div>
                  
                  <div className="guide-box box-must">
                    <h3>2. WHAT YOU MUST DO NEXT</h3>
                    <p>File a formal appeal request along with updated income & household verification records.</p>
                  </div>
                  
                  <div className="guide-box box-deadline">
                    <h3>3. FILING DEADLINE</h3>
                    <p className="deadline-alert">
                      {selectedDoc.score < 75 
                        ? '🚨 UNCLEAR IN NOTICE (Standard 30 days usually applies from delivery date)' 
                        : '✅ OCTOBER 14, 2026 AT 5:00 PM EST'}
                    </p>
                  </div>
                  
                  <div className="guide-box box-action">
                    <h3>4. WHAT HAPPENS IF YOU DO NOTHING</h3>
                    <p>The denial becomes permanent and your right to appeal this specific decision will expire.</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* TAB 3: VERIFIABLE REVIEW CHAIN (PROVENANCE TRAIL) */}
            {activeTab === 'chain' && (
              <div className="tab-panel">
                <div className="timeline-container">
                  <div className="timeline-step">
                    <div className="timeline-marker">v1</div>
                    <div className="timeline-content">
                      <h4>Initial Document Upload & Hash Logging</h4>
                      <p className="timeline-hash">Hash: <code>e3b0c44298fc1c149afbf4c8996fb92427ae...</code></p>
                      <span className="timeline-score low-score">Score: 54/100 · 2 Critical Flags</span>
                    </div>
                  </div>
                  
                  <div className="timeline-step">
                    <div className="timeline-marker">v2</div>
                    <div className="timeline-content">
                      <h4>Automated Procedural Linter Audit</h4>
                      <p>Executed Rule Pack <code>PROC-RULE-104</code> & <code>PROC-RULE-201</code></p>
                      <span className="timeline-score mid-score">Score: 68/100 · Deadline Flagged</span>
                    </div>
                  </div>
                  
                  <div className="timeline-step">
                    <div className="timeline-marker">v3</div>
                    <div className="timeline-content">
                      <h4>Human Advocate Review & Citation Linking</h4>
                      <p>Added explicit appeal URL and 30-day deadline terms.</p>
                      <span className="timeline-score mid-score">Score: 81/100 · 1 Warning Remaining</span>
                    </div>
                  </div>
                  
                  <div className="timeline-step active-step">
                    <div className="timeline-marker">v4</div>
                    <div className="timeline-content">
                      <h4>Final Remediated Notice Export</h4>
                      <p className="timeline-hash">Hash: <code>7d865e959b2466918c9863afca942d0fb89...</code></p>
                      <span className="timeline-score high-score">Score: 89/100 · PASSED DUE PROCESS</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* TAB 4: SHARED WORKSPACE & COLLABORATION */}
            {activeTab === 'workspace' && (
              <div className="tab-panel">
                <div className="workspace-box">
                  <div className="workspace-header">
                    <span className="workspace-members">👥 2 Workspace Members Joined (Resident & Advocate)</span>
                    <button className="invite-btn" onClick={() => alert('Secure invite link copied to clipboard!')}>+ Invite Link</button>
                  </div>
                  
                  <div className="comments-list">
                    {comments.map((c, idx) => (
                      <div key={idx} className="comment-item">
                        <div className="comment-meta">
                          <span className="comment-user">{c.user}</span>
                          <span className="comment-time">{c.time}</span>
                        </div>
                        <p className="comment-text">{c.text}</p>
                      </div>
                    ))}
                  </div>
                  
                  <form onSubmit={handleAddComment} className="comment-form">
                    <input 
                      type="text" 
                      placeholder="Add a question or review comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="comment-input"
                    />
                    <button type="submit" className="comment-submit">Post ↵</button>
                  </form>
                </div>
              </div>
            )}
            
          </section>
        </div>
      </div>
    </div>
  )
}
