import { Fragment, type ReactNode } from 'react'

/** Paragraphs, "- " bullets, numbered steps and **bold**, rendered as React nodes (never HTML). */
export function RichText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>)
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={blocks.length}>{list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</Tag>)
    list = null
  }
  text.split('\n').forEach((raw) => {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((bullet ?? numbered)![1])
      return
    }
    flush()
    if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  })
  flush()
  return <>{blocks}</>
}
