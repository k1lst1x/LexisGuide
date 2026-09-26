/* A line-by-line comparison of two versions of a document. */

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

// Above this many line pairs the full comparison is too slow for the browser;
// the shared start and end are kept and the middle shown as replaced.
const MAX_CELLS = 2_000_000

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const head = a.slice(0, start).map((text): DiffLine => ({ kind: 'same', text }))
  const tail = a.slice(endA).map((text): DiffLine => ({ kind: 'same', text }))
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if (midA.length * midB.length > MAX_CELLS) {
    return [
      ...head,
      ...midA.map((text): DiffLine => ({ kind: 'removed', text })),
      ...midB.map((text): DiffLine => ({ kind: 'added', text })),
      ...tail,
    ]
  }

  // Longest common subsequence over the part that differs.
  const rows = midA.length + 1
  const cols = midB.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      table[i * cols + j] = midA[i] === midB[j]
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  const middle: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) { middle.push({ kind: 'same', text: midA[i] }); i++; j++ }
    else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) middle.push({ kind: 'removed', text: midA[i++] })
    else middle.push({ kind: 'added', text: midB[j++] })
  }
  while (i < midA.length) middle.push({ kind: 'removed', text: midA[i++] })
  while (j < midB.length) middle.push({ kind: 'added', text: midB[j++] })
  return [...head, ...middle, ...tail]
}

/** Lines added and removed. */
export function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((line) => line.kind === 'added').length,
    removed: lines.filter((line) => line.kind === 'removed').length,
  }
}

/** Only the changed lines with a little context, the rest folded away. */
export function foldUnchanged(lines: DiffLine[], context = 2): Array<DiffLine | { kind: 'fold'; count: number }> {
  const keep = lines.map((line, index) => line.kind !== 'same'
    || lines.slice(Math.max(0, index - context), index + context + 1).some((near) => near.kind !== 'same'))
  const out: Array<DiffLine | { kind: 'fold'; count: number }> = []
  let folded = 0
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (folded) { out.push({ kind: 'fold', count: folded }); folded = 0 }
      out.push(line)
    } else folded++
  })
  if (folded) out.push({ kind: 'fold', count: folded })
  return out
}

export type WordPart = { kind: 'same' | 'added' | 'removed'; text: string }

// Word comparisons longer than this fall back to showing both lines whole.
const MAX_WORD_CELLS = 250_000

/** Which words changed between two versions of one line. */
export function diffWords(before: string, after: string): WordPart[] | null {
  const a = before.split(/(\s+)/).filter(Boolean)
  const b = after.split(/(\s+)/).filter(Boolean)
  if (a.length * b.length > MAX_WORD_CELLS) return null
  const cols = b.length + 1
  const table = new Uint32Array((a.length + 1) * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j]
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  const parts: WordPart[] = []
  const push = (kind: WordPart['kind'], text: string) => {
    const last = parts[parts.length - 1]
    if (last?.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++ }
    else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) push('removed', a[i++])
    else push('added', b[j++])
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}

export type DiffRow =
  | DiffLine
  | { kind: 'fold'; count: number }
  | { kind: 'changed'; parts: WordPart[] }

/** Fold unchanged lines, and show a line that was edited (removed then added
    in place) as one line with the changed words marked. */
export function diffRows(lines: DiffLine[], context = 2): DiffRow[] {
  const rows: DiffRow[] = []
  for (const row of foldUnchanged(lines, context)) {
    if (row.kind === 'added') {
      // Pair with the oldest unpaired removed line in the run just before.
      let start = rows.length
      while (start > 0 && rows[start - 1].kind === 'removed') start--
      const removedIndex = rows.findIndex((item, index) => index >= start && item.kind === 'removed')
      if (removedIndex !== -1) {
        const removed = rows[removedIndex] as DiffLine
        const parts = diffWords(removed.text, row.text)
        // Only worth merging when most of the line survived.
        const kept = parts?.filter((part) => part.kind === 'same').reduce((sum, part) => sum + part.text.length, 0) ?? 0
        if (parts && kept >= Math.min(removed.text.length, row.text.length) * 0.4) {
          rows.splice(removedIndex, 1)
          rows.push({ kind: 'changed', parts })
          continue
        }
      }
    }
    rows.push(row)
  }
  return rows
}
