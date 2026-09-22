/* Workspace state: documents, the active review, resolutions, collaboration,
   and the actions every view shares. Views read it with useWorkspace(). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  LAST_SECTION_KEY, MESSAGE_STORAGE_KEY, cleanExtractedText, defaultTasks, defaultWorkspaceMessages, documentDisplayName,
  extractDocumentText, fileTitle, openFindings, sampleDocs,
  type Finding, type NavItem, type SampleDoc, type WorkspaceMember, type WorkspaceMessage, type WorkspaceSummary, type WorkspaceTask,
} from './data'
import { reviewNewDocument, runDocumentAction, workspaceRequest } from './api'

const RESOLVED_KEY = 'lexisguide:resolved-findings'
const LOCAL_WORKSPACES_KEY = 'lexisguide:local-workspaces'
const LOCAL_INVITES_KEY = 'lexisguide:local-workspace-invites'
const PERSONAL_WORKSPACE_ID = 'personal'
const NAV_KEYS: NavItem[] = ['overview', 'assistant', 'documents', 'linter', 'chain', 'team', 'settings']

export type AddStage = 'idle' | 'reading' | 'checking' | 'scoring' | 'done' | 'error'
export type ReviewAction = 'review' | 'negotiate' | 'rewrite'

function readJson<T>(key: string, fallback: T, valid: (value: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return valid(parsed) ? parsed as T : fallback
  } catch { return fallback }
}

function localWorkspaces() {
  return readJson<WorkspaceSummary[]>(LOCAL_WORKSPACES_KEY, [], (value) => Array.isArray(value) && value.every((item) =>
    typeof item?.id === 'string' && item.id.startsWith('local-') && typeof item.name === 'string'))
}

function saveLocalWorkspaces(workspaces: WorkspaceSummary[]) {
  try { window.localStorage.setItem(LOCAL_WORKSPACES_KEY, JSON.stringify(workspaces.filter((item) => item.id.startsWith('local-')))) } catch { /* optional browser storage */ }
}

function createLocalInviteCode(workspaceId: string) {
  const code = `LG-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  try {
    const current = readJson<Record<string, string>>(LOCAL_INVITES_KEY, {}, (value) => !!value && typeof value === 'object' && !Array.isArray(value))
    window.localStorage.setItem(LOCAL_INVITES_KEY, JSON.stringify({ ...current, [workspaceId]: code }))
  } catch { /* the code remains usable in this session */ }
  return code
}

function messageGroups() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(MESSAGE_STORAGE_KEY) || 'null') as unknown
    const validMessages = (value: unknown): value is WorkspaceMessage[] => Array.isArray(value) && value.every((message) =>
      typeof message?.id === 'string' && typeof message?.text === 'string')
    // Upgrade the previous single-conversation storage format without losing it.
    if (validMessages(raw)) return { [PERSONAL_WORKSPACE_ID]: raw }
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.values(raw).every(validMessages)) return raw as Record<string, WorkspaceMessage[]>
  } catch { /* start with the sample conversation */ }
  return { [PERSONAL_WORKSPACE_ID]: defaultWorkspaceMessages }
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

  const [messagesByWorkspace, setMessagesByWorkspace] = useState<Record<string, WorkspaceMessage[]>>(messageGroups)
  const [reactionsByWorkspace, setReactionsByWorkspace] = useState<Record<string, Record<string, string[]>>>({})
  const [tasks, setTasks] = useState<WorkspaceTask[]>(defaultTasks)
  const [draft, setDraft] = useState('')
  const [messageTab, setMessageTab] = useState<'chat' | 'files' | 'tasks'>('chat')

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>(localWorkspaces)
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(null)
  const activeWorkspaceRef = useRef<WorkspaceSummary | null>(null)
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
  const activeMessageWorkspace = activeWorkspace?.id ?? PERSONAL_WORKSPACE_ID
  const comments = messagesByWorkspace[activeMessageWorkspace] ?? []
  const reactions = reactionsByWorkspace[activeMessageWorkspace] ?? {}
  const activeFinding = selected.findings.find((finding) => finding.id === activeFindingId) ?? null
  const isDemo = !documents.some((doc) => doc.id.startsWith('upload-'))

  useEffect(() => { window.localStorage.setItem(LAST_SECTION_KEY, nav) }, [nav])
  useEffect(() => { window.localStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(messagesByWorkspace)) }, [messagesByWorkspace])
  useEffect(() => { window.localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved)) }, [resolved])
  useEffect(() => { activeWorkspaceRef.current = activeWorkspace }, [activeWorkspace])
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

  const linkedDocument = activeWorkspace?.linked_document_id
    ? documents.find((document) => document.id === activeWorkspace.linked_document_id) ?? null
    : null
  const canManageLinkedDocument = !activeWorkspace || activeWorkspace.role === 'owner' || activeWorkspace.role === 'local'

  const setLinkedDocument = useCallback(async (document: SampleDoc) => {
    const workspace = activeWorkspace
    if (!workspace) {
      setNotice('Create or select a shared workspace before linking a document.')
      return false
    }
    if (workspace.role !== 'owner' && workspace.role !== 'local') {
      setNotice('Only the workspace host can change the linked document.')
      return false
    }
    const apply = (updated: WorkspaceSummary) => {
      setWorkspaces((current) => {
        const next = current.map((item) => item.id === updated.id ? updated : item)
        saveLocalWorkspaces(next)
        return next
      })
      activeWorkspaceRef.current = updated
      setActiveWorkspace(updated)
    }
    const next = { ...workspace, linked_document_id: document.id, linked_document_title: documentDisplayName(document) }
    if (workspace.id.startsWith('local-')) {
      apply(next)
      setWorkspaceNotice(`Linked “${documentDisplayName(document)}” to ${workspace.name}.`)
      return true
    }
    try {
      const updated = await workspaceRequest<WorkspaceSummary>(`/workspaces/${workspace.id}/linked-document`, {
        method: 'PUT',
        body: JSON.stringify({ document_id: document.id, document_title: documentDisplayName(document) }),
      })
      apply(updated)
      setWorkspaceNotice(`Linked “${documentDisplayName(document)}” to ${workspace.name}.`)
      return true
    } catch (error) {
      setWorkspaceNotice(error instanceof Error ? error.message : 'Could not update the linked document.')
      return false
    }
  }, [activeWorkspace])

  const removeDocuments = useCallback((ids: string[]) => {
    const removeIds = new Set(ids)
    const matches = documents.filter((doc) => removeIds.has(doc.id))
    if (!matches.length) return false
    if (matches.length >= documents.length) {
      setNotice('Keep at least one document in the workspace.')
      return false
    }

    const nextDocuments = documents.filter((doc) => !removeIds.has(doc.id))
    setDocuments(nextDocuments)
    setResolved((current) => Object.fromEntries(Object.entries(current).filter(([documentId]) => !removeIds.has(documentId))))
    if (removeIds.has(selectedId)) {
      const nextSelected = nextDocuments[0]
      setSelectedId(nextSelected.id)
      setActiveFindingId(openFindings(nextSelected, resolved[nextSelected.id])[0]?.id ?? nextSelected.findings[0]?.id ?? null)
    }
    setNotice(`${matches.length} document${matches.length === 1 ? '' : 's'} removed from this workspace.`)
    return true
  }, [documents, resolved, selectedId])

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

  const renameDocument = useCallback((title: string) => {
    const nextTitle = title.trim().replace(/\s+/g, ' ')
    if (!nextTitle) {
      setNotice('Enter a document name before saving.')
      return false
    }
    if (nextTitle === selected.title) return true
    updateDocument({ ...selected, title: nextTitle, version: 'Working copy · renamed' })
    setNotice(`Document renamed to “${nextTitle}”.`)
    return true
  }, [selected, updateDocument])

  const sendMessage = useCallback((text: string, attachment?: string | null) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setMessagesByWorkspace((current) => ({
      ...current,
      [activeMessageWorkspace]: [...(current[activeMessageWorkspace] ?? []), { id: `message-${Date.now()}`, user: 'You (Reviewer)', text: trimmed, time: 'Just now', saved: false, attachment: attachment || undefined }],
    }))
    setDraft('')
  }, [activeMessageWorkspace])

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    setReactionsByWorkspace((current) => {
      const group = current[activeMessageWorkspace] ?? {}
      const list = group[messageId] ?? []
      return { ...current, [activeMessageWorkspace]: { ...group, [messageId]: list.includes(emoji) ? list.filter((item) => item !== emoji) : [...list, emoji] } }
    })
  }, [activeMessageWorkspace])

  const toggleSaved = useCallback((messageId: string) => {
    setMessagesByWorkspace((current) => ({
      ...current,
      [activeMessageWorkspace]: (current[activeMessageWorkspace] ?? []).map((message) => message.id === messageId ? { ...message, saved: !message.saved } : message),
    }))
  }, [activeMessageWorkspace])

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
      // A just-created DynamoDB membership can take a moment to appear in a
      // normal-consistency query. Retain client-created groups until the API
      // reports them, rather than making the sidebar briefly lose the group.
      setWorkspaces((current) => {
        const returned = new Set(next.map((item) => item.id))
        const merged = [...next, ...current.filter((item) => !returned.has(item.id))]
        saveLocalWorkspaces(merged)
        return merged
      })
      const active = activeWorkspaceRef.current
      const target = next.find((item) => item.id === active?.id) ?? active ?? next[0] ?? null
      activeWorkspaceRef.current = target
      setActiveWorkspace(target)
      if (target) setMembers(await workspaceRequest<WorkspaceMember[]>(`/workspaces/${target.id}/members`))
      else setMembers([])
    } catch (error) {
      setWorkspaces((current) => {
        const local = localWorkspaces()
        const merged = [...current, ...local.filter((item) => !current.some((existing) => existing.id === item.id))]
        return merged
      })
      setWorkspaceNotice(error instanceof Error ? error.message : 'Shared workspace is unavailable.')
    }
  }, [])

  const createWorkspace = useCallback(async (name: string): Promise<WorkspaceSummary | null> => {
    if (name.trim().length < 2) {
      setWorkspaceNotice('Use at least 2 characters for the workspace name.')
      return null
    }
    try {
      const workspace = await workspaceRequest<WorkspaceSummary>('/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
      setWorkspaces((current) => {
        const next = [workspace, ...current.filter((item) => item.id !== workspace.id)]
        saveLocalWorkspaces(next)
        return next
      })
      activeWorkspaceRef.current = workspace
      setActiveWorkspace(workspace)
      setMembers([])
      setWorkspaceNotice(`Workspace “${workspace.name}” created.`)
      return workspace
    } catch {
      const workspace: WorkspaceSummary = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        owner_id: 'local',
        created_at: new Date().toISOString(),
        role: 'local',
      }
      setWorkspaces((current) => {
        const next = [workspace, ...current]
        saveLocalWorkspaces(next)
        return next
      })
      activeWorkspaceRef.current = workspace
      setActiveWorkspace(workspace)
      setMembers([])
      setWorkspaceNotice(`Workspace “${workspace.name}” was created on this device. Sign in to invite teammates.`)
      return workspace
    }
  }, [])

  const createInvite = useCallback(async (workspaceId = activeWorkspace?.id): Promise<string | null> => {
    if (!workspaceId) return null
    if (workspaceId.startsWith('local-')) {
      const code = createLocalInviteCode(workspaceId)
      setWorkspaceNotice('A local group code was created. Sign in to create a code that teammates can redeem.')
      return code
    }
    try {
      const invite = await workspaceRequest<{ invite_code: string }>(`/workspaces/${workspaceId}/invites`, { method: 'POST' })
      setWorkspaceNotice('Invite code created. Share it with a signed-in teammate.')
      return invite.invite_code
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not create invite.'); return null }
  }, [activeWorkspace])

  const joinWorkspace = useCallback(async (code: string) => {
    if (!code.trim()) return
    try {
      const workspace = await workspaceRequest<WorkspaceSummary>('/workspaces/join', { method: 'POST', body: JSON.stringify({ invite_code: code.trim() }) })
      setWorkspaces((current) => {
        const next = [workspace, ...current.filter((item) => item.id !== workspace.id)]
        saveLocalWorkspaces(next)
        return next
      })
      activeWorkspaceRef.current = workspace
      setActiveWorkspace(workspace)
      setMembers([])
      setWorkspaceNotice(`Joined “${workspace.name}”.`)
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not join workspace.') }
  }, [])

  const selectWorkspace = useCallback(async (id: string) => {
    const workspace = workspaces.find((item) => item.id === id) ?? null
    activeWorkspaceRef.current = workspace
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
    userEmail, nav, go, documents, selected, selectDocument, openInReview, activeFinding, setActiveFindingId, linkedDocument, canManageLinkedDocument, setLinkedDocument,
    resolved, toggleResolved, resolveAndNext, jurisdiction, setJurisdiction, busyAction, runAction, applyRewrite, editText, renameDocument, removeDocuments,
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
