/* Channel state for the Messages page: the list for the active workspace,
   kept current by polling, with unread marks and every channel action. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { workspaceRequest } from './api'
import type { WorkspaceChannel, WorkspaceMember, WorkspaceSummary } from './data'

const READ_KEY = 'lexisguide:channel-read'
const REFRESH_MS = 10_000
export const GENERAL_ID = 'general'

const LOCAL_GENERAL: WorkspaceChannel = {
  id: GENERAL_ID,
  name: 'General',
  description: 'Your own notes and drafts on this device.',
  created_at: '',
  member_count: 1,
  is_member: true,
}

/** Slack-style names: lower case, words joined by dashes. */
export function channelSlug(value: string) {
  return value.trim().replace(/^#+/, '').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

function readMarks(): Record<string, string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READ_KEY) || '{}') as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string> : {}
  } catch { return {} }
}

function saveMarks(marks: Record<string, string>) {
  try { window.localStorage.setItem(READ_KEY, JSON.stringify(marks)) } catch { /* unread marks are a convenience */ }
}

type Options = {
  workspace: WorkspaceSummary | null
  activeChannelId: string
  setActiveChannelId: (id: string) => void
  notify: (message: string) => void
}

/** The channel list for the active workspace, kept current. */
export function useChannels({ workspace, activeChannelId, setActiveChannelId, notify }: Options) {
  const shared = Boolean(workspace && !workspace.id.startsWith('local-'))
  const [remote, setRemote] = useState<{ workspaceId: string; channels: WorkspaceChannel[] } | null>(null)
  const [local, setLocal] = useState<Record<string, WorkspaceChannel[]>>({})
  const [marks, setMarks] = useState(readMarks)
  const [members, setMembers] = useState<{ key: string; people: WorkspaceMember[] } | null>(null)
  const [version, setVersion] = useState(0)
  const localKey = workspace?.id ?? 'personal'
  const channels = useMemo(() => shared
    ? (remote && remote.workspaceId === workspace?.id ? remote.channels : [LOCAL_GENERAL])
    : [LOCAL_GENERAL, ...(local[localKey] ?? [])], [shared, remote, workspace, local, localKey])

  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  const activeRef = useRef(activeChannelId)
  useEffect(() => { activeRef.current = activeChannelId }, [activeChannelId])

  /** Everything up to now in these channels has been seen. */
  const markRead = useCallback((workspaceId: string, channelIds: string[]) => {
    const now = new Date().toISOString()
    setMarks((current) => {
      const updated = { ...current }
      for (const id of channelIds) updated[`${workspaceId}:${id}`] = now
      saveMarks(updated)
      return updated
    })
  }, [])

  useEffect(() => {
    if (!shared || !workspace) return
    let live = true
    const load = () => workspaceRequest<WorkspaceChannel[]>(`/workspaces/${workspace.id}/channels`)
      .then((next) => {
        if (!live) return
        setRemote({ workspaceId: workspace.id, channels: next })
        // Channels seen for the first time start as read, not as a wall of
        // unread marks; the open channel is read as its messages arrive.
        setMarks((current) => {
          const updated = { ...current }
          for (const channel of next) {
            const key = `${workspace.id}:${channel.id}`
            if (updated[key] === undefined || channel.id === activeRef.current) updated[key] = channel.last_message_at || ''
          }
          saveMarks(updated)
          return updated
        })
        // The open channel was deleted elsewhere: fall back to General.
        if (!next.some((channel) => channel.id === activeRef.current)) setActiveChannelId(GENERAL_ID)
      })
      .catch(() => { /* General stays usable while offline */ })
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, REFRESH_MS)
    return () => { live = false; window.clearInterval(timer) }
  }, [shared, workspace, version, setActiveChannelId])

  const active = channels.find((channel) => channel.id === activeChannelId) ?? channels[0]

  /** Open a channel; the one being left is read up to this moment. */
  const select = (id: string) => {
    if (workspace && id !== activeChannelId) markRead(workspace.id, [activeChannelId, id])
    setActiveChannelId(id)
  }

  const isUnread = (channel: WorkspaceChannel) => Boolean(
    workspace && channel.is_member && channel.id !== active?.id && channel.last_message_at
    && channel.last_message_at > (marks[`${workspace.id}:${channel.id}`] || ''))

  const replace = (channel: WorkspaceChannel) => setRemote((current) => current && ({
    ...current,
    channels: current.channels.some((item) => item.id === channel.id)
      ? current.channels.map((item) => (item.id === channel.id ? channel : item))
      : [...current.channels, channel],
  }))

  const create = async (name: string, description: string): Promise<WorkspaceChannel | null> => {
    if (!shared || !workspace) {
      const exists = channels.some((channel) => channel.name.toLowerCase() === name.toLowerCase())
      if (exists) throw new Error(`#${name} already exists.`)
      const channel: WorkspaceChannel = { id: `local-${Date.now()}`, name, description, created_at: new Date().toISOString(), member_count: 1, is_member: true, created_by_name: 'You' }
      setLocal((current) => ({ ...current, [localKey]: [...(current[localKey] ?? []), channel] }))
      return channel
    }
    const channel = await workspaceRequest<WorkspaceChannel>(`/workspaces/${workspace.id}/channels`, { method: 'POST', body: JSON.stringify({ name, description }) })
    replace(channel)
    return channel
  }

  const update = async (channel: WorkspaceChannel, changes: { name?: string; description?: string }) => {
    if (!shared || !workspace) {
      setLocal((current) => ({ ...current, [localKey]: (current[localKey] ?? []).map((item) => (item.id === channel.id ? { ...item, ...changes } : item)) }))
      return
    }
    replace(await workspaceRequest<WorkspaceChannel>(`/workspaces/${workspace.id}/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify(changes) }))
  }

  const remove = async (channel: WorkspaceChannel) => {
    if (shared && workspace) await workspaceRequest<void>(`/workspaces/${workspace.id}/channels/${channel.id}`, { method: 'DELETE' })
    setRemote((current) => current && ({ ...current, channels: current.channels.filter((item) => item.id !== channel.id) }))
    setLocal((current) => ({ ...current, [localKey]: (current[localKey] ?? []).filter((item) => item.id !== channel.id) }))
    if (activeChannelId === channel.id) setActiveChannelId(GENERAL_ID)
    notify(`#${channel.name} was deleted.`)
  }

  const join = async (channel: WorkspaceChannel) => {
    if (!shared || !workspace) return
    replace(await workspaceRequest<WorkspaceChannel>(`/workspaces/${workspace.id}/channels/${channel.id}/join`, { method: 'POST' }))
    setMembers(null)
    notify(`You joined #${channel.name}.`)
  }

  const leave = async (channel: WorkspaceChannel) => {
    if (!shared || !workspace) return
    replace(await workspaceRequest<WorkspaceChannel>(`/workspaces/${workspace.id}/channels/${channel.id}/leave`, { method: 'POST' }))
    setMembers(null)
    if (activeChannelId === channel.id) setActiveChannelId(GENERAL_ID)
    notify(`You left #${channel.name}.`)
  }

  const membersKey = `${workspace?.id ?? 'personal'}:${active?.id}:${active?.member_count ?? 0}`
  useEffect(() => {
    if (!shared || !workspace || !active) return
    let live = true
    workspaceRequest<WorkspaceMember[]>(`/workspaces/${workspace.id}/channels/${active.id}/members`)
      .then((people) => { if (live) setMembers({ key: membersKey, people }) })
      .catch(() => { if (live) setMembers({ key: membersKey, people: [] }) })
    return () => { live = false }
  }, [shared, workspace, active, membersKey])
  const activeMembers = shared ? (members?.key === membersKey ? members.people : null) : null

  return { shared, channels, active, activeMembers, isUnread, select, create, update, remove, join, leave, refresh }
}

export type Channels = ReturnType<typeof useChannels>
