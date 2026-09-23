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
}

export type Turn = { id: string; role: 'user' | 'assistant'; content: string; local?: boolean }
export type Mode = 'live' | 'guide' | 'unknown'

const MAX_HISTORY = 12

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ conversationId, turns: turns.slice(-40) })) } catch { /* optional */ }
  }, [storageKey, conversationId, turns])

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

  const callAgent = useCallback(async (history: Turn[]): Promise<string | null> => {
    let token = await cognitoGetIdToken().catch(() => null)
    if (!token) { setMode('guide'); setNotice('signed-out'); return null }
    const current = contextRef.current
    const body = JSON.stringify({
      conversation_id: conversationId,
      messages: history.filter((t) => t.id !== 'welcome').slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
      context: { ...current, open_findings: current?.open_findings?.slice(0, 12) },
    })
    const send = (auth: string) => fetch(`${apiBase()}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body,
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

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || busyRef.current) return
    busyRef.current = true
    setBusy(true)

    const history = [...turnsRef.current, { id: newId(), role: 'user' as const, content: text }]
    turnsRef.current = history
    setTurns(history)
    setInput('')

    let reply: string | null = null
    try {
      reply = await callAgent(history)
    } catch {
      setMode('guide')
      setNotice('The AI agent is unavailable right now, so I’m answering from the built-in guide.')
    }

    const answered = [...turnsRef.current, {
      id: newId(),
      role: 'assistant' as const,
      content: reply ?? fallbackRef.current(text),
      local: !reply,
    }]
    turnsRef.current = answered
    setTurns(answered)
    busyRef.current = false
    setBusy(false)
  }, [callAgent])

  const reset = useCallback(() => {
    setConversationId(newId())
    turnsRef.current = [welcome]
    setTurns([welcome])
    setNotice('')
    setMode('unknown')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting])

  const status = mode === 'live' ? 'AI agent · online' : mode === 'guide' ? 'Guide mode' : 'Here to help'

  return { turns, input, setInput, busy, mode, notice, ask, reset, status, conversationId }
}
