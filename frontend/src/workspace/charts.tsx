/* Workspace charts. One hue for magnitude (scores), the reserved status
   palette for severity (always paired with a label), thin marks with rounded
   data-ends, a dashed pass line, hover tooltips, and a table view. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PASS_SCORE, SEVERITY, documentDisplayName, openFindings, type SampleDoc, type Severity } from './data'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setWidth(Math.max(240, node.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

function Tip({ x, y, children, align = 'center' }: { x: number; y: number; children: ReactNode; align?: 'center' | 'left' }) {
  return <div className={`ch-tip ch-tip-${align}`} style={{ left: x, top: y }} role="tooltip">{children}</div>
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <button type="button" className="ch-table-toggle" onClick={onToggle} aria-pressed={open}>{open ? 'Show chart' : 'Show table'}</button>
}

/* ───────── Hero score with a 100-point track ───────── */
export function ScoreMeter({ score, label = 'Document review score', size = 'lg' }: { score: number; label?: string; size?: 'lg' | 'sm' }) {
  const tone = score >= PASS_SCORE ? 'good' : score >= 60 ? 'review' : 'risk'
  return (
    <div className={`ch-meter ch-meter-${size}`} role="img" aria-label={`Document score ${score} out of 100`}>
      <div className="ch-meter-head">
        <strong>{score}</strong><span>/100</span>
        <em className={`ch-meter-tone ch-tone-${tone}`}>{tone === 'good' ? 'Passes review' : tone === 'review' ? 'Needs review' : 'At risk'}</em>
      </div>
      <div className="ch-meter-track">
        <i style={{ width: `${score}%` }} />
        <b style={{ left: `${PASS_SCORE}%` }} title={`Pass line ${PASS_SCORE}`} />
      </div>
      <small>{label} · pass line {PASS_SCORE}</small>
    </div>
  )
}

/* ───────── Resolution progress ───────── */
export function ProgressLine({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total ? Math.round((done / total) * 100) : 100
  return (
    <div className="ch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={label}>
      <div className="ch-progress-head"><span>{label}</span><strong>{done} of {total}</strong></div>
      <div className="ch-progress-track"><i style={{ width: `${percent}%` }} /></div>
    </div>
  )
}

/* ───────── Scores per document, against the pass line ───────── */
export function ScoreBars({ documents, selectedId, onSelect, resolved }: { documents: SampleDoc[]; selectedId: string; onSelect: (doc: SampleDoc) => void; resolved: Record<string, string[]> }) {
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [table, setTable] = useState(false)
  const rows = [...documents].sort((a, b) => a.score - b.score)
  const hovered = rows.find((doc) => doc.id === hover?.id)

  return (
    <figure className="ch ch-scorebars" aria-label="Document scores">
      <div className="ch-toolbar">
        <span className="ch-legend"><i className="ch-swatch ch-swatch-score" />Score out of 100</span>
        <span className="ch-legend"><i className="ch-swatch ch-swatch-pass" />Pass line {PASS_SCORE}</span>
        <TableToggle open={table} onToggle={() => setTable((value) => !value)} />
      </div>
      {table ? (
        <table className="ch-table">
          <thead><tr><th>Document</th><th>Score</th><th>Open findings</th></tr></thead>
          <tbody>{rows.map((doc) => <tr key={doc.id}><td>{documentDisplayName(doc)}</td><td>{doc.score}</td><td>{openFindings(doc, resolved[doc.id]).length}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="ch-bars" onMouseLeave={() => setHover(null)}>
          <div className="ch-passline" style={{ left: `calc(var(--ch-label) + (100% - var(--ch-label) - var(--ch-value)) * ${PASS_SCORE / 100})` }}><span>{PASS_SCORE}</span></div>
          {rows.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={`ch-bar-row ${doc.id === selectedId ? 'is-selected' : ''} ${hover && hover.id !== doc.id ? 'is-dim' : ''}`}
              onClick={() => onSelect(doc)}
              onMouseMove={(event) => {
                const box = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
                setHover({ id: doc.id, x: event.clientX - box.left, y: event.currentTarget.offsetTop })
              }}
              onFocus={(event) => setHover({ id: doc.id, x: event.currentTarget.clientWidth / 2, y: event.currentTarget.offsetTop })}
              onBlur={() => setHover(null)}
              aria-label={`${documentDisplayName(doc)}: score ${doc.score} out of 100`}
            >
              <span className="ch-bar-label">{documentDisplayName(doc)}</span>
              <span className="ch-bar-track"><i style={{ width: `${doc.score}%` }} /></span>
              <span className="ch-bar-value">{doc.score}</span>
            </button>
          ))}
          {hover && hovered && (
            <Tip x={hover.x} y={hover.y}>
              <strong>{documentDisplayName(hovered)}</strong>
              <span>Score {hovered.score}/100 · {hovered.score >= PASS_SCORE ? 'passes' : `${PASS_SCORE - hovered.score} below pass line`}</span>
              <span>{openFindings(hovered, resolved[hovered.id]).length} open findings</span>
            </Tip>
          )}
        </div>
      )}
    </figure>
  )
}

/* ───────── Findings by category, stacked by severity ───────── */
export function FindingsByCategory({ documents, resolved, onPick }: { documents: SampleDoc[]; resolved: Record<string, string[]>; onPick?: (category: string) => void }) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null)
  const [table, setTable] = useState(false)
  const order: Severity[] = ['critical', 'warning', 'pass']
  const buckets = new Map<string, Record<Severity, number>>()
  documents.forEach((doc) => doc.findings.forEach((finding) => {
    const bucket = buckets.get(finding.category) ?? { critical: 0, warning: 0, pass: 0 }
    const severity: Severity = resolved[doc.id]?.includes(finding.id) ? 'pass' : finding.severity
    bucket[severity] += 1
    buckets.set(finding.category, bucket)
  }))
  const rows = [...buckets.entries()]
    .map(([category, counts]) => ({ category, counts, total: counts.critical + counts.warning + counts.pass, open: counts.critical + counts.warning }))
    .sort((a, b) => b.open - a.open || b.total - a.total)
    .slice(0, 6)
  const max = Math.max(1, ...rows.map((row) => row.total))
  const [category, severity] = hover?.key.split('|') ?? []
  const hoveredRow = rows.find((row) => row.category === category)

  return (
    <figure className="ch ch-stack" aria-label="Findings by category">
      <div className="ch-toolbar">
        {order.map((key) => <span className="ch-legend" key={key}><i className="ch-swatch" style={{ background: SEVERITY[key].color }} />{SEVERITY[key].label}</span>)}
        <TableToggle open={table} onToggle={() => setTable((value) => !value)} />
      </div>
      {table ? (
        <table className="ch-table">
          <thead><tr><th>Category</th>{order.map((key) => <th key={key}>{SEVERITY[key].label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.category}><td>{row.category}</td>{order.map((key) => <td key={key}>{row.counts[key]}</td>)}</tr>)}</tbody>
        </table>
      ) : (
        <div className="ch-bars" onMouseLeave={() => setHover(null)}>
          {rows.map((row) => (
            <div className="ch-stack-row" key={row.category}>
              <button type="button" className="ch-bar-label ch-bar-label-link" onClick={() => onPick?.(row.category)}>{row.category}</button>
              <span className="ch-stack-track" style={{ width: `calc((100% - var(--ch-label) - var(--ch-value)) * ${row.total / max})` }}>
                {order.filter((key) => row.counts[key]).map((key) => (
                  <i
                    key={key}
                    className={hover && hover.key !== `${row.category}|${key}` ? 'is-dim' : ''}
                    style={{ flexGrow: row.counts[key], background: SEVERITY[key].color }}
                    onMouseMove={(event) => {
                      const box = (event.currentTarget.closest('.ch-bars') as HTMLElement).getBoundingClientRect()
                      setHover({ key: `${row.category}|${key}`, x: event.clientX - box.left, y: (event.currentTarget.closest('.ch-stack-row') as HTMLElement).offsetTop })
                    }}
                  />
                ))}
              </span>
              <span className="ch-bar-value">{row.open ? `${row.open} open` : '✓'}</span>
            </div>
          ))}
          {!rows.length && <p className="ch-empty">No findings yet. Add a document to see categories.</p>}
          {hover && hoveredRow && (
            <Tip x={hover.x} y={hover.y}>
              <strong>{hoveredRow.category}</strong>
              <span>{SEVERITY[severity as Severity].icon} {hoveredRow.counts[severity as Severity]} {SEVERITY[severity as Severity].label.toLowerCase()}</span>
              <span>{hoveredRow.total} findings in total</span>
            </Tip>
          )}
        </div>
      )}
    </figure>
  )
}

/* ───────── Score trend across versions ───────── */
export function ScoreTrend({ points }: { points: Array<{ label: string; score: number; detail: string }> }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const height = 220
  const pad = { top: 18, right: 28, bottom: 30, left: 34 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const x = (i: number) => pad.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1))
  const y = (score: number) => pad.top + (1 - score / 100) * plotH
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${pad.top + plotH} L${x(0)},${pad.top + plotH} Z`
  const last = points.length - 1
  const shown = active ?? null

  return (
    <figure className="ch ch-trend" aria-label="Score by version">
      <div className="ch-toolbar">
        <span className="ch-legend"><i className="ch-swatch ch-swatch-score" />Score</span>
        <span className="ch-legend"><i className="ch-swatch ch-swatch-pass" />Pass line {PASS_SCORE}</span>
        <TableToggle open={table} onToggle={() => setTable((value) => !value)} />
      </div>
      {table ? (
        <table className="ch-table">
          <thead><tr><th>Version</th><th>Score</th><th>Milestone</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.label}><td>{p.label}</td><td>{p.score}</td><td>{p.detail}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="ch-trend-plot" ref={ref} onMouseLeave={() => setActive(null)}>
          <svg width={width} height={height} role="img" aria-label={`Score rose from ${points[0]?.score} to ${points[last]?.score} across ${points.length} versions`}
            onMouseMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect()
              const px = event.clientX - box.left
              let nearest = 0
              points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i })
              setActive(nearest)
            }}>
            <defs>
              <linearGradient id="ch-trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#00674f" stopOpacity=".16" /><stop offset="1" stopColor="#00674f" stopOpacity="0" /></linearGradient>
            </defs>
            {[0, 50, 100].map((v) => <g key={v}><line className="ch-grid" x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} /><text className="ch-axis" x={pad.left - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
            <line className="ch-pass" x1={pad.left} x2={width - pad.right} y1={y(PASS_SCORE)} y2={y(PASS_SCORE)} />
            <text className="ch-pass-label" x={pad.left + 6} y={y(PASS_SCORE) - 6}>Pass {PASS_SCORE}</text>
            <path d={area} fill="url(#ch-trend-fill)" />
            <path d={line} className="ch-line" />
            {shown !== null && <line className="ch-crosshair" x1={x(shown)} x2={x(shown)} y1={pad.top} y2={pad.top + plotH} />}
            {points.map((p, i) => (
              <g key={p.label}>
                <circle cx={x(i)} cy={y(p.score)} r={shown === i ? 6 : 4.5} className={`ch-dot ${i === last ? 'is-last' : ''}`} />
                <text className="ch-axis" x={x(i)} y={height - 8} textAnchor="middle">{p.label}</text>
              </g>
            ))}
            <text className="ch-direct" x={x(last)} y={y(points[last]?.score ?? 0) - 12} textAnchor="middle">{points[last]?.score}</text>
          </svg>
          {shown !== null && (
            <Tip x={x(shown)} y={y(points[shown].score) - 8}>
              <strong>{points[shown].label} · {points[shown].score}/100</strong>
              <span>{points[shown].detail}</span>
            </Tip>
          )}
        </div>
      )}
    </figure>
  )
}

/* ───────── Weekly time in review ───────── */
export function WeeklyBars({ data, active, onActive }: { data: Array<{ label: string; minutes: number }>; active: number | null; onActive: (index: number | null) => void }) {
  const max = Math.max(...data.map((d) => d.minutes))
  const average = Math.round(data.reduce((sum, d) => sum + d.minutes, 0) / data.length)
  return (
    <figure className="ch ch-weekly" aria-label="Weekly activity time" onMouseLeave={() => onActive(null)}>
      <div className="ch-weekly-plot">
        <div className="ch-weekly-avg" style={{ bottom: `calc(24px + (100% - 42px) * ${average / max})` }}><span>avg {average}</span></div>
        {data.map((day, index) => (
          <button
            key={day.label}
            type="button"
            className={`ch-col ${active === index ? 'is-active' : ''} ${active !== null && active !== index ? 'is-dim' : ''}`}
            onMouseEnter={() => onActive(index)}
            onFocus={() => onActive(index)}
            onClick={() => onActive(index)}
            aria-label={`${day.label}: ${day.minutes} minutes in the workspace`}
          >
            <span className="ch-col-bar" style={{ height: `${(day.minutes / max) * 100}%` }}>
              {active === index && <em>{day.minutes}m</em>}
            </span>
            <small>{day.label}</small>
          </button>
        ))}
      </div>
    </figure>
  )
}
