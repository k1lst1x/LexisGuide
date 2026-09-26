import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentHistory } from '../workspace/views/DocumentHistory'
import { sha256Hex } from '../workspace/ledger'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue('id-token') }))

const INFO = {
  enabled: true,
  network: 'Base Sepolia',
  chain_id: 84532,
  explorer_url: 'https://sepolia.basescan.org',
  contract_address: '0x1111111111111111111111111111111111111111',
  recorder_address: '0x2222222222222222222222222222222222222222',
}

const FIRST = 'Rent is due on the 1st.\nLate fee: $50.'
const CURRENT = 'Rent is due on the 5th.\nLate fee: $50.'

let versions: Record<string, { text: string; on_chain: string; matches_fingerprint?: boolean }>
let urls: string[]

async function change(id: string, text: string, block: number, kind = 'edited', changedBy = '') {
  return {
    change_id: id, document_id: 'upload-lease', kind, content_hash: await sha256Hex(text), title: 'Lease',
    status: 'confirmed', created_at: '2026-09-26T10:00:00Z', attempts: 1, tx_hash: `0x${'ab'.repeat(32)}`,
    block_number: block, block_time: 1790000000 + block, sequence: block, entry_hash: '', previous_entry: '', error: '',
    has_version: true, changed_by: changedBy,
  }
}

beforeEach(async () => {
  urls = []
  const changes = [await change('change-0001', FIRST, 101, 'created'), await change('change-0002', CURRENT, 102, 'edited', 'Maya')]
  versions = {
    'change-0001': { text: FIRST, on_chain: 'verified' },
    'change-0002': { text: CURRENT, on_chain: 'verified' },
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (url.endsWith('/api/v1/ledger')) return json(INFO)
    const version = url.match(/\/changes\/([^/]+)\/version/)
    if (version) {
      const row = changes.find((item) => item.change_id === version[1])!
      const kept = versions[version[1]]
      return json({ ...row, text: kept.text, matches_fingerprint: kept.matches_fingerprint ?? true, on_chain: kept.on_chain })
    }
    return json(changes)
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Document history', () => {
  it('lists every version from the chain and marks the current one', async () => {
    render(<DocumentHistory documentId="upload-lease" currentText={CURRENT} recorded />)

    const list = await screen.findByRole('list', { name: 'Versions' })
    const items = within(list).getAllByRole('button')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Text edited'),
      expect.stringContaining('Document added · first version'),
    ])
    expect(items[0]).toHaveTextContent('Maya')
    expect(items[0]).toHaveTextContent('Block 102')
    await waitFor(() => expect(items[0]).toHaveTextContent('Current'))
  })

  it('opens an earlier version verified by its block, shows what changed, and restores it', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<DocumentHistory documentId="upload-lease" currentText={CURRENT} recorded onRestore={onRestore} />)

    await user.click(await screen.findByRole('button', { name: /Document added/ }))

    expect(await screen.findByText(/Verified: matches the fingerprint in block 101/)).toBeInTheDocument()
    const diff = screen.getByLabelText('Changes since this version')
    expect(within(diff).getByText('Rent is due on the 1st.').closest('.ws-diff-line')).toHaveClass('is-removed')
    expect(within(diff).getByText('Rent is due on the 5th.').closest('.ws-diff-line')).toHaveClass('is-added')

    await user.click(screen.getByRole('button', { name: /Restore this version/ }))
    expect(onRestore).toHaveBeenCalledWith(FIRST, expect.objectContaining({ change_id: 'change-0001' }))
  })

  it('refuses to vouch for a version that does not match its fingerprint', async () => {
    const user = userEvent.setup()
    versions['change-0001'] = { text: 'Rent is due on the 30th.', on_chain: 'mismatch', matches_fingerprint: false }
    render(<DocumentHistory documentId="upload-lease" currentText={CURRENT} recorded onRestore={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /Document added/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('does not match the fingerprint')
    expect(screen.queryByRole('button', { name: /Restore this version/ })).not.toBeInTheDocument()
  })

  it('reads a shared document’s history from its workspace', async () => {
    render(<DocumentHistory documentId="upload-lease" currentText={CURRENT} workspaceId="ws-1" recorded />)
    await screen.findByRole('list', { name: 'Versions' })
    expect(urls.some((url) => url.includes('/changes?') && url.includes('workspace_id=ws-1'))).toBe(true)
  })

  it('explains that sample documents have no history', async () => {
    render(<DocumentHistory documentId="sample-1" currentText="text" recorded={false} />)
    expect(await screen.findByText('No history for sample documents')).toBeInTheDocument()
  })
})
