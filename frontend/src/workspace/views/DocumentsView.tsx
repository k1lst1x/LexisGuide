import { useState } from 'react'
import { ArrowRight, ClipboardPaste, Plus, Search, UploadCloud } from 'lucide-react'
import { useWorkspace } from '../store'
import { PASS_SCORE, SEVERITY, documentDisplayName, documentKind, openFindings, type SampleDoc } from '../data'
import { Empty, PageHeader, ScoreDot } from '../ui'

type Sort = 'priority' | 'score-low' | 'score-high' | 'name'
type Filter = 'all' | 'attention' | 'passing'

export function DocumentsView() {
  const ws = useWorkspace()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('priority')
  const [filter, setFilter] = useState<Filter>('all')
  const [dragging, setDragging] = useState(false)

  const openCount = (doc: SampleDoc) => openFindings(doc, ws.resolved[doc.id]).length
  const rows = ws.documents
    .filter((doc) => {
      const q = query.trim().toLowerCase()
      const matches = !q || [doc.title, doc.type, doc.agency, doc.status].some((value) => value.toLowerCase().includes(q))
      const bucket = filter === 'all' || (filter === 'attention' ? openCount(doc) > 0 : doc.score >= PASS_SCORE && openCount(doc) === 0)
      return matches && bucket
    })
    .sort((a, b) => sort === 'name' ? documentDisplayName(a).localeCompare(documentDisplayName(b))
      : sort === 'score-low' ? a.score - b.score
        : sort === 'score-high' ? b.score - a.score
          : (b.priorityScore ?? 100 - b.score) - (a.priorityScore ?? 100 - a.score))

  const counts = {
    all: ws.documents.length,
    attention: ws.documents.filter((doc) => openCount(doc) > 0).length,
    passing: ws.documents.filter((doc) => doc.score >= PASS_SCORE && openCount(doc) === 0).length,
  }

  return (
    <div
      className={`ws-page ws-docs ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) { ws.setAddOpen(true); void ws.addDocument({ file }) }
      }}
    >
      <PageHeader
        eyebrow="Your workspace"
        title="Documents"
        description="Every notice and agreement you are reviewing, with its score, open findings, and deadline."
        actions={<>
          <button type="button" className="ws-btn" onClick={() => ws.setAddOpen(true)}><ClipboardPaste size={15} /> Paste text</button>
          <button type="button" className="ws-btn ws-btn-dark" onClick={() => ws.setAddOpen(true)}><Plus size={15} /> Add document</button>
        </>}
      />

      <div className="ws-toolbar">
        <label className="ws-search-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name, type, or status" aria-label="Filter documents" />
        </label>
        <div className="ws-segment" role="group" aria-label="Show documents">
          {(['all', 'attention', 'passing'] as Filter[]).map((key) => (
            <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
              {key === 'all' ? 'All' : key === 'attention' ? 'Needs attention' : 'Passing'} <em>{counts[key]}</em>
            </button>
          ))}
        </div>
        <label className="ws-select">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort files">
            <option value="priority">Most urgent</option>
            <option value="score-low">Lowest score</option>
            <option value="score-high">Highest score</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div className="ws-table" role="list" aria-label="Documents in workspace">
        <div className="ws-table-head" aria-hidden="true"><span>Document</span><span>Score</span><span>Open findings</span><span>Deadline</span><span /></div>
        {rows.map((doc) => {
          const open = openFindings(doc, ws.resolved[doc.id])
          const kind = documentKind(doc.type)
          return (
            <article key={doc.id} role="listitem" className={`ws-row ${doc.id === ws.selected.id ? 'is-selected' : ''}`}>
              <button type="button" className="ws-row-main" onClick={() => ws.openInReview(doc)} aria-label={`Open ${documentDisplayName(doc)} in Review`}>
                <span className="ws-doc-icon" aria-hidden="true">{kind.icon}</span>
                <span className="ws-row-title"><strong>{doc.title}</strong><small>{kind.label} · {doc.agency} · {doc.date}</small></span>
              </button>
              <span className="ws-row-score"><ScoreDot score={doc.score} /><i className="ws-mini-track"><b style={{ width: `${doc.score}%` }} /></i></span>
              <span className="ws-row-findings">
                {open.length ? <>
                  <strong>{open.length}</strong>
                  {(['critical', 'warning'] as const).map((sev) => {
                    const n = open.filter((f) => f.severity === sev).length
                    return n ? <em key={sev} style={{ color: SEVERITY[sev].color }}>{SEVERITY[sev].icon} {n} {SEVERITY[sev].short.toLowerCase()}</em> : null
                  })}
                </> : <em className="ws-ok">✓ All clear</em>}
              </span>
              <span className="ws-row-deadline">
                {doc.deadline ? new Date(doc.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : doc.findings.some((f) => /deadline/i.test(f.title + f.category) && f.severity !== 'pass') ? <em className="ws-warn">Missing</em> : '—'}
              </span>
              <button type="button" className="ws-btn ws-btn-sm" onClick={() => ws.openInReview(doc)}>Review <ArrowRight size={13} /></button>
            </article>
          )
        })}
        {!rows.length && <Empty title="No documents match">Try a different filter, or add a new document.</Empty>}
      </div>

      <button type="button" className="ws-dropzone" onClick={() => ws.setAddOpen(true)}>
        <UploadCloud size={20} />
        <span><strong>Drop a file anywhere on this page</strong> or click to choose one. PDF, Word, HTML, RTF and text files work.</span>
      </button>
    </div>
  )
}
