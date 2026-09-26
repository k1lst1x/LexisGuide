/* The right-hand panel in Messages: a document shared in the conversation,
   as every member sees it. Kept up to date while open, editable in place,
   and one click from a full review. */
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FileText, PencilLine, RefreshCw, Share2, X } from 'lucide-react'
import { useWorkspace } from '../store'
import { workspaceRequest } from '../api'
import { sha256Hex } from '../ledger'
import { SEVERITY, documentSnapshot, normalizeSeverity, type SharedDocumentSnapshot } from '../data'

type SharedFile = {
  document_id: string
  title: string
  shared_by_name?: string
  updated_at?: string
  document: SharedDocumentSnapshot
}

const REFRESH_MS = 5_000

function when(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function DocumentPanel({ documentId, fallbackTitle, onClose }: { documentId: string; fallbackTitle?: string; onClose: () => void }) {
  const ws = useWorkspace()
  const workspace = ws.activeWorkspace
  const shared = Boolean(workspace && !workspace.id.startsWith('local-'))
  const local = ws.documents.find((doc) => doc.id === documentId) ?? null
  const [remote, setRemote] = useState<{ id: string; file: SharedFile | null; error: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'text' | 'findings'>('text')

  const load = useCallback(async () => {
    if (!workspace || !shared) return
    try {
      const key = await sha256Hex(documentId)
      const file = await workspaceRequest<SharedFile>(`/workspaces/${workspace.id}/files/${key}`)
      setRemote({ id: documentId, file, error: '' })
    } catch (error) {
      setRemote((current) => ({ id: documentId, file: current?.id === documentId ? current.file : null, error: error instanceof Error ? error.message : 'Could not load this document.' }))
    }
  }, [documentId, shared, workspace])

  // Keep the shared copy current while it is open, except while editing it.
  useEffect(() => {
    if (!shared || editing !== null) return
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [editing, load, shared])

  const file = remote?.id === documentId ? remote.file : null
  const snapshot = file?.document ?? (local ? documentSnapshot(local) : null)
  const loading = shared && !remote && !local
  const localDiffers = Boolean(local && file && local.text !== file.document.text)

  const share = async (next: SharedDocumentSnapshot) => {
    if (!workspace || !shared) return
    const key = await sha256Hex(next.id)
    await workspaceRequest(`/workspaces/${workspace.id}/files/${key}`, { method: 'PUT', body: JSON.stringify(next) })
    await load()
  }
  const saveEdit = async () => {
    if (editing === null || !snapshot) return
    setBusy(true)
    try {
      if (local) ws.editDocumentText(local.id, editing)
      if (shared) await share({ ...snapshot, text: editing })
      setEditing(null)
      ws.setNotice(shared ? 'Your changes are shared with the channel.' : 'Your changes are saved.')
    } catch (error) {
      ws.setNotice(error instanceof Error ? error.message : 'Your changes could not be shared.')
    } finally {
      setBusy(false)
    }
  }
  const shareMine = async () => {
    if (!local) return
    setBusy(true)
    try {
      await share(documentSnapshot(local))
      ws.setNotice('Your latest version is shared.')
    } catch (error) {
      ws.setNotice(error instanceof Error ? error.message : 'Your version could not be shared.')
    } finally {
      setBusy(false)
    }
  }
  const openInReview = () => {
    if (local) ws.openInReview(local)
    else if (snapshot) ws.importSharedDocument(snapshot)
  }

  const title = snapshot?.title || file?.title || fallbackTitle || 'Shared document'
  return (
    <aside className="ws-doc-panel" aria-label={`Document: ${title}`}>
      <header className="ws-doc-panel-head">
        <span className="ws-doc-icon"><FileText size={16} /></span>
        <div>
          <h2>{title}</h2>
          <p>
            {snapshot?.type || 'Document'}
            {typeof snapshot?.score === 'number' && <> · score {snapshot.score}</>}
            {file?.shared_by_name && <> · shared by {file.shared_by_name}</>}
            {file?.updated_at && <> · {when(file.updated_at)}</>}
          </p>
        </div>
        <button type="button" className="ws-icon-btn" aria-label="Close document" onClick={onClose}><X size={16} /></button>
      </header>

      <div className="ws-doc-panel-actions">
        <button type="button" className="ws-btn ws-btn-sm ws-btn-dark" onClick={openInReview} disabled={!snapshot}><ExternalLink size={13} /> Open in Review</button>
        {editing === null
          ? <button type="button" className="ws-btn ws-btn-sm" onClick={() => { setEditing(snapshot?.text ?? ''); setTab('text') }} disabled={!snapshot}><PencilLine size={13} /> Edit</button>
          : <>
            <button type="button" className="ws-btn ws-btn-sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button type="button" className="ws-btn ws-btn-sm ws-btn-dark" onClick={() => void saveEdit()} disabled={busy}><Share2 size={13} /> {shared ? 'Save & share' : 'Save'}</button>
          </>}
      </div>
      {localDiffers && editing === null && (
        <div className="ws-doc-panel-note" role="status">
          <span>Your copy differs from the one shared here.</span>
          <button type="button" className="ws-link" onClick={() => file && ws.importSharedDocument(file.document, true)}><RefreshCw size={12} /> Use shared</button>
          <button type="button" className="ws-link" onClick={() => void shareMine()} disabled={busy}><Share2 size={12} /> Share mine</button>
        </div>
      )}

      {loading && <p className="ws-muted ws-doc-panel-empty">Loading…</p>}
      {!loading && !snapshot && <p className="ws-muted ws-doc-panel-empty">{remote?.error || 'This document is not shared here yet. Ask the person who mentioned it to attach it again.'}</p>}
      {snapshot && <>
        <div className="ws-segment ws-segment-full" role="tablist" aria-label="Document sections">
          <button type="button" role="tab" aria-selected={tab === 'text'} className={tab === 'text' ? 'is-active' : ''} onClick={() => setTab('text')}>Text</button>
          <button type="button" role="tab" aria-selected={tab === 'findings'} className={tab === 'findings' ? 'is-active' : ''} onClick={() => setTab('findings')} disabled={editing !== null}>Findings <em>{snapshot.findings.length}</em></button>
        </div>
        <div className="ws-doc-panel-body">
          {tab === 'text' && (editing !== null
            ? <textarea className="ws-doc-editor" value={editing} onChange={(event) => setEditing(event.target.value)} aria-label="Document text" autoFocus />
            : <pre className="ws-doc-text">{snapshot.text || 'No text in this document.'}</pre>)}
          {tab === 'findings' && (
            <ul className="ws-doc-findings">
              {snapshot.findings.map((finding, index) => {
                const severity = SEVERITY[normalizeSeverity(finding.severity)]
                return (
                  <li key={index}>
                    <span className="ws-pill" style={{ color: severity.color, background: severity.soft }}>{severity.short}</span>
                    <strong>{finding.title}</strong>
                    {finding.explanation && <p>{finding.explanation}</p>}
                    {finding.evidence && <blockquote>{finding.evidence}</blockquote>}
                  </li>
                )
              })}
              {!snapshot.findings.length && <li className="ws-muted">No findings yet. Open it in Review to check it.</li>}
            </ul>
          )}
        </div>
      </>}
    </aside>
  )
}
