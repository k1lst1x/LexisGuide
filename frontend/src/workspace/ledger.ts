/* Document history on the blockchain.

   Each change to a document the person added (created, reviewed, edited,
   rewrite applied, renamed) is fingerprinted here with SHA-256 and sent to the
   API, which writes it to the DocumentLedger contract on Base. Only the
   fingerprint leaves the browser; the text never does.

   Recording is best-effort and never blocks the workspace: signed out, offline,
   or with the ledger turned off, the document simply has no on-chain history. */
import { cognitoGetIdToken } from '../aws'
import { apiBase } from './api'

export type ChangeKind = 'created' | 'reviewed' | 'edited' | 'rewrite_applied' | 'renamed'

export type LedgerInfo = {
  enabled: boolean
  network: string
  chain_id: number
  explorer_url: string
  contract_address: string
  recorder_address: string
}

export type LedgerChange = {
  change_id: string
  document_id: string
  kind: ChangeKind
  content_hash: string
  title: string
  status: 'pending' | 'confirmed' | 'failed'
  created_at: string
  attempts: number
  tx_hash: string
  block_number: number | null
  block_time: number | null
  sequence: number | null
  entry_hash: string
  previous_entry: string
  error: string
}

export const KIND_LABELS: Record<ChangeKind, string> = {
  created: 'Document added',
  reviewed: 'AI review',
  edited: 'Text edited',
  rewrite_applied: 'Suggested rewrite applied',
  renamed: 'Renamed',
}

/** Only documents the person added are recorded; the built-in samples are not theirs. */
export const isRecordable = (documentId: string) => documentId.startsWith('upload-')

// How long typing must pause before an edit counts as one change.
const EDIT_SETTLE_MS = 3000

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  let token = await cognitoGetIdToken().catch(() => undefined)
  if (!token) return null
  const send = () => fetch(`${apiBase()}/api/v1/ledger${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${token}` },
  })
  let response = await send()
  if (response.status === 401) {
    token = await cognitoGetIdToken(true).catch(() => undefined)
    if (!token) return null
    response = await send()
  }
  if (!response.ok) return null
  return response.json() as Promise<T>
}

let info: Promise<LedgerInfo | null> | null = null

/** The ledger's network and contract, or null when it is off or unreachable. Asked once. */
export function ledgerInfo(): Promise<LedgerInfo | null> {
  info ??= request<LedgerInfo>('').then((value) => (value?.enabled ? value : null)).catch(() => null)
  // A failed lookup is retried next time rather than cached as "off".
  void info.then((value) => { if (!value) info = null })
  return info
}

export function fetchHistory(documentId: string): Promise<LedgerChange[] | null> {
  return request<LedgerChange[]>(`/changes?${new URLSearchParams({ document_id: documentId })}`).catch(() => null)
}

/** "sending" carries a stand-in for the change before the API has it, so the
    history can show it at once; "sent" means the API has answered. */
export type LedgerEvent =
  | { type: 'sending'; documentId: string; change: LedgerChange }
  | { type: 'sent'; documentId: string; changeId: string }
type Listener = (event: LedgerEvent) => void
const listeners = new Set<Listener>()

/** Hear about each change sent for a document, to refresh its history at once. */
export function onLedgerChange(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Each document's changes are sent one after another, in the order they happened.
const queues = new Map<string, Promise<unknown>>()

function inOrder(documentId: string, task: () => Promise<unknown>) {
  const next = (queues.get(documentId) ?? Promise.resolve()).then(task, task)
  queues.set(documentId, next)
  return next
}

export function recordChange(input: { documentId: string; kind: ChangeKind; text: string; title: string }) {
  if (!isRecordable(input.documentId)) return Promise.resolve()
  // An edit still settling is an earlier change; queue it first so order holds.
  flushEdit(input.documentId)
  return inOrder(input.documentId, async () => {
    if (!(await ledgerInfo())) return
    const body = {
      change_id: crypto.randomUUID(),
      document_id: input.documentId,
      kind: input.kind,
      content_hash: await sha256Hex(input.text),
      title: input.title,
    }
    const sending = request<LedgerChange>('/changes', { method: 'POST', body: JSON.stringify(body) }).catch(() => null)
    // Show the change as pending straight away, then refresh once its block is in.
    const change: LedgerChange = {
      ...body, status: 'pending', created_at: new Date().toISOString(), attempts: 0, tx_hash: '',
      block_number: null, block_time: null, sequence: null, entry_hash: '', previous_entry: '', error: '',
    }
    for (const listener of listeners) listener({ type: 'sending', documentId: input.documentId, change })
    await sending
    for (const listener of listeners) listener({ type: 'sent', documentId: input.documentId, changeId: body.change_id })
  })
}

const settlingEdits = new Map<string, { timer: number; send: () => void }>()

/** Record typing as one edit once it pauses, rather than one per keystroke. */
export function recordEdit(input: { documentId: string; text: string; title: string }) {
  if (!isRecordable(input.documentId)) return
  const existing = settlingEdits.get(input.documentId)
  if (existing) window.clearTimeout(existing.timer)
  const send = () => {
    settlingEdits.delete(input.documentId)
    void recordChange({ ...input, kind: 'edited' })
  }
  settlingEdits.set(input.documentId, { timer: window.setTimeout(send, EDIT_SETTLE_MS), send })
}

function flushEdit(documentId: string) {
  const settling = settlingEdits.get(documentId)
  if (!settling) return
  window.clearTimeout(settling.timer)
  settling.send()
}
