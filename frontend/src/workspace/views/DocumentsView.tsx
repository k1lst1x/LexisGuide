import { useState } from 'react'
import { ArrowRight, ClipboardPaste, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react'
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
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)

  const leaveSelection = () => {
    setSelecting(false)
    setSelectedIds([])
    setConfirmingRemoval(false)
  }
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const removeSelected = () => {
    if (ws.removeDocuments(selectedIds)) leaveSelection()
  }

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
          {selecting ? <>
            <span className="ws-selection-count" aria-live="polite">{selectedIds.length} selected</span>
            <button type="button" className="ws-btn" onClick={leaveSelection}><X size={15} /> Cancel</button>
            <button type="button" className="ws-btn ws-btn-danger" disabled={!selectedIds.length} onClick={() => setConfirmingRemoval(true)}><Trash2 size={15} /> Remove{selectedIds.length ? ` ${selectedIds.length}` : ''}</button>
          </> : <button type="button" className="ws-icon-btn ws-doc-remove-trigger" onClick={() => setSelecting(true)} aria-label="Select documents to remove" title="Remove documents"><Trash2 size={16} /></button>}
          <button type="button" className="ws-btn" onClick={() => ws.setAddOpen(true)}><ClipboardPaste size={15} /> Paste text</button>
          <button type="button" className="ws-btn ws-btn-dark" onClick={() => ws.setAddOpen(true)}><Plus size={15} /> Add document</button>
        </>}
      />

      <div className="ws-toolbar">
        <label className="ws-search-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name, type, or status" aria-label="Filter documents" />
        </label>
        <div className={`ws-segment ws-doc-filter is-${filter}`} role="group" aria-label="Show documents">
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

      {selecting && <p className="ws-selection-note">Choose one or more documents, then select Remove. This only removes them from this workspace.</p>}
      <div key={filter} className={`ws-table ws-filter-results ${selecting ? 'is-selecting' : ''}`} role="list" aria-label="Documents in workspace">
        <div className="ws-table-head" aria-hidden="true"><span>Document</span><span>Score</span><span>Open findings</span><span>Deadline</span><span /></div>
        {rows.map((doc) => {
          const open = openFindings(doc, ws.resolved[doc.id])
          const kind = documentKind(doc.type)
          return (
            <article key={doc.id} role="listitem" className={`ws-row ${doc.id === ws.selected.id ? 'is-selected' : ''}`}>
              {selecting && <label className="ws-row-select" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleSelected(doc.id)} aria-label={`Select ${documentDisplayName(doc)} for removal`} />
              </label>}
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

      {confirmingRemoval && <div className="ws-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmingRemoval(false) }}>
        <section className="ws-dialog ws-dialog-sm ws-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-documents-title">
          <div className="ws-dialog-head">
            <div><h2 id="remove-documents-title">Remove selected documents?</h2><p>They will no longer appear in this workspace.</p></div>
            <button type="button" className="ws-icon-btn" onClick={() => setConfirmingRemoval(false)} aria-label="Close removal confirmation"><X size={18} /></button>
          </div>
          <ul className="ws-remove-list">
            {ws.documents.filter((doc) => selectedIds.includes(doc.id)).map((doc) => <li key={doc.id}>{documentDisplayName(doc)}</li>)}
          </ul>
          <div className="ws-dialog-actions">
            <button type="button" className="ws-btn" onClick={() => setConfirmingRemoval(false)}>Cancel</button>
            <button type="button" className="ws-btn ws-btn-danger" onClick={removeSelected}><Trash2 size={15} /> Remove {selectedIds.length} document{selectedIds.length === 1 ? '' : 's'}</button>
          </div>
        </section>
      </div>}
    </div>
  )
}
