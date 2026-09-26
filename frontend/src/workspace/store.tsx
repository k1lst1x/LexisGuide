/* Workspace state: documents, the active review, resolutions, collaboration,
   and the actions every view shares. Views read it with useWorkspace(). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  LAST_SECTION_KEY, MESSAGE_STORAGE_KEY, cleanExtractedText, defaultTasks, defaultWorkspaceMessages, documentDisplayName,
  documentSnapshot, extractDocumentText, fileTitle, normalizeSeverity, openFindings, sampleDocs,
  type Finding, type MessageMention, type MessageReaction, type NavItem, type SampleDoc, type SharedDocumentSnapshot, type WorkspaceMember, type WorkspaceMessage, type WorkspaceSummary, type WorkspaceTask,
} from './data'
import { reviewNewDocument, runDocumentAction, workspaceRequest, type SharedWorkspaceMessage } from './api'
import { recordChange, recordEdit, sha256Hex } from './ledger'
import { findRewriteRange } from './rewrite'
import { useSavedWorkspace } from './useSavedWorkspace'

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

function displayMessageTime(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function sharedMessage(message: SharedWorkspaceMessage): WorkspaceMessage {
  return {
    id: message.id,
    user: message.user,
    authorId: message.author_id,
    authorEmail: message.author_email,
    text: message.text,
    time: displayMessageTime(message.created_at),
    createdAt: message.created_at,
    attachment: message.attachment || undefined,
    attachmentTitle: message.attachment_title || undefined,
    mentions: message.mentions ?? [],
    reactions: message.reactions ?? [],
    saved: Boolean(message.saved),
  }
}

/** Toggle this person's emoji on a message's reaction list. */
function toggledReactions(reactions: MessageReaction[] = [], emoji: string, name: string): MessageReaction[] {
  const existing = reactions.find((item) => item.emoji === emoji)
  if (!existing) return [...reactions, { emoji, count: 1, names: [name], mine: true }]
  if (existing.mine) {
    return reactions
      .map((item) => (item.emoji === emoji ? { ...item, count: item.count - 1, mine: false, names: item.names.filter((person) => person !== name) } : item))
      .filter((item) => item.count > 0)
  }
  return reactions.map((item) => (item.emoji === emoji ? { ...item, count: item.count + 1, mine: true, names: [...item.names, name] } : item))
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
  // Do not recreate a cleared account's sample conversation in storage just by
  // mounting the dashboard. Persist once a person actually sends or changes a
  // message, while continuing to retain an existing conversation on reload.
  const messagesWereStored = useRef(window.localStorage.getItem(MESSAGE_STORAGE_KEY) !== null)
  const messagesChanged = useRef(false)
  const [tasks, setTasks] = useState<WorkspaceTask[]>(defaultTasks)
  // Documents and where the person left off live on the server, so a refresh
  // or another device opens the workspace as it was.
  const { restoring, saveStatus } = useSavedWorkspace({
    enabled: Boolean(userEmail),
    documents, setDocuments, resolved, setResolved, selectedId, setSelectedId,
    jurisdiction, setJurisdiction, tasks, setTasks,
  })
  const [draft, setDraft] = useState('')
  const [messageTab, setMessageTab] = useState<'chat' | 'files' | 'tasks'>('chat')
  // Prevent a double click or overlapping Enter/submit event from creating
  // two copies of the same local group message before React clears the draft.
  const lastMessageSend = useRef<{ key: string; at: number } | null>(null)

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>(localWorkspaces)
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(null)
  const [activeChannelId, setActiveChannelId] = useState('general')
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
  const activeMessageWorkspace = activeWorkspace
    ? `${activeWorkspace.id}:${activeChannelId}`
    : PERSONAL_WORKSPACE_ID
  const comments = messagesByWorkspace[activeMessageWorkspace] ?? []
  const activeFinding = selected.findings.find((finding) => finding.id === activeFindingId) ?? null
  const isDemo = !documents.some((doc) => doc.id.startsWith('upload-'))

  useEffect(() => { window.localStorage.setItem(LAST_SECTION_KEY, nav) }, [nav])
  useEffect(() => {
    if (messagesWereStored.current || messagesChanged.current) {
      window.localStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(messagesByWorkspace))
    }
  }, [messagesByWorkspace])
  useEffect(() => { window.localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved)) }, [resolved])
  useEffect(() => { activeWorkspaceRef.current = activeWorkspace }, [activeWorkspace])
  useEffect(() => {
    const workspace = activeWorkspace
    if (!workspace || workspace.id.startsWith('local-') || !userEmail) return
    let cancelled = false
    const refresh = async () => {
      try {
        const remote = await workspaceRequest<SharedWorkspaceMessage[]>(
          `/workspaces/${workspace.id}/messages?channel_id=${encodeURIComponent(activeChannelId)}`
        )
        if (cancelled) return
        const received = remote.map(sharedMessage)
        setMessagesByWorkspace((current) => {
          const optimistic = (current[activeMessageWorkspace] ?? []).filter((message) => message.id.startsWith('local-message-'))
          return { ...current, [activeMessageWorkspace]: [...received, ...optimistic] }
        })
      } catch {
        // The local copy remains visible while a connection is unavailable.
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 4_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [activeWorkspace, activeChannelId, activeMessageWorkspace, userEmail])
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
        hash = await sha256Hex(text)
      } else {
        text = cleanExtractedText(input.text)
        if (!text) throw new Error('Paste the document text to review it.')
        title = input.title.trim() || 'Pasted document'
        type = 'Pasted document'
        id = `upload-pasted-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${text.length}`
        hash = await sha256Hex(text)
      }
      setAddStage('checking')
      setAddMessage(`Checking ${title} for unclear or risky terms…`)
      const reviewed = await reviewNewDocument({ id, title, type, text, hash, jurisdiction })
      setAddStage('scoring')
      setDocuments((current) => [reviewed, ...current.filter((doc) => doc.id !== reviewed.id)])
      setSelectedId(reviewed.id)
      setActiveFindingId(openFindings(reviewed)[0]?.id ?? reviewed.findings[0]?.id ?? null)
      void recordChange({ documentId: reviewed.id, kind: 'created', text: reviewed.text, title })
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
    const targetFinding = action === 'rewrite' ? activeFinding : null
    if (action === 'rewrite' && !targetFinding?.evidence) {
      setNotice('Select a highlighted finding before drafting a targeted revision.')
      return
    }
    setBusyAction(action)
    setNotice(action === 'rewrite' ? 'Preparing a proposed revision for this finding…' : action === 'negotiate' ? 'Preparing negotiation points…' : 'Re-checking the document…')
    try {
      // A rewrite is intentionally sent as just the selected evidence, not the
      // whole document. The returned draft is attached to that finding, then
      // the person can apply it to their working copy after reviewing it.
      const actionDocument = targetFinding ? { ...selected, text: targetFinding.evidence, findings: [targetFinding] } : selected
      const updated = await runDocumentAction(actionDocument, action, jurisdiction)
      if (targetFinding) {
        const draft = updated.findings.find((finding) => finding.suggestedRewrite)?.suggestedRewrite
        if (!draft) throw new Error('The AI did not return replacement wording for this finding. Your document is unchanged.')
        updateDocument({
          ...selected,
          findings: selected.findings.map((finding) => finding.id === targetFinding.id ? { ...finding, suggestedRewrite: draft } : finding),
        })
        setActiveFindingId(targetFinding.id)
        setNotice('A targeted draft is ready. Review it, then choose Apply to working copy when you are ready.')
      } else {
        updateDocument(updated)
        void recordChange({ documentId: updated.id, kind: 'reviewed', text: updated.text, title: updated.title })
        setActiveFindingId(updated.findings[0]?.id ?? null)
        setNotice(`${action === 'negotiate' ? 'Negotiation points' : 'Updated review'} ready. Nothing was applied automatically.`)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The AI action failed. Your document is unchanged.')
    } finally {
      setBusyAction(null)
    }
  }, [activeFinding, selected, jurisdiction, updateDocument])

  const applyRewrite = useCallback((finding: Finding) => {
    if (!finding.suggestedRewrite || !finding.evidence) {
      setNotice('This suggestion is missing the original text needed to apply it.')
      return
    }
    const range = findRewriteRange(selected.text, finding.evidence)
    if (!range) {
      setNotice('This suggestion could not be matched to the document text, so nothing was changed.')
      return
    }
    const text = `${selected.text.slice(0, range.start)}${finding.suggestedRewrite}${selected.text.slice(range.end)}`
    updateDocument({ ...selected, text, version: 'Working copy · edit applied' })
    void recordChange({ documentId: selected.id, kind: 'rewrite_applied', text, title: selected.title })
    setResolved((current) => ({ ...current, [selected.id]: [...new Set([...(current[selected.id] ?? []), finding.id])] }))
    setNotice('The suggested wording was applied to a working copy. Review it before sharing.')
  }, [selected, updateDocument])

  const editText = useCallback((text: string) => {
    updateDocument({ ...selected, text, version: 'Working copy · edited' })
    recordEdit({ documentId: selected.id, text, title: selected.title })
  }, [selected, updateDocument])

  /** Edit any document's text, e.g. from the shared-document panel in Messages. */
  const editDocumentText = useCallback((documentId: string, text: string) => {
    const target = documents.find((doc) => doc.id === documentId)
    if (!target || target.text === text) return
    updateDocument({ ...target, text, version: 'Working copy · edited' })
    recordEdit({ documentId: target.id, text, title: target.title })
  }, [documents, updateDocument])

  const renameDocument = useCallback((title: string) => {
    const nextTitle = title.trim().replace(/\s+/g, ' ')
    if (!nextTitle) {
      setNotice('Enter a document name before saving.')
      return false
    }
    if (nextTitle === selected.title) return true
    updateDocument({ ...selected, title: nextTitle, version: 'Working copy · renamed' })
    void recordChange({ documentId: selected.id, kind: 'renamed', text: selected.text, title: nextTitle })
    setNotice(`Document renamed to “${nextTitle}”.`)
    return true
  }, [selected, updateDocument])

  const sendMessage = useCallback(async (text: string, attachment?: string | null, mentions: MessageMention[] = []) => {
    const trimmed = text.trim()
    if (!trimmed) return
    // Documents attached or mentioned are shared with the message, so every
    // member can open them, not only the sender.
    const sharedIds = [...new Set([attachment, ...mentions.filter((item) => item.type === 'document').map((item) => item.id)].filter(Boolean))] as string[]
    const documentsToShare = sharedIds.map((id) => documents.find((doc) => doc.id === id)).filter((doc): doc is SampleDoc => Boolean(doc)).slice(0, 3).map(documentSnapshot)
    const attachmentTitle = attachment ? documents.find((doc) => doc.id === attachment)?.title : undefined
    const now = Date.now()
    const key = `${activeMessageWorkspace}:${trimmed}:${attachment ?? ''}`
    if (lastMessageSend.current?.key === key && now - lastMessageSend.current.at < 1_000) return
    lastMessageSend.current = { key, at: now }
    const workspace = activeWorkspaceRef.current
    const localMessage: WorkspaceMessage = {
      id: `local-message-${now}-${Math.random().toString(36).slice(2, 8)}`,
      user: 'You (Reviewer)',
      authorEmail: userEmail?.toLowerCase(),
      text: trimmed,
      time: 'Just now',
      createdAt: new Date(now).toISOString(),
      saved: false,
      attachment: attachment || undefined,
      attachmentTitle,
      mentions,
      reactions: [],
    }
    messagesChanged.current = true
    setMessagesByWorkspace((current) => ({
      ...current,
      [activeMessageWorkspace]: [...(current[activeMessageWorkspace] ?? []), localMessage],
    }))
    setDraft('')
    if (!workspace || workspace.id.startsWith('local-')) return
    try {
      const created = await workspaceRequest<SharedWorkspaceMessage>(`/workspaces/${workspace.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: trimmed, attachment: attachment || undefined, channel_id: activeChannelId, mentions, documents: documentsToShare }),
      })
      const persisted = sharedMessage(created)
      setMessagesByWorkspace((current) => ({
        ...current,
        [activeMessageWorkspace]: (current[activeMessageWorkspace] ?? []).map((message) => message.id === localMessage.id ? persisted : message),
      }))
    } catch (error) {
      setMessagesByWorkspace((current) => ({
        ...current,
        [activeMessageWorkspace]: (current[activeMessageWorkspace] ?? []).filter((message) => message.id !== localMessage.id),
      }))
      setWorkspaceNotice(error instanceof Error ? error.message : 'Message could not be sent.')
    }
  }, [activeChannelId, activeMessageWorkspace, documents, userEmail])

  /** Replace one message in the open conversation. */
  const patchMessage = useCallback((messageId: string, change: (message: WorkspaceMessage) => WorkspaceMessage) => {
    messagesChanged.current = true
    setMessagesByWorkspace((current) => ({
      ...current,
      [activeMessageWorkspace]: (current[activeMessageWorkspace] ?? []).map((message) => (message.id === messageId ? change(message) : message)),
    }))
  }, [activeMessageWorkspace])

  /** React with any emoji, or take the reaction back. Shown at once, then saved. */
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const name = userEmail ? userEmail.split('@')[0] : 'You'
    patchMessage(messageId, (message) => ({ ...message, reactions: toggledReactions(message.reactions, emoji, name) }))
    const workspace = activeWorkspaceRef.current
    if (!workspace || workspace.id.startsWith('local-') || messageId.startsWith('local-message-')) return
    try {
      const updated = await workspaceRequest<SharedWorkspaceMessage>(`/workspaces/${workspace.id}/messages/${encodeURIComponent(messageId)}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji, channel_id: activeChannelId }),
      })
      patchMessage(messageId, (message) => ({ ...message, reactions: updated.reactions ?? [] }))
    } catch (error) {
      // Undo the optimistic change.
      patchMessage(messageId, (message) => ({ ...message, reactions: toggledReactions(message.reactions, emoji, name) }))
      setWorkspaceNotice(error instanceof Error ? error.message : 'The reaction could not be saved.')
    }
  }, [activeChannelId, patchMessage, userEmail])

  /** Delete a message: the author's own, or any message for a workspace admin. */
  const deleteMessage = useCallback(async (messageId: string) => {
    const workspace = activeWorkspaceRef.current
    if (workspace && !workspace.id.startsWith('local-') && !messageId.startsWith('local-message-')) {
      try {
        await workspaceRequest<void>(
          `/workspaces/${workspace.id}/messages/${encodeURIComponent(messageId)}?channel_id=${encodeURIComponent(activeChannelId)}`,
          { method: 'DELETE' },
        )
      } catch (error) {
        setWorkspaceNotice(error instanceof Error ? error.message : 'The message could not be deleted.')
        return
      }
    }
    messagesChanged.current = true
    setMessagesByWorkspace((current) => ({
      ...current,
      [activeMessageWorkspace]: (current[activeMessageWorkspace] ?? []).filter((message) => message.id !== messageId),
    }))
  }, [activeChannelId, activeMessageWorkspace])

  /** Save a message to find it later; kept per person in the database. */
  const toggleSaved = useCallback(async (messageId: string) => {
    const current = (messagesByWorkspace[activeMessageWorkspace] ?? []).find((message) => message.id === messageId)
    const next = !current?.saved
    patchMessage(messageId, (message) => ({ ...message, saved: next }))
    const workspace = activeWorkspaceRef.current
    if (!workspace || workspace.id.startsWith('local-') || messageId.startsWith('local-message-')) return
    try {
      await workspaceRequest<void>(`/workspaces/${workspace.id}/messages/${encodeURIComponent(messageId)}/saved?channel_id=${encodeURIComponent(activeChannelId)}`, { method: next ? 'PUT' : 'DELETE' })
    } catch (error) {
      patchMessage(messageId, (message) => ({ ...message, saved: !next }))
      setWorkspaceNotice(error instanceof Error ? error.message : 'The message could not be saved.')
    }
  }, [activeChannelId, activeMessageWorkspace, messagesByWorkspace, patchMessage])

  /** Add a shared document to this person's workspace, or refresh their copy, and open it in Review. */
  const importSharedDocument = useCallback((shared: SharedDocumentSnapshot, replace = false) => {
    const existing = documents.find((doc) => doc.id === shared.id)
    if (existing && !replace) {
      openInReview(existing)
      return
    }
    const base = existing ?? sampleDocs[0]
    const imported: SampleDoc = {
      ...base,
      id: shared.id,
      title: shared.title,
      type: shared.type || base.type,
      agency: shared.type || base.agency,
      text: shared.text,
      score: shared.score ?? base.score,
      version: 'Shared in Messages',
      status: 'Shared for review',
      date: new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
      hash: existing?.hash ?? '',
      findings: shared.findings.map((finding, index) => ({
        id: `shared-${index}`,
        title: finding.title,
        severity: normalizeSeverity(finding.severity),
        category: finding.category || 'Shared review',
        explanation: finding.explanation,
        evidence: finding.evidence,
        rule: finding.explanation,
      })),
      summary: undefined,
      nextSteps: undefined,
      sources: undefined,
    }
    setDocuments((current) => (current.some((doc) => doc.id === imported.id) ? current.map((doc) => (doc.id === imported.id ? imported : doc)) : [imported, ...current]))
    setSelectedId(imported.id)
    setActiveFindingId(imported.findings[0]?.id ?? null)
    setNavState('linter')
  }, [documents, openInReview])

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
      // Only on-device groups and ones created in the last two minutes are kept
      // when missing; anything else was deleted or left and must disappear.
      const recent = Date.now() - 2 * 60_000
      const keep = (item: WorkspaceSummary) => item.id.startsWith('local-') || Date.parse(item.created_at) > recent
      setWorkspaces((current) => {
        const returned = new Set(next.map((item) => item.id))
        const merged = [...next, ...current.filter((item) => !returned.has(item.id) && keep(item))]
        saveLocalWorkspaces(merged)
        return merged
      })
      const active = activeWorkspaceRef.current
      const target = next.find((item) => item.id === active?.id) ?? (active && keep(active) ? active : null) ?? next[0] ?? null
      if (target?.id !== active?.id) setActiveChannelId('general')
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
      setActiveChannelId('general')
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
      setActiveChannelId('general')
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
      setActiveChannelId('general')
      setMembers([])
      setWorkspaceNotice(`Joined “${workspace.name}”.`)
    } catch (error) { setWorkspaceNotice(error instanceof Error ? error.message : 'Could not join workspace.') }
  }, [])

  /** Re-read the active workspace's roster, e.g. after a role change. */
  const refreshMembers = useCallback(async () => {
    const workspace = activeWorkspaceRef.current
    if (!workspace || workspace.id.startsWith('local-')) return
    try { setMembers(await workspaceRequest<WorkspaceMember[]>(`/workspaces/${workspace.id}/members`)) } catch { /* keep the last roster */ }
  }, [])

  /** Drop a workspace the person deleted or left. */
  const forgetWorkspace = useCallback((id: string) => {
    setWorkspaces((current) => {
      const next = current.filter((item) => item.id !== id)
      saveLocalWorkspaces(next)
      return next
    })
    if (activeWorkspaceRef.current?.id === id) {
      activeWorkspaceRef.current = null
      setActiveWorkspace(null)
      setActiveChannelId('general')
      setMembers([])
    }
  }, [])

  const selectWorkspace = useCallback(async (id: string) => {
    const workspace = workspaces.find((item) => item.id === id) ?? null
    activeWorkspaceRef.current = workspace
    setActiveWorkspace(workspace)
    setActiveChannelId('general')
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
    restoring, saveStatus,
    resolved, toggleResolved, resolveAndNext, jurisdiction, setJurisdiction, busyAction, runAction, applyRewrite, editText, editDocumentText, renameDocument, removeDocuments,
    notice, setNotice, addOpen, setAddOpen, addStage, setAddStage, addMessage, addDocument, isDemo, stats,
    comments, toggleReaction, toggleSaved, deleteMessage, sendMessage, importSharedDocument, draft, setDraft, composerFocus, focusComposer, tasks, addTask, toggleTask,
    messageTab, setMessageTab, discuss,
    workspaces, activeWorkspace, activeChannelId, setActiveChannelId, members, refreshMembers, forgetWorkspace, workspaceNotice, refreshWorkspaces, createWorkspace, createInvite, joinWorkspace, selectWorkspace,
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
