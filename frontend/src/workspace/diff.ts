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
