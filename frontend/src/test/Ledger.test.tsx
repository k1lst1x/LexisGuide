import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('id-token') }))

const workspace = vi.hoisted(() => ({ current: { documents: [] as unknown[], selected: {} as unknown } }))
vi.mock('../workspace/store', () => ({ useWorkspace: () => workspace.current }))

const INFO = {
  enabled: true,
  network: 'Base Sepolia',
  chain_id: 84532,
  explorer_url: 'https://sepolia.basescan.org',
  contract_address: '0x1111111111111111111111111111111111111111',
  recorder_address: '0x2222222222222222222222222222222222222222',
}

type Sent = { url: string; method: string; body: Record<string, string> | null }
let sent: Sent[]
let history: unknown[]

function reply(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  vi.resetModules()
  sent = []
  history = []
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    sent.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.endsWith('/api/v1/ledger')) return reply(INFO)
    if (method === 'POST') return reply({ ...(JSON.parse(String(init!.body))), status: 'pending' }, 201)
    return reply(history)
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const posts = () => sent.filter((call) => call.method === 'POST').map((call) => call.body!)
const load = () => import('../workspace/ledger')

describe('ledger client', () => {
  it('fingerprints text with SHA-256', async () => {
    const { sha256Hex } = await load()
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('never sends the built-in sample documents', async () => {
    const { recordChange } = await load()
    await recordChange({ documentId: 'benefits-notice', kind: 'edited', text: 'x', title: 'Sample' })
    expect(sent).toEqual([])
  })

  it('sends a fingerprint, never the text', async () => {
    const { recordChange, sha256Hex } = await load()
    await recordChange({ documentId: 'upload-lease', kind: 'created', text: 'Confidential terms', title: 'Lease' })

    const [body] = posts()
    expect(body).toMatchObject({ document_id: 'upload-lease', kind: 'created', content_hash: await sha256Hex('Confidential terms') })
    expect(JSON.stringify(body)).not.toContain('Confidential terms')
  })

  it('records a burst of typing as one edit once it pauses', async () => {
    vi.useFakeTimers()
    const { recordEdit, sha256Hex } = await load()
    for (const text of ['D', 'Dr', 'Dra', 'Draft']) recordEdit({ documentId: 'upload-lease', text, title: 'Lease' })

    await vi.advanceTimersByTimeAsync(2900)
    expect(posts()).toEqual([])
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(posts()).toHaveLength(1))

    expect(posts()[0]).toMatchObject({ kind: 'edited', content_hash: await sha256Hex('Draft') })
  })

  it('sends a settling edit before the change that follows it', async () => {
    vi.useFakeTimers()
    const { recordChange, recordEdit } = await load()
    recordEdit({ documentId: 'upload-lease', text: 'Draft', title: 'Lease' })
    await recordChange({ documentId: 'upload-lease', kind: 'renamed', text: 'Draft', title: 'Lease v2' })

    expect(posts().map((body) => body.kind)).toEqual(['edited', 'renamed'])
  })
})

const DOC = { id: 'upload-lease', title: 'Lease', text: 'Draft', type: 'Lease', findings: [] }
const confirmed = (hash: string, block: number, sequence: number) => ({
  change_id: `change-${sequence}`,
  document_id: DOC.id,
  kind: sequence === 1 ? 'created' : 'edited',
  content_hash: hash,
  title: 'Lease',
  status: 'confirmed',
  created_at: '2026-09-23T10:00:00Z',
  attempts: 1,
  tx_hash: `0x${'ab'.repeat(32)}`,
  block_number: block,
  block_time: 1790190000 + sequence,
  sequence,
  entry_hash: `0x${String(sequence).repeat(64)}`,
  previous_entry: sequence === 1 ? `0x${'0'.repeat(64)}` : `0x${String(sequence - 1).repeat(64)}`,
  error: '',
})

describe('On-chain history', () => {
  it('shows each change as a block and confirms the text on screen matches the chain', async () => {
    const { sha256Hex } = await load()
    workspace.current = { documents: [DOC], selected: DOC }
    history = [confirmed('11'.repeat(32), 47216500, 1), confirmed(await sha256Hex('Draft'), 47216547, 2)]
    const { ChainHistory } = await import('../workspace/views/ChainHistory')

    render(<ChainHistory />)

    const list = await screen.findByRole('list', { name: /On-chain history of/ })
    const blocks = within(list).getAllByRole('listitem')
    expect(blocks).toHaveLength(2)
    expect(within(blocks[0]).getByRole('link', { name: '47,216,547' })).toHaveAttribute('href', 'https://sepolia.basescan.org/block/47216547')
    expect(within(blocks[0]).getByText('Change #2')).toBeInTheDocument()
    expect(within(blocks[1]).getByText('First entry', { exact: false })).toBeInTheDocument()
    expect(await screen.findByText(/matches the fingerprint in block 47,216,547/)).toBeInTheDocument()
  })

  it('turns a pending change into a block as soon as it is mined', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { sha256Hex } = await load()
    workspace.current = { documents: [DOC], selected: DOC }
    const hash = await sha256Hex('Draft')
    history = [{ ...confirmed(hash, 0, 1), status: 'pending', block_number: null, block_time: null, sequence: null, entry_hash: '', tx_hash: '' }]
    const { ChainHistory } = await import('../workspace/views/ChainHistory')

    render(<ChainHistory />)
    expect(await screen.findByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for the next block/)).toBeInTheDocument()

    history = [confirmed(hash, 47216600, 1)]
    await act(async () => { await vi.advanceTimersByTimeAsync(2600) })

    expect(await screen.findByRole('link', { name: '47,216,600' })).toBeInTheDocument()
    expect(screen.queryByText('Pending')).not.toBeInTheDocument()
  })

  it('explains that sample documents are not recorded', async () => {
    workspace.current = { documents: [{ ...DOC, id: 'benefits-notice' }], selected: { ...DOC, id: 'benefits-notice' } }
    const { ChainHistory } = await import('../workspace/views/ChainHistory')

    render(<ChainHistory />)

    expect(await screen.findByText(/sample documents are not recorded/)).toBeInTheDocument()
  })
})
