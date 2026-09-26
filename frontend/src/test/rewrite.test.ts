import { describe, expect, it } from 'vitest'
import { findRewriteRange } from '../workspace/rewrite'

describe('findRewriteRange', () => {
  it('preserves an exact evidence range', () => {
    expect(findRewriteRange('The tenant must pay rent.', 'tenant must pay')).toEqual({ start: 4, end: 19 })
  })

  it('matches whitespace and typographic punctuation differences from extracted files', () => {
    const document = 'The tenant\nshall pay “rent” — monthly.'
    const evidence = 'tenant shall pay "rent" - monthly.'

    expect(findRewriteRange(document, evidence)).toEqual({ start: 4, end: document.length })
  })

  it('does not guess when the claimed excerpt is not in the document', () => {
    expect(findRewriteRange('The tenant shall pay rent.', 'The landlord may raise rent.')).toBeNull()
  })
})
