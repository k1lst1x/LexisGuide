/* Keep the workspace on the server as the person works, and bring it back
   when they return: documents (with their findings, review and edits),
   resolved findings, the open document, jurisdiction, tasks, and which sample
   documents they removed. Each change is saved about a second after it is
   made, and anything still waiting is sent when the tab is hidden. */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { sampleDocs, type SampleDoc, type WorkspaceTask } from './data'
import {
  deleteDocument, loadDocument, loadDocuments, loadWorkspaceState, saveDocument, saveWorkspaceState,
  type SaveStatus, type WorkspaceState,
} from './persistence'

const SAVE_DELAY_MS = 800
const RETRY_DELAY_MS = 5000
const STATE_KEY = '__workspace-state__'

const sampleSnapshots = new Map(sampleDocs.map((doc) => [doc.id, JSON.stringify(doc)]))
const isSample = (id: string) => sampleSnapshots.has(id)

type Options = {
  enabled: boolean
  documents: SampleDoc[]
  setDocuments: Dispatch<SetStateAction<SampleDoc[]>>
  resolved: Record<string, string[]>
  setResolved: Dispatch<SetStateAction<Record<string, string[]>>>
  selectedId: string
  setSelectedId: (id: string) => void
  jurisdiction: string
  setJurisdiction: (value: string) => void
  tasks: WorkspaceTask[]
  setTasks: Dispatch<SetStateAction<WorkspaceTask[]>>
}

/** What is worth saving for one document; null for an untouched sample. */
function snapshot(doc: SampleDoc, resolved: string[]) {
  const body = JSON.stringify(doc)
  if (isSample(doc.id) && body === sampleSnapshots.get(doc.id) && !resolved.length) return null
  return `${body}\u0000${JSON.stringify(resolved)}`
}

export function useSavedWorkspace(options: Options) {
  const { enabled } = options
  const [restoring, setRestoring] = useState(enabled)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const latest = useRef(options)
  useEffect(() => { latest.current = options })

  // What the server holds, so only real changes are sent.
  const savedSnapshots = useRef(new Map<string, string>())
  const savedState = useRef<string | null>(null)
  const knownIds = useRef<Set<string> | null>(null)
  const hiddenSamples = useRef<string[]>([])
  const timers = useRef(new Map<string, { timer: number; run: () => Promise<void> }>())
  // One save at a time per document, so an older version never lands last.
  const chains = useRef(new Map<string, Promise<void>>())
  const wanted = useRef(new Map<string, string>())
  const inFlight = useRef(0)
  const failed = useRef(false)

  const track = useCallback(async (work: () => Promise<void>) => {
    inFlight.current += 1
    setStatus('saving')
    try {
      await work()
    } catch {
      failed.current = true
    } finally {
      inFlight.current -= 1
      if (!inFlight.current && !timers.current.size) {
        setStatus(failed.current ? 'error' : 'saved')
        failed.current = false
      }
    }
  }, [])

  const start = useCallback((key: string, run: () => Promise<void>) => {
    timers.current.delete(key)
    const next = (chains.current.get(key) ?? Promise.resolve()).then(() => track(run))
    chains.current.set(key, next)
  }, [track])

  const schedule = useCallback((key: string, run: () => Promise<void>, delay = SAVE_DELAY_MS) => {
    const existing = timers.current.get(key)
    if (existing) window.clearTimeout(existing.timer)
    timers.current.set(key, { timer: window.setTimeout(() => start(key, run), delay), run })
    setStatus('saving')
  }, [start])

  const flush = useCallback(() => {
    for (const [key, { timer, run }] of timers.current) {
      window.clearTimeout(timer)
      start(key, run)
    }
  }, [start])

  // Restore once, on sign-in.
  useEffect(() => {
    if (!enabled) return
    let live = true
    Promise.all([loadDocuments(), loadWorkspaceState()])
      .then(async ([saved, state]) => {
        if (!live) return
        const { setDocuments, setResolved, setSelectedId, setJurisdiction, setTasks } = latest.current
        // Bodies past the list's size budget are fetched one by one.
        const complete = await Promise.all(saved.map(async (entry) =>
          entry.document ? entry : await loadDocument(entry.document_id).catch(() => null)))
        if (!live) return
        const restored = complete.filter((entry): entry is NonNullable<typeof entry> & { document: SampleDoc } => Boolean(entry?.document))
        const byId = new Map(restored.map((entry) => [entry.document_id, entry]))
        hiddenSamples.current = state.hidden_samples
        const documents = [
          ...restored.filter((entry) => !isSample(entry.document_id)).map((entry) => entry.document),
          ...sampleDocs.filter((doc) => !state.hidden_samples.includes(doc.id)).map((doc) => byId.get(doc.id)?.document ?? doc),
        ]
        const resolvedByDoc = Object.fromEntries(restored.map((entry) => [entry.document_id, entry.resolved]))
        for (const entry of restored) savedSnapshots.current.set(entry.document_id, snapshot(entry.document, entry.resolved) ?? '')
        knownIds.current = new Set(documents.map((doc) => doc.id))

        setDocuments(documents)
        setResolved((current) => ({ ...current, ...resolvedByDoc }))
        const selected = state.selected_document_id && documents.some((doc) => doc.id === state.selected_document_id)
          ? state.selected_document_id
          : documents[0]?.id
        if (selected) setSelectedId(selected)
        if (state.jurisdiction) setJurisdiction(state.jurisdiction)
        if (state.tasks) setTasks(state.tasks)
        savedState.current = JSON.stringify({
          selected_document_id: selected ?? null,
          jurisdiction: state.jurisdiction,
          hidden_samples: state.hidden_samples,
          tasks: state.tasks ?? latest.current.tasks,
        } satisfies WorkspaceState)
      })
      .catch(() => { if (live) setStatus('error') })
      .finally(() => { if (live) setRestoring(false) })
    return () => { live = false }
  }, [enabled])

  // Save documents that changed, and remove ones that were deleted.
  const { documents, resolved } = options
  useEffect(() => {
    if (!enabled || restoring) return
    const ids = new Set(documents.map((doc) => doc.id))
    for (const id of knownIds.current ?? []) {
      if (ids.has(id)) continue
      if (isSample(id) && !hiddenSamples.current.includes(id)) hiddenSamples.current = [...hiddenSamples.current, id]
      if (savedSnapshots.current.has(id) || wanted.current.has(id)) {
        savedSnapshots.current.delete(id)
        wanted.current.delete(id)
        schedule(id, () => deleteDocument(id), 0)
      }
    }
    knownIds.current = ids

    for (const doc of documents) {
      const docResolved = resolved[doc.id] ?? []
      const next = snapshot(doc, docResolved)
      if (next === null || savedSnapshots.current.get(doc.id) === next || wanted.current.get(doc.id) === next) continue
      wanted.current.set(doc.id, next)
      const save = async () => {
        // A newer version was scheduled after this one; let that one go.
        if (wanted.current.get(doc.id) !== next) return
        try {
          await saveDocument(doc, docResolved)
          savedSnapshots.current.set(doc.id, next)
        } catch (error) {
          window.setTimeout(() => { if (wanted.current.get(doc.id) === next) schedule(doc.id, save) }, RETRY_DELAY_MS)
          throw error
        }
      }
      schedule(doc.id, save)
    }
  }, [enabled, restoring, documents, resolved, schedule])

  // Save where the person left off.
  const { selectedId, jurisdiction, tasks } = options
  useEffect(() => {
    if (!enabled || restoring) return
    const state: WorkspaceState = {
      selected_document_id: selectedId,
      jurisdiction,
      hidden_samples: hiddenSamples.current,
      tasks,
    }
    const next = JSON.stringify(state)
    if (next === savedState.current) return
    schedule(STATE_KEY, async () => {
      await saveWorkspaceState(state)
      savedState.current = next
    })
  }, [enabled, restoring, selectedId, jurisdiction, tasks, documents, schedule])

  // Send anything still waiting when the tab is hidden or closed.
  useEffect(() => {
    if (!enabled) return
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [enabled, flush])

  return { restoring, saveStatus: status }
}
