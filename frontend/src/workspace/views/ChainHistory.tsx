import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Blocks, ChevronDown, ChevronUp, CircleAlert, CircleCheck, Fingerprint, Link2, LoaderCircle, Search, ShieldCheck } from 'lucide-react'
import { useWorkspace } from '../store'
import { documentDisplayName, type SampleDoc } from '../data'
import {
  KIND_LABELS,
  fetchHistory,
  isRecordable,
  ledgerInfo,
  onLedgerChange,
  sha256Hex,
  type ChangeKind,
  type LedgerChange,
  type LedgerInfo,
} from '../ledger'
import { Card, Empty } from '../ui'

// Base makes a block about every two seconds; poll a little slower than that
// while anything is waiting for one, and not at all once everything is in.
const PENDING_POLL_MS = 2500

const short = (hex: string, head = 6, tail = 4) => {
  const value = hex.startsWith('0x') ? hex : `0x${hex}`
  return value.length > head + tail + 2 ? `${value.slice(0, head + 2)}…${value.slice(-tail)}` : value
}

function useLedgerInfo() {
  const [info, setInfo] = useState<LedgerInfo | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void ledgerInfo().then((value) => { if (live) setInfo(value) })
    return () => { live = false }
  }, [])
  return info
}

/** One document's on-chain history, kept current as changes are sent and mined. */
function useDocumentChain(documentId: string | null, enabled: boolean) {
  const [server, setServer] = useState<{ id: string | null; changes: LedgerChange[] | null }>({ id: null, changes: null })
  const [inFlight, setInFlight] = useState<LedgerChange[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!documentId || !enabled) return
    let live = true
    void fetchHistory(documentId).then((changes) => { if (live) setServer({ id: documentId, changes: changes ?? [] }) })
    return () => { live = false }
  }, [documentId, enabled, tick])

  useEffect(() => onLedgerChange((event) => {
    if (event.documentId !== documentId) return
    if (event.type === 'sending') setInFlight((current) => [...current, event.change])
    else setInFlight((current) => current.filter((change) => change.change_id !== event.changeId))
    setTick((value) => value + 1)
  }), [documentId])

  const fetched = server.id === documentId ? server.changes : null
  const changes = useMemo(() => fetched && [
    ...fetched,
    ...inFlight.filter((change) => change.document_id === documentId && !fetched.some((row) => row.change_id === change.change_id)),
  ], [fetched, inFlight, documentId])
  const waiting = Boolean(changes?.some((change) => change.status === 'pending'))

  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => setTick((value) => value + 1), PENDING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [waiting])

  return { changes, waiting }
}

/** Whether the text on screen is the text last written to the chain. */
function useIntegrity(document: SampleDoc | undefined, changes: LedgerChange[] | null) {
  const [current, setCurrent] = useState<{ text: string; hash: string } | null>(null)
  useEffect(() => {
    if (!document) return
    let live = true
    void sha256Hex(document.text).then((hash) => { if (live) setCurrent({ text: document.text, hash }) })
    return () => { live = false }
  }, [document])
  const latest = [...(changes ?? [])].reverse().find((change) => change.status === 'confirmed')
  if (!document || !latest || current?.text !== document.text) return null
  return { matches: latest.content_hash === current.hash, latest }
}

function ChainEntry({ change, explorer }: { change: LedgerChange; explorer: string }) {
  return (
    <li className={`is-${change.status}`}>
      <div className="ws-chain-block">
        {change.status === 'confirmed' && change.block_number !== null ? (
          <>
            <span>Block</span>
            {explorer
              ? <a href={`${explorer}/block/${change.block_number}`} target="_blank" rel="noreferrer">{change.block_number.toLocaleString()}</a>
              : <strong>{change.block_number.toLocaleString()}</strong>}
          </>
        ) : change.status === 'failed'
          ? <><CircleAlert size={16} aria-hidden="true" /><span>Not recorded</span></>
          : <><LoaderCircle size={16} className="ws-spin" aria-hidden="true" /><span>Pending</span></>}
      </div>
      <div className="ws-chain-body">
        <div className="ws-chain-title">
          <strong>{KIND_LABELS[change.kind]}</strong>
          {change.sequence !== null && <span className="ws-pill">Change #{change.sequence}</span>}
          {change.status === 'confirmed' && <span className="ws-pill ws-tone-good"><CircleCheck size={12} aria-hidden="true" /> Confirmed</span>}
        </div>
        <small>
          {new Date(change.block_time ? change.block_time * 1000 : change.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          {change.title && ` · ${change.title}`}
        </small>
        <div className="ws-chain-meta">
          <code title={`SHA-256 ${change.content_hash}`}><Fingerprint size={12} aria-hidden="true" /> {short(change.content_hash, 8, 6)}</code>
          {change.tx_hash && explorer && (
            <a href={`${explorer}/tx/${change.tx_hash}`} target="_blank" rel="noreferrer" className="ws-link">
              Transaction {short(change.tx_hash)} <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
        </div>
        {change.entry_hash && (
          <p className="ws-chain-link">
            <Link2 size={12} aria-hidden="true" />
            {/^0x0+$/.test(change.previous_entry) ? 'First entry' : `Follows ${short(change.previous_entry)}`} → entry {short(change.entry_hash)}
          </p>
        )}
        {change.status === 'failed' && change.error && <p className="ws-chain-error">{change.error}</p>}
        {change.status === 'pending' && change.error && <p className="ws-chain-note">{change.error}</p>}
      </div>
    </li>
  )
}

// The newest few are always shown; the rest wait behind "View all".
const PREVIEW_COUNT = 5
type StatusFilter = 'all' | LedgerChange['status']
const KIND_ORDER: ChangeKind[] = ['created', 'reviewed', 'edited', 'rewrite_applied', 'renamed']

function ChainEvents({ changes, explorer, documentId, label }: { changes: LedgerChange[]; explorer: string; documentId: string; label: string }) {
  // Expanded and filtered per document, so switching documents starts compact.
  const [view, setView] = useState<{ documentId: string; kind: 'all' | ChangeKind; status: StatusFilter; query: string } | null>(null)
  const expanded = view?.documentId === documentId
  const kind = expanded ? view.kind : 'all'
  const status = expanded ? view.status : 'all'
  const query = expanded ? view.query : ''
  const update = (next: Partial<{ kind: 'all' | ChangeKind; status: StatusFilter; query: string }>) =>
    setView({ documentId, kind, status, query, ...next })

  const newestFirst = [...changes].reverse()
  const needle = query.trim().toLowerCase().replace(/,/g, '')
  const filtered = newestFirst.filter((change) =>
    (kind === 'all' || change.kind === kind)
    && (status === 'all' || change.status === status)
    && (!needle || [String(change.block_number ?? ''), change.tx_hash, change.content_hash, change.entry_hash, change.title, KIND_LABELS[change.kind]]
      .some((value) => value.toLowerCase().includes(needle))))
  const shown = expanded ? filtered : newestFirst.slice(0, PREVIEW_COUNT)
  const hidden = newestFirst.length - PREVIEW_COUNT
  const kindCounts = new Map(KIND_ORDER.map((item) => [item, newestFirst.filter((change) => change.kind === item).length]))
  const filtering = kind !== 'all' || status !== 'all' || Boolean(needle)

  return (
    <>
      {expanded && (
        <div className="ws-chain-filters" role="group" aria-label="Filter blockchain events">
          <div className="ws-segment ws-chain-kinds" role="group" aria-label="Type of change">
            <button type="button" className={kind === 'all' ? 'is-active' : ''} aria-pressed={kind === 'all'} onClick={() => update({ kind: 'all' })}>All <em>{newestFirst.length}</em></button>
            {KIND_ORDER.filter((item) => kindCounts.get(item)).map((item) => (
              <button key={item} type="button" className={kind === item ? 'is-active' : ''} aria-pressed={kind === item} onClick={() => update({ kind: item })}>
                {KIND_LABELS[item]} <em>{kindCounts.get(item)}</em>
              </button>
            ))}
          </div>
          <div className="ws-chain-filter-row">
            <label className="ws-select">
              <span>Status</span>
              <select value={status} onChange={(event) => update({ status: event.target.value as StatusFilter })} aria-label="Filter by status">
                <option value="all">Any</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="failed">Not recorded</option>
              </select>
            </label>
            <label className="ws-chain-search">
              <Search size={14} aria-hidden="true" />
              <input value={query} onChange={(event) => update({ query: event.target.value })} placeholder="Block, transaction, or fingerprint" aria-label="Search blockchain events" />
            </label>
          </div>
          <p className="ws-chain-count" role="status">
            Showing {filtered.length} of {newestFirst.length} event{newestFirst.length === 1 ? '' : 's'}
            {filtering && <button type="button" className="ws-link" onClick={() => update({ kind: 'all', status: 'all', query: '' })}>Clear filters</button>}
          </p>
        </div>
      )}

      <ol className="ws-chain" aria-label={label}>
        {shown.map((change) => <ChainEntry key={change.change_id} change={change} explorer={explorer} />)}
      </ol>
      {expanded && !filtered.length && <p className="ws-chain-note">No event matches these filters.</p>}

      {newestFirst.length > PREVIEW_COUNT && (
        expanded
          ? <button type="button" className="ws-btn ws-btn-sm ws-chain-more" onClick={() => setView(null)}><ChevronUp size={14} /> Show the latest {PREVIEW_COUNT} only</button>
          : <button type="button" className="ws-btn ws-btn-sm ws-chain-more" onClick={() => update({})}><ChevronDown size={14} /> View all {newestFirst.length} events <span>· {hidden} older hidden</span></button>
      )}
    </>
  )
}

export function ChainHistory() {
  const ws = useWorkspace()
  const info = useLedgerInfo()
  const recordable = ws.documents.filter((doc) => isRecordable(doc.id))
  const [chosenId, setChosenId] = useState<string | null>(null)
  const documentId = (chosenId && recordable.some((doc) => doc.id === chosenId) ? chosenId : null)
    ?? (isRecordable(ws.selected.id) ? ws.selected.id : recordable[0]?.id ?? null)
  const document = recordable.find((doc) => doc.id === documentId)
  const { changes, waiting } = useDocumentChain(documentId, Boolean(info))
  const integrity = useIntegrity(document, changes)
  const explorer = info?.explorer_url ?? ''

  const picker = recordable.length > 1 && (
    <label className="ws-select">
      <span>Document</span>
      <select value={documentId ?? ''} onChange={(event) => setChosenId(event.target.value)} aria-label="Document history to show">
        {recordable.map((doc) => <option key={doc.id} value={doc.id}>{documentDisplayName(doc)}</option>)}
      </select>
    </label>
  )

  return (
    <Card
      title="On-chain history"
      subtitle="Every change to a document you add is fingerprinted and written to the blockchain as its own transaction. Only the fingerprint is published, never the text."
      action={picker || undefined}
      id="chain-title"
      className="ws-chain-card"
    >
      {info === undefined && <p className="ws-chain-note"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Connecting to the ledger…</p>}
      {info === null && (
        <Empty title="The document ledger is off">
          Sign in to record document history on-chain. If you are signed in, the ledger has not been set up for this deployment yet.
        </Empty>
      )}
      {info && !document && (
        <Empty title="No document history yet">Add a document and every change to it is recorded here, block by block. The sample documents are not recorded.</Empty>
      )}
      {info && document && (
        <>
          <div className="ws-chain-network">
            <span className={`ws-chain-live${waiting ? ' is-waiting' : ''}`} aria-hidden="true" />
            <span>{waiting ? 'Waiting for the next block' : 'Live'} on <strong>{info.network}</strong></span>
            {explorer && (
              <a href={`${explorer}/address/${info.contract_address}`} target="_blank" rel="noreferrer" className="ws-link">
                Contract {short(info.contract_address)} <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            )}
          </div>

          {integrity && (
            <p className={`ws-chain-integrity ${integrity.matches ? 'is-match' : 'is-changed'}`} role="status">
              {integrity.matches
                ? <><ShieldCheck size={15} aria-hidden="true" /> The text on screen matches the fingerprint in block {integrity.latest.block_number?.toLocaleString()}.</>
                : <><CircleAlert size={15} aria-hidden="true" /> The text has changed since block {integrity.latest.block_number?.toLocaleString()}. The next change will be recorded shortly.</>}
            </p>
          )}

          {!changes && <p className="ws-chain-note"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Reading this document’s history…</p>}
          {changes && !changes.length && <Empty title="Nothing recorded yet">Changes to {documentDisplayName(document)} will appear here as they are written to the chain.</Empty>}
          {changes && changes.length > 0 && (
            <ChainEvents changes={changes} explorer={explorer} documentId={document.id} label={`On-chain history of ${documentDisplayName(document)}`} />
          )}
        </>
      )}
      <p className="ws-chain-foot"><Blocks size={13} aria-hidden="true" /> Each entry commits to the one before it, so no step can be removed or reordered without breaking every later one.</p>
    </Card>
  )
}
