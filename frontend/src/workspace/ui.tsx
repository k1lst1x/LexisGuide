import type { ReactNode } from 'react'
import { SEVERITY, scoreTone, type Severity } from './data'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ws-page-head">
      <div>
        {eyebrow && <span className="ws-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ws-page-actions">{actions}</div>}
    </header>
  )
}

export function Card({ title, subtitle, action, children, className = '', id }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`ws-card ${className}`} aria-labelledby={id}>
      {(title || action) && (
        <header className="ws-card-head">
          <div>
            {title && <h2 id={id}>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function SeverityChip({ severity, resolved }: { severity: Severity; resolved?: boolean }) {
  if (resolved) return <span className="ws-chip ws-chip-resolved"><b aria-hidden="true">✓</b>Resolved</span>
  const meta = SEVERITY[severity]
  return <span className={`ws-chip ws-chip-${severity}`}><b aria-hidden="true">{meta.icon}</b>{meta.label}</span>
}

export function ScoreDot({ score }: { score: number }) {
  return <span className={`ws-score-dot ws-tone-${scoreTone(score)}`} title={`Score ${score}/100`}>{score}</span>
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="ws-empty"><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>
}
