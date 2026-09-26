/* Hooks for reading a document's blockchain history, shared by the Activity
   page, the History tab in Review, and the document panel in Messages. */
import { useEffect, useMemo, useState } from 'react'
import { fetchHistory, ledgerInfo, onLedgerChange, type LedgerChange, type LedgerInfo } from './ledger'

// Base makes a block about every two seconds; poll a little slower than that
// while anything is waiting for one, and not at all once everything is in.
const PENDING_POLL_MS = 2500
// Other members can change a shared document, so its history is checked now and then.
const SHARED_POLL_MS = 10_000

export function useLedgerInfo() {
  const [info, setInfo] = useState<LedgerInfo | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void ledgerInfo().then((value) => { if (live) setInfo(value) })
    return () => { live = false }
  }, [])
  return info
}

/** One document's on-chain history, kept current as changes are sent and mined.
    With a workspace id it is the shared document's history for that workspace. */
export function useDocumentChain(documentId: string | null, enabled: boolean, workspaceId?: string) {
  const [server, setServer] = useState<{ id: string | null; changes: LedgerChange[] | null }>({ id: null, changes: null })
  const [inFlight, setInFlight] = useState<LedgerChange[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!documentId || !enabled) return
    let live = true
    const key = `${workspaceId ?? ''}:${documentId}`
    void fetchHistory(documentId, workspaceId).then((changes) => { if (live) setServer({ id: key, changes: changes ?? [] }) })
    return () => { live = false }
  }, [documentId, enabled, tick, workspaceId])

  // Changes sent from this browser are the person's own history, not a workspace's.
  useEffect(() => onLedgerChange((event) => {
    if (workspaceId || event.documentId !== documentId) return
    if (event.type === 'sending') setInFlight((current) => [...current, event.change])
    else setInFlight((current) => current.filter((change) => change.change_id !== event.changeId))
    setTick((value) => value + 1)
  }), [documentId, workspaceId])

  useEffect(() => {
    if (!workspaceId || !enabled) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setTick((value) => value + 1) }, SHARED_POLL_MS)
    return () => window.clearInterval(timer)
  }, [workspaceId, enabled])

  const fetched = server.id === `${workspaceId ?? ''}:${documentId}` ? server.changes : null
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
