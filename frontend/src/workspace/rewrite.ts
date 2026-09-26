/**
 * Find an AI-provided excerpt in its source document without treating harmless
 * PDF/OCR formatting changes as a different clause. The returned range always
 * refers to the untouched source text, so applying a rewrite never rewrites a
 * fuzzy or guessed passage.
 */
type NormalizedText = { value: string; sourceOffsets: number[] }

function normalizeForMatch(source: string): NormalizedText {
  let value = ''
  const sourceOffsets: number[] = []
  let previousWasSpace = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (/\s/u.test(character)) {
      if (!previousWasSpace) {
        value += ' '
        sourceOffsets.push(index)
        previousWasSpace = true
      }
      continue
    }

    previousWasSpace = false
    const normalized = character
      .replace(/[‘’]/gu, "'")
      .replace(/[“”]/gu, '"')
      .replace(/[–—]/gu, '-')
      .toLowerCase()
    value += normalized
    sourceOffsets.push(index)
  }

  return { value, sourceOffsets }
}

export function findRewriteRange(documentText: string, evidence: string): { start: number; end: number } | null {
  const exactStart = documentText.indexOf(evidence)
  if (exactStart >= 0) return { start: exactStart, end: exactStart + evidence.length }

  const document = normalizeForMatch(documentText)
  const excerpt = normalizeForMatch(evidence).value
  const normalizedStart = document.value.indexOf(excerpt)
  if (normalizedStart < 0 || !excerpt) return null

  const normalizedEnd = normalizedStart + excerpt.length - 1
  const start = document.sourceOffsets[normalizedStart]
  const finalCharacterOffset = document.sourceOffsets[normalizedEnd]
  return { start, end: finalCharacterOffset + 1 }
}
