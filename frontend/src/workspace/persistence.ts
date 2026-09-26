/* The saved workspace: documents and where the person left off, kept on the
   server so a refresh or another device opens the workspace as it was. */
import { cognitoGetIdToken } from '../aws'
import { apiBase } from './api'
import { sha256Hex } from './ledger'
import type { SampleDoc, WorkspaceTask } from './data'

export type SavedDocument = {
  document_key: string
  document_id: string
  /** Null when the list ran past its size budget; fetch it with loadDocument. */
  document: SampleDoc | null
  resolved: string[]
  updated_at: string
}

export type WorkspaceState = {
  selected_document_id: string | null
  jurisdiction: string
  hidden_samples: string[]
  tasks: WorkspaceTask[] | null
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = await cognitoGetIdToken()
  if (!token) throw new Error('Sign in to save your workspace.')
  const send = () => fetch(`${apiBase()}/api/v1/me${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${token}` },
  })
  let response = await send()
  if (response.status === 401) {
    token = await cognitoGetIdToken(true)
    if (!token) throw new Error('Your session expired. Please sign in again.')
    response = await send()
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null))?.detail
    throw new Error(typeof detail === 'string' ? detail : 'Your workspace could not be saved.')
  }
  return (response.status === 204 ? null : await response.json()) as T
}

export const documentKey = (documentId: string) => sha256Hex(documentId)

export function loadDocuments() {
  return request<SavedDocument[]>('/documents')
}

export async function loadDocument(documentId: string) {
  return request<SavedDocument>(`/documents/${await documentKey(documentId)}`)
}

export async function saveDocument(document: SampleDoc, resolved: string[]) {
  await request(`/documents/${await documentKey(document.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ document_id: document.id, document, resolved }),
  })
}

export async function deleteDocument(documentId: string) {
  await request(`/documents/${await documentKey(documentId)}`, { method: 'DELETE' })
}

export function loadWorkspaceState() {
  return request<WorkspaceState>('/workspace-state')
}

export async function saveWorkspaceState(state: WorkspaceState) {
  await request('/workspace-state', { method: 'PUT', body: JSON.stringify(state) })
}
