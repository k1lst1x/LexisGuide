/* Workspace state: documents, the active review, resolutions, collaboration,
   and the actions every view shares. Views read it with useWorkspace(). */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  LAST_SECTION_KEY, MESSAGE_STORAGE_KEY, cleanExtractedText, defaultTasks, defaultWorkspaceMessages, documentDisplayName,
  extractDocumentText, fileTitle, openFindings, sampleDocs,
  type Finding, type NavItem, type SampleDoc, type WorkspaceMember, type WorkspaceMessage, type WorkspaceSummary, type WorkspaceTask,
} from './data'
import { reviewNewDocument, runDocumentAction, workspaceRequest } from './api'

const RESOLVED_KEY = 'lexisguide:resolved-findings'
const NAV_KEYS: NavItem[] = ['overview', 'documents', 'linter', 'chain', 'team', 'settings']

export type AddStage = 'idle' | 'reading' | 'checking' | 'scoring' | 'done' | 'error'
export type ReviewAction = 'review' | 'negotiate' | 'rewrite'

function readJson<T>(key: string, fallback: T, valid: (value: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return valid(parsed) ? parsed as T : fallback
  } catch { return fallback }
}

function useWorkspaceState(userEmail?: string) {
  const [nav, setNavState] = useState<NavItem>(() => {
    const saved = window.localStorage.getItem(LAST_SECTION_KEY) as NavItem | null
    return saved && NAV_KEYS.includes(saved) ? saved : 'overview'
  })
  const [documents, setDocuments] = useState<SampleDoc[]>(sampleDocs)
  const [selectedId, setSelectedId] = useState(sampleDocs[0].id)
  const [activeFindingId, setActiveFindingId] = useState<string | null>(sampleDocs[0].findings[0]?.id ?? null)
  const [resolved, setResolved] = useState<Record<string, string[]>>(() => readJson(RESOLVED_KEY, {}, (v) => !!v && typeof v === 'object' && !Array.isArray(v)))
  const [jurisdiction, setJurisdiction] = useState('')
  const [busyAction, setBusyAction] = useState<ReviewAction | null>(null)
  const [notice, setNotice] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addStage, setAddStage] = useState<AddStage>('idle')
  const [addMessage, setAddMessage] = useState('')

  const [comments, setComments] = useState<WorkspaceMessage[]>(() => readJson(MESSAGE_STORAGE_KEY, defaultWorkspaceMessages,
    (v) => Array.isArray(v) && v.every((m) => typeof m?.id === 'string' && typeof m?.text === 'string')))
  const [reactions, setReactions] = useState<Record<string, string[]>>({})
  const [tasks, setTasks] = useState<WorkspaceTask[]>(defaultTasks)
  const [draft, setDraft] = useState('')
  const [messageTab, setMessageTab] = useState<'chat' | 'files' | 'tasks'>('chat')

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantQuestion, setAssistantQuestion] = useState<{ id: number; text: string } | null>(null)
  /** Open the chat popup and ask it something about what is on screen. */
  const askAssistant = useCallback((text: string) => {
    setAssistantOpen(true)
    setAssistantQuestion((current) => ({ id: (current?.id ?? 0) + 1, text }))
  }, [])
  const [composerFocus, setComposerFocus] = useState(0)
  const focusComposer = useCallback(() => setComposerFocus((n) => n + 1), [])

  const selected = documents.find((doc) => doc.id === selectedId) ?? documents[0]
  const activeFinding = selected.findings.find((finding) => finding.id === activeFindingId) ?? null
  const isDemo = !documents.some((doc) => doc.id.startsWith('upload-'))

  useEffect(() => { window.localStorage.setItem(LAST_SECTION_KEY, nav) }, [nav])
  useEffect(() => { window.localStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(comments)) }, [comments])
  useEffect(() => { window.localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved)) }, [resolved])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 5200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const go = useCallback((next: NavItem) => setNavState(next), [])

  const selectDocument = useCallback((doc: SampleDoc | string, findingId?: string | null) => {
    const target = typeof doc === 'string' ? documents.find((item) => item.id === doc) : doc
    if (!target) return
    setSelectedId(target.id)
    const firstOpen = openFindings(target, resolved[target.id])[0] ?? target.findings[0]
    setActiveFindingId(findingId === undefined ? firstOpen?.id ?? null : findingId)
  }, [documents, resolved])

  const openInReview = useCallback((doc: SampleDoc | string, findingId?: string | null) => {
    selectDocument(doc, findingId)
    setNavState('linter')
  }, [selectDocument])

  const updateDocument = useCallback((updated: SampleDoc) => {
    setDocuments((current) => current.map((doc) => doc.id === updated.id ? updated : doc))
  }, [])

  const toggleResolved = useCallback((findingId: string) => {
    setResolved((current) => {
      const list = current[selectedId] ?? []
      return { ...current, [selectedId]: list.includes(findingId) ? list.filter((id) => id !== findingId) : [...list, findingId] }
    })
  }, [selectedId])

  /** Resolve the current finding and move to the next open one. */
  const resolveAndNext = useCallback((findingId: string) => {
    const list = resolved[selectedId] ?? []
    if (list.includes(findingId)) { toggleResolved(findingId); return }
    const nowResolved = [...list, findingId]
    setResolved((current) => ({ ...current, [selectedId]: nowResolved }))
    const next = openFindings(selected, nowResolved)[0]
    if (next) setActiveFindingId(next.id)
    else setNotice(`All findings in ${documentDisplayName(selected)} are resolved.`)
  }, [resolved, selectedId, selected, toggleResolved])

  const addDocument = useCallback(async (input: { file: File } | { title: string; text: string }) => {
    setAddStage('reading')
    setAddMessage('file' in input ? `Reading ${input.file.name}…` : 'Reading your text…')
    try {
      let title: string, type: string, text: string, id: string, hash: string
      if ('file' in input) {
        const extracted = await extractDocumentText(input.file)
        title = fileTitle(input.file)
        type = extracted.type
        text = extracted.text
        id = `upload-${input.file.name}-${input.file.lastModified}-${input.file.size}`
        hash = `local-${input.file.size}-${input.file.lastModified}`
      } else {
        text = cleanExtractedText(input.text)
        if (!text) throw new Error('Paste the document text to review it.')
        title = input.title.trim() || 'Pasted document'
        type = 'Pasted document'
        id = `upload-pasted-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${text.length}`
        hash = `local-pasted-${text.length}`
      }
      setAddStage('checking')
      setAddMessage(`Checking ${title} for unclear or risky terms…`)
      const reviewed = await reviewNewDocument({ id, title, type, text, hash, jurisdiction })
      setAddStage('scoring')
      setDocuments((current) => [reviewed, ...current.filter((doc) => doc.id !== reviewed.id)])
      setSelectedId(reviewed.id)
      setActiveFindingId(openFindings(reviewed)[0]?.id ?? reviewed.findings[0]?.id ?? null)
      setAddStage('done')
      setAddMessage(`${title} review is ready.`)
      setNotice(`${title} review is ready. Select a highlighted passage to see why it needs attention.`)
      setNavState('linter')
      return reviewed
    } catch (error) {
      setAddStage('error')
      setAddMessage(error instanceof Error ? error.message : 'We could not read this file. Try pasting its text instead.')
      return null
    }
  }, [jurisdiction])

  const runAction = useCallback(async (action: ReviewAction) => {
    setBusyAction(action)
    setNotice(action === 'rewrite' ? 'Preparing proposed rewrites…' : action === 'negotiate' ? 'Preparing negotiation points…' : 'Re-checking the document…')
    try {
      const updated = await runDocumentAction(selected, action, jurisdiction)
      updateDocument(updated)
      setActiveFindingId(updated.findings[0]?.id ?? null)
      setNotice(`${action === 'rewrite' ? 'Proposed rewrites' : action === 'negotiate' ? 'Negotiation points' : 'Updated review'} ready. Nothing was applied automatically.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The AI action failed. Your document is unchanged.')
    } finally {
      setBusyAction(null)
    }
  }, [selected, jurisdiction, updateDocument])

  const applyRewrite = useCallback((finding: Finding) => {
    if (!finding.suggestedRewrite || !finding.evidence || !selected.text.includes(finding.evidence)) {
      setNotice('This suggestion could not be matched to the exact text, so nothing was changed.')
      return
    }
    updateDocument({ ...selected, text: selected.text.replace(finding.evidence, finding.suggestedRewrite), version: 'Working copy · edit applied' })
    setResolved((current) => ({ ...current, [selected.id]: [...new Set([...(current[selected.id] ?? []), finding.id])] }))
    setNotice('The suggested wording was applied to a working copy. Review it before sharing.')
  }, [selected, updateDocument])

  const editText = useCallback((text: string) => {
    updateDocument({ ...selected, text, version: 'Working copy · edited' })
  }, [selected, updateDocument])

  const sendMessage = useCallback((text: string, attachment?: string | null) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setComments((current) => [...current, { id: `message-${Date.now()}`, user: 'You (Reviewer)', text: trimmed, time: 'Just now', saved: false, attachment: attachment || undefined }])
    setDraft('')
  }, [])

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    setReactions((current) => {
      const list = current[messageId] ?? []
      return { ...current, [messageId]: list.includes(emoji) ? list.filter((item) => item !== emoji) : [...list, emoji] }
    })
  }, [])

  const toggleSaved = useCallback((messageId: string) => {
    setComments((current) => current.map((m) => m.id === messageId ? { ...m, saved: !m.saved } : m))
  }, [])

  const addTask = useCallback((title: string, detail: string) => {
    setTasks((current) => [...current, { id: `task-${Date.now()}-${current.length}`, title, detail, completed: false }])
  }, [])

  const toggleTask = useCallback((taskId: string) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task))
  }, [])

  /** Hand a finding to the team: open Messages with a draft the user reviews before sending. */
  const discuss = useCallback((text: string) => {
    setDraft(text)
    setMessageTab('chat')
    setNavState('team')
    setComposerFocus((n) => n + 1)
  }, [])

  const refreshWorkspaces = useCallback(async () => {
    try {
      const next = await workspaceRequest<WorkspaceSummary[]>('/workspaces')
      setWorkspaces(next)
      const workspace = next[0] ?? null
      setActiveWorkspace((current) => next.find((item) => item.id === current?.id) ?? workspace)
      const target = workspace
      if (target) setMembers(await workspaceRequest<WorkspaceMember[]>(`/workspaces/${target.id}/members`))
    } catch (error) {
      setWorkspaceNotice(error instanceof Error ? error.message : 'Shared workspace is unavailable.')
    }
  }, [])

  const createWorkspace = useCallback(async (name: string) => {
    if (!name.trim()) return
    try {
      const workspace = await workspaceRequest<WorkspaceSummary>('/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
      setWorkspaceNotice(`Workspace “${workspace.name}” created.`)
      await refreshWorkspaces()
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not create workspace.') }
  }, [refreshWorkspaces])

  const createInvite = useCallback(async (): Promise<string | null> => {
    if (!activeWorkspace) return null
    try {
      const invite = await workspaceRequest<{ invite_code: string }>(`/workspaces/${activeWorkspace.id}/invites`, { method: 'POST' })
      setWorkspaceNotice('Invite code created. Share it with a signed-in teammate.')
      return invite.invite_code
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not create invite.'); return null }
  }, [activeWorkspace])

  const joinWorkspace = useCallback(async (code: string) => {
    if (!code.trim()) return
    try {
      const workspace = await workspaceRequest<WorkspaceSummary>('/workspaces/join', { method: 'POST', body: JSON.stringify({ invite_code: code.trim() }) })
      setWorkspaceNotice(`Joined “${workspace.name}”.`)
      await refreshWorkspaces()
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not join workspace.') }
  }, [refreshWorkspaces])

  const selectWorkspace = useCallback(async (id: string) => {
    const workspace = workspaces.find((item) => item.id === id) ?? null
    setActiveWorkspace(workspace)
    if (!workspace) { setMembers([]); return }
    try { setMembers(await workspaceRequest<WorkspaceMember[]>(`/workspaces/${workspace.id}/members`)) } catch { setMembers([]) }
  }, [workspaces])

  const stats = useMemo(() => {
    const open = documents.flatMap((doc) => openFindings(doc, resolved[doc.id]).map((finding) => ({ doc, finding })))
    const deadlines = documents.filter((doc) => doc.deadline).map((doc) => ({ doc, date: new Date(doc.deadline as string) })).sort((a, b) => a.date.getTime() - b.date.getTime())
    const missingDeadline = documents.filter((doc) => doc.findings.some((f) => /deadline/i.test(f.title + f.category) && f.severity !== 'pass' && !resolved[doc.id]?.includes(f.id)))
    const average = Math.round(documents.reduce((sum, doc) => sum + doc.score, 0) / Math.max(documents.length, 1))
    const next = [...documents].filter((doc) => openFindings(doc, resolved[doc.id]).length)
      .sort((a, b) => (b.priorityScore ?? 100 - b.score) - (a.priorityScore ?? 100 - a.score))[0] ?? null
    return { open, critical: open.filter((item) => item.finding.severity === 'critical').length, deadlines, missingDeadline, average, next }
  }, [documents, resolved])

  return {
    userEmail, nav, go, documents, selected, selectDocument, openInReview, activeFinding, setActiveFindingId,
    resolved, toggleResolved, resolveAndNext, jurisdiction, setJurisdiction, busyAction, runAction, applyRewrite, editText,
    notice, setNotice, addOpen, setAddOpen, addStage, setAddStage, addMessage, addDocument, isDemo, stats,
    comments, reactions, toggleReaction, toggleSaved, sendMessage, draft, setDraft, composerFocus, focusComposer, tasks, addTask, toggleTask,
    messageTab, setMessageTab, discuss,
    workspaces, activeWorkspace, members, workspaceNotice, refreshWorkspaces, createWorkspace, createInvite, joinWorkspace, selectWorkspace,
    assistantOpen, setAssistantOpen, assistantQuestion, askAssistant,
  }
}

export type WorkspaceStore = ReturnType<typeof useWorkspaceState>
const Ctx = createContext<WorkspaceStore | null>(null)

export function WorkspaceProvider({ userEmail, children }: { userEmail?: string; children: ReactNode }) {
  const store = useWorkspaceState(userEmail)
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  const store = useContext(Ctx)
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return store
}
