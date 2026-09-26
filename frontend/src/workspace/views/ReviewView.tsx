import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ListTodo, MessageSquare, PencilLine, RotateCcw, Sparkles, Wand2, X } from 'lucide-react'
import { MessageLoading } from '../../components/ui/message-loading'
import { useWorkspace } from '../store'
import { bySeverity, documentDisplayName, documentKind, openFindings, type Finding, type SampleDoc } from '../data'
import { ProgressLine, ScoreMeter } from '../charts'
import { Empty, SeverityChip } from '../ui'

function DocumentSwitcher() {
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div className="ws-switcher" ref={ref}>
      <button type="button" className="ws-switcher-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={`Viewing ${documentDisplayName(ws.selected)}`}>
        <span className="ws-doc-icon" aria-hidden="true">{documentKind(ws.selected.type).icon}</span>
        <span><small>Reviewing</small><strong>{documentDisplayName(ws.selected)}</strong></span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="ws-popover ws-switcher-menu" role="listbox" aria-label="Choose a document">
          {ws.documents.map((doc) => {
            const count = openFindings(doc, ws.resolved[doc.id]).length
            return (
              <button key={doc.id} type="button" role="option" aria-selected={doc.id === ws.selected.id} className={doc.id === ws.selected.id ? 'is-active' : ''} onClick={() => { ws.selectDocument(doc); setOpen(false) }}>
                <span className="ws-doc-icon" aria-hidden="true">{documentKind(doc.type).icon}</span>
                <span><strong>{documentDisplayName(doc)}</strong><small>{count ? `${count} open finding${count === 1 ? '' : 's'}` : 'All clear'} · score {doc.score}</small></span>
                {doc.id === ws.selected.id && <Check size={14} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

type Highlight = { start: number; end: number; findings: Finding[] }

/** Normalise only presentation differences, while retaining a map back to the
 * source text. AI evidence often differs from a PDF extraction by line breaks,
 * curly quotes, or repeated spaces; exact string splitting silently lost those
 * otherwise valid highlights. */
function normalisedText(value: string) {
  let text = ''
  const sourceIndex: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (/\s/.test(char)) {
      if (text.endsWith(' ')) continue
      text += ' '
      sourceIndex.push(index)
      continue
    }
    const replacement = char
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .toLowerCase()
    text += replacement
    sourceIndex.push(index)
  }
  return { text, sourceIndex }
}

function documentHighlights(doc: SampleDoc): Highlight[] {
  const source = normalisedText(doc.text)
  const candidates: Array<{ start: number; end: number; finding: Finding }> = []
  for (const finding of doc.findings) {
    if (finding.severity === 'pass' || !finding.evidence) continue
    const evidence = normalisedText(finding.evidence).text.trim()
    if (evidence.length < 3) continue
    let offset = source.text.indexOf(evidence)
    while (offset !== -1) {
      const last = offset + evidence.length - 1
      candidates.push({ start: source.sourceIndex[offset], end: source.sourceIndex[last] + 1, finding })
      offset = source.text.indexOf(evidence, offset + evidence.length)
    }
  }
  candidates.sort((left, right) => left.start - right.start || right.end - left.end)

  // One excerpt can support more than one finding. Merge overlapping ranges so
  // no later match erases an earlier one; its accessible label still names all
  // supported findings.
  return candidates.reduce<Highlight[]>((highlights, candidate) => {
    const previous = highlights.at(-1)
    if (previous && candidate.start < previous.end) {
      previous.end = Math.max(previous.end, candidate.end)
      if (!previous.findings.some((finding) => finding.id === candidate.finding.id)) {
        previous.findings.push(candidate.finding)
      }
      return highlights
    }
    highlights.push({ start: candidate.start, end: candidate.end, findings: [candidate.finding] })
    return highlights
  }, [])
}

function DocumentText({ doc, activeId, resolved, onSelect }: { doc: SampleDoc; activeId: string | null; resolved: string[]; onSelect: (id: string) => void }) {
  const highlights = documentHighlights(doc)
  const parts: Array<{ text: string; highlight?: Highlight }> = []
  let cursor = 0
  for (const highlight of highlights) {
    if (cursor < highlight.start) parts.push({ text: doc.text.slice(cursor, highlight.start) })
    parts.push({ text: doc.text.slice(highlight.start, highlight.end), highlight })
    cursor = highlight.end
  }
  if (cursor < doc.text.length) parts.push({ text: doc.text.slice(cursor) })
  return (
    <div className="ws-paper-text ws-paper-text-highlighted">
      {parts.map((part, index) => {
        if (!part.highlight) return <span key={index}>{part.text}</span>
        const [finding] = part.highlight.findings
        const done = part.highlight.findings.every((item) => resolved.includes(item.id))
        const active = part.highlight.findings.some((item) => item.id === activeId)
        const label = part.highlight.findings.map((item) => item.title).join('; ')
        return (
          // A <mark> wraps across lines like a physical highlighter; a button cannot.
          <mark key={index} role="button" tabIndex={0} title={label} aria-label={`Finding: ${label}`} onClick={() => onSelect(finding.id)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(finding.id) } }}
            className={`ws-mark ws-mark-${done ? 'resolved' : finding.severity} ${active ? 'is-active' : ''}`}>
            {part.text}
          </mark>
        )
      })}
    </div>
  )
}

function FindingDetail({ finding, index, total }: { finding: Finding; index: number; total: number }) {
  const ws = useWorkspace()
  const doc = ws.selected
  const done = (ws.resolved[doc.id] ?? []).includes(finding.id)
  const list = bySeverity(doc.findings)
  const move = (step: number) => {
    const next = list[(index + step + list.length) % list.length]
    if (next) ws.setActiveFindingId(next.id)
  }
  return (
    <article className="ws-detail" aria-labelledby="finding-title">
      <div className="ws-detail-nav">
        <SeverityChip severity={finding.severity} resolved={done} />
        <span className="ws-muted">{finding.category}</span>
        <span className="ws-detail-step">
          <button type="button" onClick={() => move(-1)} aria-label="Previous finding"><ArrowLeft size={14} /></button>
          {index + 1} / {total}
          <button type="button" onClick={() => move(1)} aria-label="Next finding"><ArrowRight size={14} /></button>
        </span>
      </div>
      <h2 id="finding-title">{finding.title}</h2>
      <p className="ws-detail-lead">{finding.explanation}</p>

      <section>
        <h3>Why it matters to you</h3>
        <p>{finding.whyItMatters || (finding.severity === 'pass'
          ? 'This part of the document already gives you what you need.'
          : 'Unclear wording like this can cost you time, money, or the chance to respond. Get it clarified in writing before you rely on it.')}</p>
      </section>
      <section>
        <h3>From the document</h3>
        <blockquote>{finding.evidence}</blockquote>
      </section>
      <section>
        <h3>Recommended next step</h3>
        <p>{finding.negotiationPoint || (finding.severity === 'pass' ? 'No action needed. Keep this wording as it is.' : 'Ask the sender to correct this in writing, and point to the rule below.')}</p>
        <code>{finding.rule}</code>
      </section>
      {finding.suggestedRewrite && (
        <section className="ws-rewrite">
          <h3>Suggested wording</h3>
          <p>“{finding.suggestedRewrite}”</p>
          <button type="button" className="ws-btn ws-btn-sm" onClick={() => ws.applyRewrite(finding)}><PencilLine size={13} /> Apply to working copy</button>
        </section>
      )}

      <div className="ws-detail-actions">
        {finding.severity !== 'pass' && (
          <button type="button" className={`ws-btn ${done ? '' : 'ws-btn-green'}`} onClick={() => ws.resolveAndNext(finding.id)}>
            {done ? <><RotateCcw size={14} /> Reopen</> : <><Check size={14} /> Mark resolved</>}
          </button>
        )}
        <button type="button" className="ws-btn" onClick={() => { ws.addTask(`Review: ${finding.title}`, `${documentDisplayName(doc)} · ${finding.category}`); ws.setNotice('Task added to Messages → Tasks.') }}><ListTodo size={14} /> Create task</button>
        <button type="button" className="ws-btn" onClick={() => ws.discuss(`Could we review “${finding.title}” in ${documentDisplayName(doc)}? `)}><MessageSquare size={14} /> Discuss</button>
        <button type="button" className="ws-btn" onClick={() => ws.askAssistant(`Explain “${finding.title}” in plain language. What does it mean for me, and what should I do next?`)}><Sparkles size={14} /> Ask assistant</button>
      </div>
    </article>
  )
}

export function ReviewView() {
  const ws = useWorkspace()
  const doc = ws.selected
  const [queue, setQueue] = useState<'open' | 'resolved' | 'all'>('open')
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleState, setTitleState] = useState({ documentId: doc.id, draft: doc.title })
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const resolved = ws.resolved[doc.id] ?? []
  const actionable = doc.findings.filter((f) => f.severity !== 'pass')
  const openList = openFindings(doc, resolved)
  const ordered = bySeverity(doc.findings)
  const shown = queue === 'open' ? openList : queue === 'resolved' ? ordered.filter((f) => resolved.includes(f.id) || f.severity === 'pass') : ordered
  const finding = ws.activeFinding
  const findingIndex = finding ? ordered.findIndex((f) => f.id === finding.id) : -1

  const titleDraft = titleState.documentId === doc.id ? titleState.draft : doc.title
  const saveTitle = () => { if (ws.renameDocument(titleDraft)) setEditingTitle(false) }

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) setActionsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="ws-page ws-review">
      <header className="ws-review-bar">
        <div className="ws-review-title">
          <h1>Review</h1>
          <DocumentSwitcher />
        </div>
        <span className="ws-count">{doc.findings.length} findings</span>
        <div className="ws-review-tools">
          <label className="ws-inline-field">
            <span>Jurisdiction</span>
            <input value={ws.jurisdiction} onChange={(event) => ws.setJurisdiction(event.target.value)} placeholder="e.g. Illinois" aria-label="Legal jurisdiction" />
          </label>
          <div className="ws-menu-anchor" ref={actionsRef}>
            <button type="button" className={`ws-btn ws-btn-dark ${ws.busyAction ? 'is-working' : ''}`} aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => setActionsOpen((v) => !v)} disabled={!!ws.busyAction}>
              {ws.busyAction ? <MessageLoading className="ws-ai-loading" /> : <Wand2 size={15} />}
              {!ws.busyAction && <span>AI actions</span>}
              {ws.busyAction && <span className="ws-sr-only" aria-live="polite">AI action in progress</span>}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {actionsOpen && (
              <div className="ws-popover ws-menu" role="menu" aria-label="AI document actions">
                {([
                  ['review', 'Re-check this document', 'Run the review again with your jurisdiction.'],
                  ['negotiate', 'Suggest negotiation points', 'What to ask for, clause by clause.'],
                  ['rewrite', 'Draft clearer wording', 'Proposed rewrites you can apply one by one.'],
                ] as const).map(([key, title, detail]) => (
                  <button key={key} type="button" role="menuitem" onClick={() => { setActionsOpen(false); void ws.runAction(key) }}>
                    <strong>{title}</strong><small>{detail}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="ws-review-grid">
        <aside className="ws-queue" aria-label="Findings">
          <div className="ws-queue-stats">
            <ScoreMeter score={doc.score} size="sm" />
            <ProgressLine done={resolved.length} total={actionable.length} label="Findings resolved" />
          </div>
          <div className="ws-segment ws-segment-full" role="group" aria-label="Filter findings">
            <button type="button" className={queue === 'open' ? 'is-active' : ''} aria-pressed={queue === 'open'} onClick={() => setQueue('open')}>Open <em>{openList.length}</em></button>
            <button type="button" className={queue === 'resolved' ? 'is-active' : ''} aria-pressed={queue === 'resolved'} onClick={() => setQueue('resolved')}>Done <em>{doc.findings.length - openList.length}</em></button>
            <button type="button" className={queue === 'all' ? 'is-active' : ''} aria-pressed={queue === 'all'} onClick={() => setQueue('all')}>All</button>
          </div>
          <ul>
            {shown.map((item) => {
              const done = resolved.includes(item.id) || item.severity === 'pass'
              return (
                <li key={item.id}>
                  <button type="button" className={`ws-queue-item ${finding?.id === item.id ? 'is-active' : ''} ${done ? 'is-done' : ''}`} onClick={() => ws.setActiveFindingId(item.id)}>
                    <i className={`ws-sev-bar ws-sev-${resolved.includes(item.id) ? 'resolved' : item.severity}`} aria-hidden="true" />
                    <span><strong>{item.title}</strong><small>{item.category}</small></span>
                    {done && <Check size={14} className="ws-queue-check" />}
                  </button>
                </li>
              )
            })}
          </ul>
          {!shown.length && <Empty title={queue === 'open' ? 'Nothing left to resolve' : 'Nothing here yet'}>{queue === 'open' ? 'Every finding in this document is done.' : 'Resolved findings will appear here.'}</Empty>}
        </aside>

        <section className="ws-reader" aria-label="Document">
          <div className="ws-reader-head">
            <div>
              <small>{doc.agency}</small>
              {editingTitle ? (
                <form className="ws-title-edit" onSubmit={(event) => { event.preventDefault(); saveTitle() }}>
                  <input value={titleDraft} onChange={(event) => setTitleState({ documentId: doc.id, draft: event.target.value })} aria-label="Document name" autoFocus maxLength={200} />
                  <button type="submit" className="ws-icon-btn" aria-label="Save document name" title="Save name"><Check size={15} /></button>
                  <button type="button" className="ws-icon-btn" aria-label="Cancel document rename" title="Cancel" onClick={() => { setTitleState({ documentId: doc.id, draft: doc.title }); setEditingTitle(false) }}><X size={15} /></button>
                </form>
              ) : (
                <span className="ws-title-display"><strong>{doc.title}</strong><button type="button" className="ws-icon-btn" aria-label="Rename document" title="Rename document" onClick={() => { setTitleState({ documentId: doc.id, draft: doc.title }); setEditingTitle(true) }}><PencilLine size={14} /></button></span>
              )}
              <span className="ws-muted">{doc.version} · {doc.date}</span>
            </div>
            <div className="ws-segment" role="group" aria-label="Reader mode">
              <button type="button" className={mode === 'read' ? 'is-active' : ''} aria-pressed={mode === 'read'} onClick={() => setMode('read')}>Read</button>
              <button type="button" className={mode === 'edit' ? 'is-active' : ''} aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Edit</button>
            </div>
          </div>
          {doc.summary && <div className="ws-summary"><Sparkles size={14} /><p>{doc.summary}</p></div>}
          {mode === 'read'
            ? <DocumentText doc={doc} activeId={finding?.id ?? null} resolved={resolved} onSelect={ws.setActiveFindingId} />
            : <textarea className="ws-editor" value={doc.text} onChange={(event) => ws.editText(event.target.value)} aria-label="Edit document text" spellCheck />}
          {doc.nextSteps?.length ? (
            <div className="ws-next-steps"><strong>Suggested next steps</strong><ol>{doc.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol></div>
          ) : null}
        </section>

        <aside className="ws-detail-col" aria-label="Finding detail">
          {finding ? <FindingDetail finding={finding} index={findingIndex} total={doc.findings.length} />
            : <Empty title="Select a finding">Choose an item from the list or a highlighted passage in the document.</Empty>}
        </aside>
      </div>
    </div>
  )
}
