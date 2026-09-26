/* The conversation itself: history, persistence, and the call to the
   LexisGuideAssistant agent through /api/v1/chat. Kept apart from any layout so
   the popup panel and the assistant page can be shaped differently while
   answering identically. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { cognitoGetIdToken } from '../aws'
import { apiBase, fetchConversation, saveConversation } from '../workspace/api'

export type ChatContext = {
  page?: string
  document_title?: string
  document_type?: string
  document_score?: number
  document_excerpt?: string
  open_findings?: string[]
  current_finding?: string
  jurisdiction?: string
  /** An API-verified workspace boundary for a shared conversation. */
  workspace_id?: string
}

/** A file shown on a message: its name and size, never its text. */
export type AttachmentMeta = { name: string; kind: string; chars: number }
/** A file attached in this conversation, with the text read from it. */
export type ChatFile = AttachmentMeta & { id: string; text: string; truncated?: boolean }

export type Turn = { id: string; role: 'user' | 'assistant'; content: string; local?: boolean; attachments?: AttachmentMeta[] }
export type Mode = 'live' | 'guide' | 'unknown'

const MAX_HISTORY = 12
/** The longest single message; longer text belongs in an attached file. */
export const MAX_MESSAGE_CHARS = 20_000
const MAX_FILE_CHARS = 60_000
const MAX_FILES_CHARS = 120_000
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_STAGED = 5

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFiles(key: string): ChatFile[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${key}:files`) || '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((file): file is ChatFile => typeof file?.name === 'string' && typeof file?.text === 'string') : []
  } catch { return [] }
}

/** Keep the newest files whose text fits the model's attachment budget. */
function withinBudget(files: ChatFile[]) {
  let budget = MAX_FILES_CHARS
  return files.filter((file) => {
    if (budget <= 0) return false
    budget -= file.text.length
    return true
  })
}

const meta = ({ name, kind, chars }: ChatFile): AttachmentMeta => ({ name, kind, chars })

function load(key: string): { conversationId: string; turns: Turn[] } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null')
    if (parsed && typeof parsed.conversationId === 'string' && Array.isArray(parsed.turns)
      && parsed.turns.every((t: Turn) => typeof t?.content === 'string' && (t.role === 'user' || t.role === 'assistant'))) return parsed
  } catch { /* start fresh */ }
  return null
}

export type AssistantChatOptions = {
  storageKey: string
  /** Also keep this conversation in the signed-in user's own server history. */
  persist?: boolean
  context?: ChatContext
  greeting?: string
  /** Local answer used when the live agent is unavailable. */
  fallback: (question: string) => string
}

export function useAssistantChat({ storageKey, context, greeting, fallback, persist = false }: AssistantChatOptions) {
  const [saved] = useState(() => load(storageKey))
  const [conversationId, setConversationId] = useState(saved?.conversationId ?? newId())
  const welcome: Turn = {
    id: 'welcome',
    role: 'assistant',
    local: true,
    content: greeting ?? 'Hi! I’m the LexisGuide assistant. Ask me about a notice or agreement, a legal term, or how to use LexisGuide.',
  }
  const [turns, setTurns] = useState<Turn[]>(saved?.turns?.length ? saved.turns : [welcome])
  // `ask` must read the history synchronously to send it, and a state updater
  // has not run by then. This mirror is the value it reads.
  const turnsRef = useRef(turns)
  const busyRef = useRef(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('unknown')
  const [notice, setNotice] = useState('')
  // Files waiting to go with the next question, and files already shared in
  // this conversation, which stay available for follow-up questions.
  const [staged, setStaged] = useState<ChatFile[]>([])
  const [library, setLibrary] = useState<ChatFile[]>(() => loadFiles(storageKey))
  const [reading, setReading] = useState(0)
  const libraryRef = useRef(library)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ conversationId, turns: turns.slice(-40) })) } catch { /* optional */ }
  }, [storageKey, conversationId, turns])
  useEffect(() => {
    libraryRef.current = library
    try { window.localStorage.setItem(`${storageKey}:files`, JSON.stringify(library)) } catch { /* optional */ }
  }, [storageKey, library])

  // The server copy is the one that follows the person between devices. Local
  // storage stays as an offline cache and as what shows before this resolves.
  const restored = useRef(false)
  useEffect(() => {
    if (!persist || restored.current) return
    restored.current = true
    let cancelled = false
    void fetchConversation(conversationId).then((stored) => {
      if (cancelled || !stored?.length) return
      // Only adopt the server copy when this browser has nothing of its own,
      // so a conversation in progress is never replaced mid-sentence.
      if (turnsRef.current.some((turn) => turn.id !== 'welcome')) return
      turnsRef.current = stored as Turn[]
      setTurns(stored as Turn[])
    })
    return () => { cancelled = true }
  }, [persist, conversationId])

  // Write back after the exchange settles rather than on every keystroke.
  useEffect(() => {
    if (!persist || busyRef.current) return
    const asked = turns.filter((turn) => turn.id !== 'welcome')
    if (!asked.length) return
    const title = asked.find((turn) => turn.role === 'user')?.content.slice(0, 120) ?? ''
    const timer = window.setTimeout(() => {
      void saveConversation(conversationId, turns.slice(-60), title)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [persist, conversationId, turns])

  // The context and fallback are rebuilt on every render of the caller; holding
  // them in refs keeps `ask` stable so effects do not re-fire per keystroke.
  const contextRef = useRef(context)
  const fallbackRef = useRef(fallback)
  useEffect(() => { contextRef.current = context; fallbackRef.current = fallback })

  const callAgent = useCallback(async (history: Turn[], files: ChatFile[], signal: AbortSignal): Promise<string | null> => {
    let token = await cognitoGetIdToken().catch(() => null)
    if (!token) { setMode('guide'); setNotice('signed-out'); return null }
    const current = contextRef.current
    const body = JSON.stringify({
      conversation_id: conversationId,
      messages: history.filter((t) => t.id !== 'welcome').slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content: content.slice(0, MAX_MESSAGE_CHARS) })),
      context: {
        ...current,
        open_findings: current?.open_findings?.slice(0, 12),
        attachments: files.map(({ name, kind, text }) => ({ name, kind, text })),
      },
    })
    const send = (auth: string) => fetch(`${apiBase()}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body,
      signal,
    })
    let response = await send(token)
    if (response.status === 401) {
      token = await cognitoGetIdToken(true).catch(() => null)
      if (!token) { setMode('guide'); setNotice('signed-out'); return null }
      response = await send(token)
    }
    if (response.status === 429) { setNotice('You’re sending messages quickly. Please wait a minute and try again.'); return null }
    if (!response.ok) throw new Error(`chat ${response.status}`)
    const data = await response.json() as { reply?: string }
    setMode('live')
    setNotice('')
    return data.reply?.trim() || null
  }, [conversationId])

  /** Answer the last question in `history`, with the files it can see. */
  const respond = useCallback(async (history: Turn[], question: string, files: ChatFile[]) => {
    busyRef.current = true
    setBusy(true)
    turnsRef.current = history
    setTurns(history)
    const controller = new AbortController()
    abortRef.current = controller

    let reply: string | null = null
    let stopped = false
    try {
      reply = await callAgent(history, files, controller.signal)
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        stopped = true
      } else {
        setMode('guide')
        setNotice('The AI agent is unavailable right now, so I’m answering from the built-in guide.')
      }
    }
    abortRef.current = null

    if (!stopped) {
      const answered = [...turnsRef.current, {
        id: newId(),
        role: 'assistant' as const,
        content: reply ?? fallbackRef.current(question),
        local: !reply,
      }]
      turnsRef.current = answered
      setTurns(answered)
    } else {
      setNotice('Stopped. You can regenerate the answer or ask something else.')
    }
    busyRef.current = false
    setBusy(false)
  }, [callAgent])

  const ask = useCallback(async (question: string) => {
    const sending = staged
    // A file on its own is a question too.
    const text = question.trim() || (sending.length ? `Please review the attached file${sending.length > 1 ? 's' : ''} and summarise what matters.` : '')
    if (!text || busyRef.current) return
    setInput('')
    setStaged([])
    // Files shared now stay available for the rest of the conversation.
    const files = withinBudget([...sending, ...libraryRef.current.filter((file) => !sending.some((item) => item.name === file.name))])
    if (sending.length) setLibrary(files)
    const turn: Turn = { id: newId(), role: 'user', content: text.slice(0, MAX_MESSAGE_CHARS), ...(sending.length ? { attachments: sending.map(meta) } : {}) }
    await respond([...turnsRef.current, turn], text, files)
  }, [respond, staged])

  /** Ask for a fresh answer to the last question. */
  const regenerate = useCallback(async () => {
    if (busyRef.current) return
    const history = [...turnsRef.current]
    while (history.length && history[history.length - 1].role === 'assistant') history.pop()
    const last = history[history.length - 1]
    if (!last || last.role !== 'user') return
    setNotice('')
    await respond(history, last.content, withinBudget(libraryRef.current))
  }, [respond])

  /** Stop waiting for the answer being written. */
  const stop = useCallback(() => { abortRef.current?.abort() }, [])

  /** Read files in the browser and hold them for the next question. */
  const attachFiles = useCallback(async (files: File[]) => {
    const room = MAX_STAGED - staged.length
    if (room <= 0) { setNotice(`You can attach up to ${MAX_STAGED} files at a time.`); return }
    const picked = files.slice(0, room)
    setReading((count) => count + picked.length)
    const { extractDocumentText } = await import('../workspace/data')
    for (const file of picked) {
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 15 MB. Attach a smaller file or paste the part you need.`)
        const extracted = await extractDocumentText(file)
        const text = extracted.text.slice(0, MAX_FILE_CHARS)
        setStaged((current) => [...current, { id: newId(), name: file.name, kind: extracted.type, chars: extracted.text.length, text, truncated: extracted.text.length > MAX_FILE_CHARS }])
      } catch (error) {
        setNotice(error instanceof Error ? error.message : `${file.name} could not be read.`)
      } finally {
        setReading((count) => count - 1)
      }
    }
    if (files.length > room) setNotice(`Only the first ${room} file${room === 1 ? '' : 's'} were attached. You can attach up to ${MAX_STAGED} at a time.`)
  }, [staged.length])

  /** Attach text the app already has, such as a document in the workspace. */
  const attachText = useCallback((name: string, kind: string, text: string) => {
    if (!text.trim()) return
    if (staged.length >= MAX_STAGED) { setNotice(`You can attach up to ${MAX_STAGED} files at a time.`); return }
    if (staged.some((file) => file.name === name)) return
    setStaged((current) => [...current, { id: newId(), name, kind, chars: text.length, text: text.slice(0, MAX_FILE_CHARS), truncated: text.length > MAX_FILE_CHARS }])
  }, [staged])

  const unstage = useCallback((id: string) => setStaged((current) => current.filter((file) => file.id !== id)), [])

  /** Save the conversation as a Markdown file. */
  const download = useCallback(() => {
    const lines = turnsRef.current.filter((turn) => turn.id !== 'welcome').map((turn) => {
      const who = turn.role === 'user' ? '**You**' : '**LexisGuide**'
      const files = turn.attachments?.length ? `\n\n_Attached: ${turn.attachments.map((file) => file.name).join(', ')}_` : ''
      return `${who}\n\n${turn.content}${files}`
    })
    const text = `# LexisGuide conversation\n\n${lines.join('\n\n---\n\n')}\n\n_General information, not legal advice._\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `lexisguide-conversation-${new Date().toISOString().slice(0, 10)}.md` })
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setConversationId(newId())
    turnsRef.current = [welcome]
    setTurns([welcome])
    setStaged([])
    setLibrary([])
    setNotice('')
    setMode('unknown')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting])

  const status = mode === 'live' ? 'AI agent · online' : mode === 'guide' ? 'Guide mode' : 'Here to help'

  const canRegenerate = !busy && turns.length > 1 && turns[turns.length - 1].role === 'assistant' && turns[turns.length - 1].id !== 'welcome'

  return {
    turns, input, setInput, busy, mode, notice, ask, reset, status, conversationId,
    staged, library, reading, attachFiles, attachText, unstage, stop, regenerate, canRegenerate, download,
  }
}
