/* Version history for one document, read from the blockchain ledger.

   Each change is a block on chain holding the document's fingerprint. The
   text of each version is kept by the API; opening one checks it against the
   fingerprint in its block, shows what differs from the current text, and can
   restore it. Used in Review and in the document panel in Messages. */
import { useEffect, useState } from 'react'
import { ArrowUpRight, CircleAlert, History, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react'
import { KIND_LABELS, fetchVersion, sha256Hex, type LedgerChange, type LedgerVersion } from '../ledger'
import { useDocumentChain, useLedgerInfo } from '../useChain'
import { diffLines, diffRows, diffStats, type DiffLine } from '../diff'
import { Empty } from '../ui'

type Props = {
  documentId: string
  currentText: string
  /** A shared document's workspace; its history is the workspace's. */
  workspaceId?: string
  /** Whether changes to this document are recorded at all (the samples are not). */
  recorded: boolean
  onRestore?: (text: string, change: LedgerChange) => void | Promise<void>
}

const when = (change: LedgerChange) =>
  new Date(change.block_time ? change.block_time * 1000 : change.created_at)
    .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The version before the selected one: its text, or why it cannot be compared. */
type Previous = { text: string } | { missing: 'first' | 'no-text' | 'unavailable' }
type Loaded = { changeId: string; version: LedgerVersion | null; localMatch: boolean; previous: Previous }

function Diff({ lines, label }: { lines: DiffLine[]; label: string }) {
  return (
    <div className="ws-diff" aria-label={label}>
      {diffRows(lines).map((row, index) => row.kind === 'fold'
        ? <div key={index} className="ws-diff-fold">{row.count} unchanged line{row.count === 1 ? '' : 's'}</div>
        : row.kind === 'changed'
          ? (
            <div key={index} className="ws-diff-line is-changed">
              <span aria-hidden="true">~</span>
              <span>{row.parts.map((part, at) => part.kind === 'same' ? part.text
                : part.kind === 'added' ? <ins key={at}>{part.text}</ins>
                  : <del key={at}>{part.text}</del>)}</span>
            </div>
          )
          : <div key={index} className={`ws-diff-line is-${row.kind}`}><span aria-hidden="true">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}</span>{row.text || ' '}</div>)}
    </div>
  )
}

function Proof({ version, localMatch, explorer }: { version: LedgerVersion; localMatch: boolean; explorer: string }) {
  const block = version.block_number?.toLocaleString()
  if (!localMatch || !version.matches_fingerprint || version.on_chain === 'mismatch') {
    return <p className="ws-history-proof is-bad" role="alert"><CircleAlert size={14} aria-hidden="true" /> This text does not match the fingerprint recorded for it. Do not rely on it.</p>
  }
  if (version.on_chain === 'verified') {
    return (
      <p className="ws-history-proof is-good" role="status">
        <ShieldCheck size={14} aria-hidden="true" /> Verified: matches the fingerprint in block {block}.
        {explorer && version.tx_hash && <a className="ws-link" href={`${explorer}/tx/${version.tx_hash}`} target="_blank" rel="noreferrer">View on chain <ArrowUpRight size={12} aria-hidden="true" /></a>}
      </p>
    )
  }
  if (version.on_chain === 'pending') {
    return <p className="ws-history-proof" role="status"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Matches its fingerprint; waiting for its block.</p>
  }
  return <p className="ws-history-proof" role="status"><CircleAlert size={14} aria-hidden="true" /> Matches its stored fingerprint. The chain could not be reached to confirm the block.</p>
}

export function DocumentHistory({ documentId, currentText, workspaceId, recorded, onRestore }: Props) {
  const info = useLedgerInfo()
  const { changes, waiting } = useDocumentChain(recorded ? documentId : null, Boolean(info), workspaceId)
  const [selected, setSelected] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [view, setView] = useState<'edit' | 'now' | 'text'>('edit')
  const [currentHash, setCurrentHash] = useState<{ text: string; hash: string } | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    let live = true
    void sha256Hex(currentText).then((hash) => { if (live) setCurrentHash({ text: currentText, hash }) })
    return () => { live = false }
  }, [currentText])

  // The change just before the selected one: what the selected edit changed from.
  const selectedIndex = changes?.findIndex((item) => item.change_id === selected) ?? -1
  const before = changes && selectedIndex > 0 ? changes[selectedIndex - 1] : null
  const beforeId = before?.change_id ?? null
  const beforeHasText = Boolean(before?.has_version)

  useEffect(() => {
    if (!selected) return
    let live = true
    const loadPrevious = async (): Promise<Previous> => {
      if (!beforeId) return { missing: 'first' }
      if (!beforeHasText) return { missing: 'no-text' }
      const earlier = await fetchVersion(documentId, beforeId, workspaceId)
      return earlier ? { text: earlier.text } : { missing: 'unavailable' }
    }
    void Promise.all([fetchVersion(documentId, selected, workspaceId), loadPrevious()]).then(async ([version, previous]) => {
      // Checked here too, so a wrong answer from anywhere is caught.
      const localMatch = version ? (await sha256Hex(version.text)) === version.content_hash : false
      if (live) setLoaded({ changeId: selected, version, localMatch, previous })
    })
    return () => { live = false }
  }, [documentId, selected, workspaceId, beforeId, beforeHasText])

  if (info === undefined) return <p className="ws-chain-note"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Connecting to the ledger…</p>
  if (info === null) return <Empty title="History is off">Sign in to keep a verified history of your documents on the blockchain.</Empty>
  if (!recorded) return <Empty title="No history for sample documents">Add your own document and every change to it is kept here, block by block.</Empty>
  if (!changes) return <p className="ws-chain-note"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Reading the history from the chain…</p>
  if (!changes.length) return <Empty title="No changes recorded yet">Edits to this document will appear here as they are written to the chain.</Empty>

  const newestFirst = [...changes].reverse()
  const current = currentHash?.text === currentText ? currentHash.hash : ''
  const open = loaded && loaded.changeId === selected ? loaded : null
  const version = open?.version ?? null
  const previous = open?.previous
  const editLines = version && previous && 'text' in previous ? diffLines(previous.text, version.text) : []
  const editStats = diffStats(editLines)
  const nowLines = version && view === 'now' ? diffLines(version.text, currentText) : []
  const nowStats = diffStats(nowLines)
  const change = newestFirst.find((item) => item.change_id === selected)
  const trusted = Boolean(version && open?.localMatch && version.matches_fingerprint && version.on_chain !== 'mismatch')

  const restore = async () => {
    if (!version || !change || !onRestore) return
    if (!window.confirm(`Restore the version from ${when(change)}? The current text is kept in the history.`)) return
    setRestoring(true)
    try { await onRestore(version.text, change) } finally { setRestoring(false) }
  }

  return (
    <div className="ws-history">
      <p className="ws-history-head">
        <History size={14} aria-hidden="true" />
        {newestFirst.length} version{newestFirst.length === 1 ? '' : 's'} on <strong>{info.network}</strong>
        {waiting && <span className="ws-muted"> · waiting for a block</span>}
      </p>
      <ol className="ws-history-list" aria-label="Versions">
        {newestFirst.map((item, index) => {
          const isCurrent = Boolean(current) && item.content_hash === current
          const active = item.change_id === selected
          return (
            <li key={item.change_id}>
              <button
                type="button"
                className={`ws-history-item ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                disabled={!item.has_version}
                title={item.has_version ? 'Open this version' : 'Only the fingerprint was kept for this change'}
                onClick={() => setSelected(active ? null : item.change_id)}
              >
                <span className={`ws-history-dot is-${item.status}`} aria-hidden="true" />
                <span className="ws-history-main">
                  <strong>{KIND_LABELS[item.kind]}{index === newestFirst.length - 1 ? ' · first version' : ''}</strong>
                  <small>{when(item)}{item.changed_by ? ` · ${item.changed_by}` : ''}</small>
                </span>
                <span className="ws-history-side">
                  {isCurrent && <span className="ws-pill ws-tone-good">Current</span>}
                  {item.status === 'confirmed' && item.block_number !== null
                    ? <small>Block {item.block_number.toLocaleString()}</small>
                    : <small>{item.status === 'failed' ? 'Not recorded' : 'Pending'}</small>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {selected && (
        <section className="ws-history-version" aria-label="Selected version">
          {!open && <p className="ws-chain-note"><LoaderCircle size={14} className="ws-spin" aria-hidden="true" /> Loading this version…</p>}
          {open && !version && <p className="ws-chain-note">This version could not be loaded.</p>}
          {version && open && <>
            <Proof version={version} localMatch={open.localMatch} explorer={info.explorer_url} />
            <div className="ws-history-tools">
              <div className="ws-segment" role="group" aria-label="Show">
                <button type="button" className={view === 'edit' ? 'is-active' : ''} aria-pressed={view === 'edit'} onClick={() => setView('edit')}>What changed</button>
                {version.text !== currentText && (
                  <button type="button" className={view === 'now' ? 'is-active' : ''} aria-pressed={view === 'now'} onClick={() => setView('now')}>Compared with now</button>
                )}
                <button type="button" className={view === 'text' ? 'is-active' : ''} aria-pressed={view === 'text'} onClick={() => setView('text')}>Full text</button>
              </div>
              {onRestore && trusted && version.text !== currentText && (
                <button type="button" className="ws-btn ws-btn-sm ws-btn-dark" onClick={() => void restore()} disabled={restoring}><RotateCcw size={13} /> {restoring ? 'Restoring…' : 'Restore this version'}</button>
              )}
            </div>
            {view === 'text' && <pre className="ws-history-text">{version.text || 'This version was empty.'}</pre>}
            {(view === 'edit' || (view === 'now' && version.text === currentText)) && previous && (
              'missing' in previous
                ? (
                  <p className="ws-chain-note">
                    {previous.missing === 'first'
                      ? 'This is the first version: the document started with this text. Choose Full text to read it.'
                      : previous.missing === 'no-text'
                        ? 'The version before this one was recorded before versions were kept, so only its fingerprint exists and this edit cannot be shown.'
                        : 'The version before this one could not be loaded, so this edit cannot be shown right now.'}
                  </p>
                )
                : previous.text === version.text
                  ? <p className="ws-chain-note">The text did not change in this step{change ? ` (${KIND_LABELS[change.kind].toLowerCase()})` : ''}.</p>
                  : (
                    <>
                      <p className="ws-muted ws-history-stats">In this change: <span className="is-added">+{editStats.added}</span> <span className="is-removed">−{editStats.removed}</span> lines{change?.changed_by ? ` · by ${change.changed_by}` : ''}</p>
                      <Diff lines={editLines} label="What changed in this version" />
                    </>
                  )
            )}
            {view === 'now' && version.text !== currentText && (
              <>
                <p className="ws-muted ws-history-stats">From this version to now: <span className="is-added">+{nowStats.added}</span> <span className="is-removed">−{nowStats.removed}</span> lines</p>
                <Diff lines={nowLines} label="Changes since this version" />
              </>
            )}
          </>}
        </section>
      )}
    </div>
  )
}
