import React, { useState, useEffect, useRef, useCallback } from 'react'

export interface WorkflowSubtask {
  id: string
  title: string
  status: 'completed' | 'in-progress' | 'pending' | 'warning'
}

export interface WorkflowTask {
  id: string
  title: string
  status: 'completed' | 'in-progress' | 'pending'
  badges?: string[]
  subtasks?: WorkflowSubtask[]
}

export interface AIWorkflowProgressProps {
  isOpen: boolean
  onClose?: () => void
  onComplete?: () => void
  title?: string
  subtitle?: string
  documentName?: string
  mode?: 'document-audit' | 'remediation' | 'project-plan' | 'custom'
  customTasks?: WorkflowTask[]
  autoCloseDelay?: number // ms, default 1400 (0 for no auto-close)
  speedMultiplier?: number // default 1
}

/* Dotted spinner SVG matching the exact UI design */
function DottedSpinnerIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-label="In progress"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-full h-full animate-spin"
        style={{ animationDuration: '2.8s', animationTimingFunction: 'linear' }}
      >
        <circle
          cx="12"
          cy="12"
          r="9.5"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1.8"
          strokeDasharray="2.8 2.8"
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute w-1 h-1 rounded-full bg-[#60a5fa] shadow-[0_0_6px_#3b82f6]" />
    </div>
  )
}

/* Completed Checkmark SVG */
function CheckmarkIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-label="Completed"
    >
      <svg viewBox="0 0 24 24" className="w-full h-full" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="#22c55e" strokeWidth="1.6" />
        <path
          d="M8 12.2l2.6 2.6L16 9.4"
          stroke="#22c55e"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

/* Pending Circle SVG */
function PendingCircleIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-label="Pending"
    >
      <svg viewBox="0 0 24 24" className="w-full h-full" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="#4b5563" strokeWidth="1.6" />
      </svg>
    </div>
  )
}

/* Warning / Review SVG */
function WarningCircleIcon({ size = 18 }: { size?: number }) {
  return (
    <div
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-label="Needs review"
    >
      <svg viewBox="0 0 24 24" className="w-full h-full" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="#eab308" strokeWidth="1.6" />
        <path d="M12 7.5v5M12 15.8v.5" stroke="#eab308" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  )
}

/* Default Preset Tasks */
const PRESETS: Record<string, WorkflowTask[]> = {
  'document-audit': [
    {
      id: 'task-1',
      title: 'Read the document and identify its context',
      status: 'in-progress',
      subtasks: [
        { id: 'sub-1', title: 'Extract key parties, dates, and terms', status: 'completed' },
        { id: 'sub-2', title: 'Check for deadlines and required notice', status: 'in-progress' },
        { id: 'sub-3', title: 'Map clauses that may affect fairness', status: 'warning' },
      ],
    },
    {
      id: 'task-2',
      title: 'Flag potentially unfair or unclear clauses',
      status: 'in-progress',
    },
    {
      id: 'task-3',
      title: 'Compare findings with applicable guidance',
      status: 'pending',
      badges: ['1', '2'],
    },
    {
      id: 'task-4',
      title: 'Draft plain-language explanations and next steps',
      status: 'in-progress',
    },
    {
      id: 'task-5',
      title: 'Prepare your review summary',
      status: 'pending',
      badges: ['4'],
    },
  ],
  'remediation': [
    {
      id: 'rem-1',
      title: 'Analyze Flagged Due Process Violations',
      status: 'in-progress',
      subtasks: [
        { id: 'rem-sub-1', title: 'Detect vague filing deadlines', status: 'completed' },
        { id: 'rem-sub-2', title: 'Review omission of administrative appeal rights', status: 'in-progress' },
        { id: 'rem-sub-3', title: 'Compile remediation target specifications', status: 'warning' },
      ],
    },
    {
      id: 'rem-2',
      title: 'Inject Specific Statutory Timelines (Rule DP-104)',
      status: 'in-progress',
    },
    {
      id: 'rem-3',
      title: 'Synthesize Plain-Language Explanations',
      status: 'pending',
      badges: ['1', '2'],
    },
    {
      id: 'rem-4',
      title: 'Re-compute SHA-256 Provenance & Audit Signature',
      status: 'in-progress',
    },
    {
      id: 'rem-5',
      title: 'Export Compliant Notice Package v4.0',
      status: 'pending',
      badges: ['4'],
    },
  ],
  'project-plan': [
    {
      id: 'pp-1',
      title: 'Research Project Requirements',
      status: 'in-progress',
      subtasks: [
        { id: 'pp-sub-1', title: 'Interview stakeholders', status: 'completed' },
        { id: 'pp-sub-2', title: 'Review existing documentation', status: 'in-progress' },
        { id: 'pp-sub-3', title: 'Compile findings report', status: 'warning' },
      ],
    },
    {
      id: 'pp-2',
      title: 'Design System Architecture',
      status: 'in-progress',
    },
    {
      id: 'pp-3',
      title: 'Implementation Planning',
      status: 'pending',
      badges: ['1', '2'],
    },
    {
      id: 'pp-4',
      title: 'Development Environment Setup',
      status: 'in-progress',
    },
    {
      id: 'pp-5',
      title: 'Initial Development Sprint',
      status: 'pending',
      badges: ['4'],
    },
  ],
}

export function AIWorkflowProgress({
  isOpen,
  onClose,
  onComplete,
  title = 'Document review in progress',
  subtitle = 'Checking key terms, fairness signals, and next steps',
  documentName,
  mode = 'document-audit',
  customTasks,
  autoCloseDelay = 1400,
  speedMultiplier = 1,
}: AIWorkflowProgressProps) {
  const [currentMode, setCurrentMode] = useState<string>(mode)
  const [tasks, setTasks] = useState<WorkflowTask[]>(customTasks || PRESETS[mode] || PRESETS['document-audit'])
  const [activeStep, setActiveStep] = useState(0)
  const [overallProgress, setOverallProgress] = useState(15)
  const [isFinished, setIsFinished] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<number | null>(null)
  const completionCalledRef = useRef(false)

  const resetForMode = useCallback((targetMode: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setCurrentMode(targetMode)
    const baseTasks = customTasks && targetMode === mode ? customTasks : PRESETS[targetMode] || PRESETS['document-audit']
    setTasks(JSON.parse(JSON.stringify(baseTasks)))
    setActiveStep(0)
    setOverallProgress(15)
    setIsFinished(false)
    setElapsedMs(0)
    completionCalledRef.current = false
  }, [customTasks, mode])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  // Reset or initialize state when dialog opens or initial mode changes
  useEffect(() => {
    if (!isOpen) return
    const frame = window.requestAnimationFrame(() => resetForMode(mode))
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, mode, resetForMode])

  // Timer counter for real elapsed time display
  useEffect(() => {
    if (!isOpen || isFinished) return
    const interval = window.setInterval(() => {
      setElapsedMs((t) => t + 100)
    }, 100)
    return () => window.clearInterval(interval)
  }, [isOpen, isFinished])

  // Realistic staged progression through the workflow
  useEffect(() => {
    if (!isOpen || isFinished) return

    const baseDelay = 650 / speedMultiplier

    const timeout = window.setTimeout(() => {
      setActiveStep((prevStep) => {
        const next = prevStep + 1

        // Stage 1: subtask 2 completes
        if (next === 1) {
          setTasks((curr) => {
            const copy = [...curr]
            if (copy[0]?.subtasks?.[1]) copy[0].subtasks[1].status = 'completed'
            if (copy[0]?.subtasks?.[2]) copy[0].subtasks[2].status = 'in-progress'
            return copy
          })
          setOverallProgress(35)
        }
        // Stage 2: subtask 3 completes, main task 1 completes
        else if (next === 2) {
          setTasks((curr) => {
            const copy = [...curr]
            if (copy[0]?.subtasks?.[2]) copy[0].subtasks[2].status = 'completed'
            if (copy[0]) copy[0].status = 'completed'
            return copy
          })
          setOverallProgress(55)
        }
        // Stage 3: main task 2 completes, main task 3 starts
        else if (next === 3) {
          setTasks((curr) => {
            const copy = [...curr]
            if (copy[1]) copy[1].status = 'completed'
            if (copy[2]) copy[2].status = 'in-progress'
            return copy
          })
          setOverallProgress(75)
        }
        // Stage 4: main task 3 completes, main task 4 completes
        else if (next === 4) {
          setTasks((curr) => {
            const copy = [...curr]
            if (copy[2]) copy[2].status = 'completed'
            if (copy[3]) copy[3].status = 'completed'
            if (copy[4]) copy[4].status = 'in-progress'
            return copy
          })
          setOverallProgress(90)
        }
        // Stage 5: final task completes
        else if (next >= 5) {
          setTasks((curr) => {
            const copy = [...curr]
            if (copy[4]) copy[4].status = 'completed'
            return copy
          })
          setOverallProgress(100)
          setIsFinished(true)

          if (!completionCalledRef.current) {
            completionCalledRef.current = true
            onComplete?.()
          }

          if (autoCloseDelay > 0) {
            timerRef.current = window.setTimeout(() => {
              onClose?.()
            }, autoCloseDelay)
          }
        }

        return next
      })
    }, baseDelay)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [isOpen, activeStep, isFinished, speedMultiplier, autoCloseDelay, onComplete, onClose])

  if (!isOpen) return null

  const completedTasks = tasks.filter((task) => task.status === 'completed').length

  return (
    <div className="lg-review-overlay fixed inset-0 z-[10080] flex items-center justify-center p-4 bg-[#292824]/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="workflow-title">
      <section className="lg-review-dialog w-full max-w-[640px] overflow-hidden rounded-2xl border border-[#dfdbd1] bg-[#fffefa] text-[#292824] shadow-[0_24px_70px_rgba(42,40,36,.28)]">
        <header className="lg-review-header flex items-start justify-between gap-5 border-b border-[#e9e5dc] px-5 py-5 sm:px-7">
          <div className="lg-review-header-copy min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#b8701f]">
              <span className={`h-2 w-2 rounded-full ${isFinished ? 'bg-[#45855f]' : 'animate-pulse bg-[#d96b27]'}`} />
              {isFinished ? 'Review complete' : 'Review in progress'}
            </div>
            <h2 id="workflow-title" className="text-[21px] font-extrabold tracking-[-.035em] text-[#292824]">{title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-[#706e67]">{subtitle}</p>
            {documentName && <p className="mt-3 truncate text-[12px] text-[#706e67]">Reviewing <span className="font-semibold text-[#403e39]">{documentName}</span></p>}
          </div>
          <div className="lg-review-controls flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => resetForMode(currentMode)} className="inline-flex h-9 items-center justify-center rounded-lg border border-[#dfdbd1] px-3 text-[11px] font-bold text-[#514e47] transition-colors hover:border-[#b8701f] hover:bg-[#faf6ee]" aria-label="Restart review progress">
              Replay
            </button>
            {onClose && <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#dfdbd1] text-[#706e67] transition-colors hover:border-[#b8701f] hover:bg-[#faf6ee] hover:text-[#292824]" aria-label="Close workflow modal"><svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
          </div>
        </header>

        <div className="lg-review-progress px-5 pt-5 sm:px-7">
          <div className="mb-2 flex items-center justify-between gap-4 text-[11px] font-bold text-[#706e67]">
            <span>{isFinished ? 'All review steps complete' : `Step ${Math.min(activeStep + 1, tasks.length)} of ${tasks.length}`}</span>
            <span className="font-extrabold text-[#b8701f]">{overallProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#ebe7dd]"><div className="h-full rounded-full bg-[#d96b27] transition-[width] duration-300 ease-out" style={{ width: `${overallProgress}%` }} /></div>
        </div>

        <div className="lg-review-tasks mx-5 my-5 max-h-[48vh] divide-y divide-[#ebe7dd] overflow-y-auto rounded-xl border border-[#e5e0d6] bg-white sm:mx-7">
          {tasks.map((task) => {
            const isInProgress = task.status === 'in-progress'
            const isCompleted = task.status === 'completed'

            return <div key={task.id} className="lg-review-task px-4 py-3.5 sm:px-5">
              <div className="lg-review-task-main flex items-center gap-3">
                {isInProgress && <DottedSpinnerIcon size={20} />}
                {isCompleted && <CheckmarkIcon size={20} />}
                {task.status === 'pending' && <PendingCircleIcon size={20} />}
                <span className={`min-w-0 flex-1 text-[13px] leading-5 ${isCompleted ? 'text-[#817d75]' : isInProgress ? 'font-bold text-[#292824]' : 'text-[#706e67]'}`}>{task.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-[.06em] ${isCompleted ? 'bg-[#e7f1e8] text-[#34704b]' : isInProgress ? 'bg-[#fff0df] text-[#a55518]' : 'bg-[#f0eee8] text-[#817d75]'}`}>{isCompleted ? 'Done' : isInProgress ? 'Working' : 'Next'}</span>
              </div>
              {task.subtasks?.length ? <div className="lg-review-subtasks ml-[9px] mt-3 space-y-2 border-l border-dashed border-[#d8d2c5] pl-5">
                {task.subtasks.map((sub) => {
                  const subDone = sub.status === 'completed'
                  const subActive = sub.status === 'in-progress'
                  return <div key={sub.id} className="flex items-center gap-2.5">
                    {subDone && <CheckmarkIcon size={15} />}
                    {subActive && <DottedSpinnerIcon size={15} />}
                    {sub.status === 'warning' && <WarningCircleIcon size={15} />}
                    {sub.status === 'pending' && <PendingCircleIcon size={15} />}
                    <span className={`text-[11px] leading-4 ${subDone ? 'text-[#817d75]' : subActive ? 'font-semibold text-[#403e39]' : 'text-[#706e67]'}`}>{sub.title}</span>
                  </div>
                })}
              </div> : null}
            </div>
          })}
        </div>

        <footer className="lg-review-footer flex items-center justify-between gap-4 border-t border-[#e9e5dc] bg-[#faf8f3] px-5 py-4 sm:px-7">
          <span className="text-[11px] text-[#706e67]">{completedTasks} of {tasks.length} checks complete · {(elapsedMs / 1000).toFixed(1)}s</span>
          {isFinished ? <button type="button" onClick={onClose} className="lg-review-complete-button rounded-lg bg-[#292824] px-3.5 py-2 text-[11px] font-bold text-white transition-colors hover:bg-[#514e47]">View review</button> : <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#706e67]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d96b27]" />Preparing findings</span>}
        </footer>
      </section>
    </div>
  )
}

export default AIWorkflowProgress
