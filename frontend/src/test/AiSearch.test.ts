import { afterEach, describe, expect, it, vi } from 'vitest'

import { aiSearch } from '../workspace/api'
import { sampleDocs } from '../workspace/data'

const auth = vi.hoisted(() => ({ cognitoGetIdToken: vi.fn() }))
vi.mock('../aws', () => auth)

afterEach(() => vi.unstubAllGlobals())

describe('AI Search', () => {
  it('asks the assistant across every document and lists the documents its answer names', async () => {
    auth.cognitoGetIdToken.mockResolvedValue('token-1')
    const [first, second] = sampleDocs
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      reply: `No document mentions David Le. The closest is **${second.title}**, and then ${first.title}.`,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await aiSearch('who is david le', sampleDocs)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/chat$/)
    const body = JSON.parse(init.body)
    expect(body.messages).toEqual([{ role: 'user', content: 'who is david le' }])
    expect(body.context.page).toBe('AI Search')
    expect(body.context.library).toHaveLength(sampleDocs.length)
    expect(body.context.library[0]).toEqual(expect.objectContaining({ title: expect.any(String), excerpt: expect.any(String), open_findings: expect.any(Array) }))
    expect(result.mode).toBe('ai')
    expect(result.answer).toContain('No document mentions David Le')
    expect(result.sources.map((item) => item.id)).toEqual([second.id, first.id])
  })

  it('searches the text itself when signed out', async () => {
    auth.cognitoGetIdToken.mockResolvedValue(null)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await aiSearch('filing deadline', sampleDocs)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.mode).toBe('keyword')
    expect(result.sources.length).toBeGreaterThan(0)
  })
})
