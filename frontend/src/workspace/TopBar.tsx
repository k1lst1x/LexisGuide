import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CloudAlert, CloudCheck, LoaderCircle, LogOut, Search, Settings, Sparkles, X } from 'lucide-react'
import { useWorkspace } from './store'
import { aiSearch, type AiSearchResult } from './api'
import { documentDisplayName, documentKind, openFindings } from './data'

const AI_PROMPTS = ['Find termination without notice clauses', 'Which document has the lowest score?', 'Explain tenant liability and repair risks']

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handler = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onOutside() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside])
}

export function SearchBox() {
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'internal' | 'ai'>('internal')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AiSearchResult | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutside(ref, close)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0) }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const docs = (q ? ws.documents.filter((d) => [d.title, d.type, d.status, d.agency].some((v) => v.toLowerCase().includes(q))) : ws.documents).slice(0, 4)
  const findings = q ? ws.documents.flatMap((d) => d.findings.filter((f) => [f.title, f.category, f.explanation, f.evidence].some((v) => v.toLowerCase().includes(q))).map((f) => ({ d, f }))).slice(0, 5) : []
  const runAi = async (text: string) => {
    if (!text.trim()) return
    setQuery(text)
    setLoading(true)
    setResult(null)
    setResult(await aiSearch(text, ws.documents, ws.selected))
    setLoading(false)
  }
  const go = (docId: string, findingId?: string) => { ws.openInReview(docId, findingId); setOpen(false); setQuery('') }

  return (
    <div className="ws-search" ref={ref}>
      <div className={`ws-search-bar ${open ? 'is-open' : ''}`}>
        <button type="button" className="ws-search-trigger" aria-label="Search workspace" onClick={() => { setOpen((v) => !v); window.setTimeout(() => inputRef.current?.focus(), 0) }}>
          {mode === 'ai' ? <Sparkles size={15} /> : <Search size={15} />}
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => { if (event.key === 'Enter' && mode === 'ai') { event.preventDefault(); void runAi(query) } }}
          placeholder={mode === 'ai' ? 'Ask AI about clauses, fairness, or deadlines… (Enter)' : 'Search documents, issues, or rules…'}
          aria-label="Search documents, issues, or rules"
        />
        {query && <button type="button" className="ws-icon-btn ws-icon-btn-sm" aria-label="Clear search" onClick={() => { setQuery(''); setResult(null) }}><X size={13} /></button>}
        <kbd>⌘K</kbd>
      </div>
      {open && (
        <section className="ws-popover ws-search-panel" role="dialog" aria-label="Search workspace">
          <div className="ws-segment" role="tablist" aria-label="Search mode">
            <button type="button" role="tab" aria-selected={mode === 'internal'} className={mode === 'internal' ? 'is-active' : ''} onClick={() => setMode('internal')}><Search size={13} /> Workspace</button>
            <button type="button" role="tab" aria-selected={mode === 'ai'} className={mode === 'ai' ? 'is-active' : ''} onClick={() => setMode('ai')}><Sparkles size={13} /> AI Search</button>
          </div>
          {mode === 'internal' ? <>
            <h3>{q ? 'Matching documents' : 'Recent documents'}<small>{docs.length}</small></h3>
            {docs.map((d) => (
              <button key={d.id} type="button" className="ws-result" onClick={() => go(d.id)}>
                <span className="ws-doc-icon">{documentKind(d.type).icon}</span>
                <span><strong>{documentDisplayName(d)}</strong><small>{d.type} · score {d.score} · {openFindings(d, ws.resolved[d.id]).length} open</small></span>
              </button>
            ))}
            {q && <>
              <h3>Flagged language<small>{findings.length}</small></h3>
              {findings.map(({ d, f }) => (
                <button key={`${d.id}-${f.id}`} type="button" className="ws-result" onClick={() => go(d.id, f.id)}>
                  <i className={`ws-sev-bar ws-sev-${f.severity}`} />
                  <span><strong>{f.title}</strong><small>{documentDisplayName(d)} · {f.category}</small></span>
                </button>
              ))}
              {!docs.length && !findings.length && <p className="ws-muted">Nothing matches “{query}”.</p>}
            </>}
          </> : (
            <div className="ws-ai-search">
              <div className="ws-chips">{AI_PROMPTS.map((p) => <button key={p} type="button" onClick={() => void runAi(p)}>{p}</button>)}</div>
              <button type="button" className="ws-btn ws-btn-dark ws-btn-sm" disabled={loading || !query.trim()} onClick={() => void runAi(query)}>{loading ? 'Thinking…' : 'Ask AI'}</button>
              {loading && <p className="ws-muted">Reading your documents…</p>}
              {result && (
                <article className="ws-ai-answer">
                  <header><Sparkles size={14} /> AI answer {result.confidence && <em>{result.confidence}</em>}</header>
                  <p>{result.answer}</p>
                  {result.findings?.map((f, i) => <div key={`${f.title}-${i}`} className="ws-ai-finding"><strong>{f.title}</strong><small>{f.explanation}</small></div>)}
                  {result.sources?.length ? <small className="ws-muted">Sources: {result.sources.map((s) => s.title).join(' · ')}</small> : null}
                  <button type="button" className="ws-btn ws-btn-sm" onClick={() => { ws.openInReview(ws.selected); setOpen(false) }}>Open in Review</button>
                </article>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export function Notifications() {
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutside(ref, close)
  const open_ = openFindings(ws.selected, ws.resolved[ws.selected.id]).length
  const items = [
    { title: 'Review ready', detail: `${documentDisplayName(ws.selected)} has ${open_} item${open_ === 1 ? '' : 's'} to review.`, time: 'Just now' },
    { title: 'AI scan updated', detail: `${ws.selected.findings.length} checks were evaluated on the current document.`, time: 'Today' },
    { title: 'Tip', detail: 'Mark findings resolved as you go to track progress on Home.', time: 'Today' },
  ]
  return (
    <div className="ws-menu-anchor" ref={ref}>
      <button type="button" className="ws-icon-btn" aria-label="Notifications" aria-expanded={open} onClick={() => { setOpen((v) => !v); setUnread(false) }}>
        <Bell size={17} />{unread && <b className="ws-dot" />}
      </button>
      {open && (
        <section className="ws-popover ws-notify" role="dialog" aria-label="Latest announcements">
          <h3>Notifications</h3>
          {items.map((item) => <div key={item.title} className="ws-notify-item"><strong>{item.title}</strong><p>{item.detail}</p><small>{item.time}</small></div>)}
        </section>
      )}
    </div>
  )
}

export function AccountMenu({ onSignOut, onClose }: { onSignOut?: () => void; onClose: () => void }) {
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutside(ref, close)
  const email = ws.userEmail || 'Guest reviewer'
  return (
    <div className="ws-menu-anchor" ref={ref}>
      <button type="button" className="ws-avatar-btn" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{email[0].toUpperCase()}</button>
      {open && (
        <div className="ws-popover ws-menu ws-account">
          <div className="ws-account-head"><i className="ws-avatar">{email[0].toUpperCase()}</i><div><strong>{email}</strong><small>{ws.userEmail ? 'Signed in with AWS Cognito' : 'Demo workspace'}</small></div></div>
          <button type="button" onClick={() => { ws.go('settings'); setOpen(false) }}><Settings size={14} /> Settings</button>
          <button type="button" onClick={() => (onSignOut ?? onClose)()}><LogOut size={14} /> Sign Out &amp; Exit</button>
        </div>
      )}
    </div>
  )
}

/** Whether the workspace is safely on the server. Silent until something has been saved. */
export function SaveStatus() {
  const ws = useWorkspace()
  if (ws.restoring) return <span className="ws-save is-saving" role="status"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Restoring…</span>
  if (ws.saveStatus === 'saving') return <span className="ws-save is-saving" role="status"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Saving…</span>
  if (ws.saveStatus === 'saved') return <span className="ws-save is-saved" role="status"><CloudCheck size={14} aria-hidden="true" /> All changes saved</span>
  if (ws.saveStatus === 'error') return <span className="ws-save is-error" role="status"><CloudAlert size={14} aria-hidden="true" /> Not saved yet · retrying</span>
  return null
}
