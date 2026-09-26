import { afterEach, describe, expect, it, vi } from 'vitest'

// The deployed file behind this import is gone, as after a redeploy.
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => {
  throw new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/pdf-old.js')
})

import { STALE_BUILD_MESSAGE, reloadForNewBuild } from '../staleBuild'
import { extractDocumentText } from '../workspace/data'

afterEach(() => {
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

describe('an outdated page after a deploy', () => {
  it('says to refresh instead of showing a missing-file error', async () => {
    const pdf = new File(['%PDF-1.7'], 'lease.pdf', { type: 'application/pdf' })
    await expect(extractDocumentText(pdf)).rejects.toThrow(STALE_BUILD_MESSAGE)
  })

  it('reloads once, never in a loop', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    expect(reloadForNewBuild()).toBe(true)
    expect(reloadForNewBuild()).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })
})
