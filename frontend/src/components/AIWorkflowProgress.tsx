import React, { useState, useEffect, useRef } from 'react'

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
      title: 'Research Document & Notice Requirements',
      status: 'in-progress',
      subtasks: [
        { id: 'sub-1', title: 'Extract agency details & case references', status: 'completed' },
        { id: 'sub-2', title: 'Review existing statutory documentation (§ 408)', status: 'in-progress' },
        { id: 'sub-3', title: 'Compile initial evidence findings report', status: 'warning' },
      ],
    },
    {
      id: 'task-2',
      title: 'Design System Architecture & Rule Packs',
      status: 'in-progress',
    },
    {
      id: 'task-3',
      title: 'Implementation Planning & Plain-Language Audit',
      status: 'pending',
      badges: ['1', '2'],
    },
    {
      id: 'task-4',
      title: 'Development Environment & Cryptographic Hash',
      status: 'in-progress',
    },
    {
      id: 'task-5',
      title: 'Initial Development Sprint & Citizen Guide Export',
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
  title = 'AI Autonomous Processing Engine',
  subtitle = 'Executing document fairness linting & cryptographic review',
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

  const resetForMode = (targetMode: string) => {
    setCurrentMode(targetMode)
    const baseTasks = customTasks && targetMode === mode ? customTasks : PRESETS[targetMode] || PRESETS['document-audit']
    setTasks(JSON.parse(JSON.stringify(baseTasks)))
    setActiveStep(0)
    setOverallProgress(15)
    setIsFinished(false)
    setElapsedMs(0)
    completionCalledRef.current = false
  }

  // Reset or initialize state when dialog opens or initial mode changes
  useEffect(() => {
    if (isOpen) {
      resetForMode(mode)
    }
  }, [isOpen, mode])

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
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [isOpen, activeStep, isFinished, speedMultiplier, autoCloseDelay, onComplete, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[10080] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300 animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[640px] bg-[#0c0d10] border border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden text-gray-200">
        
        {/* Glow accent along top border */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500/20 via-blue-500 to-purple-500/30" />

        {/* Header with Title and Live Execution Indicator */}
        <div className="px-6 pt-5 pb-3 border-b border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-blue-400 font-semibold">
                  {isFinished ? 'Execution Complete' : 'AI Autonomous Engine Active'}
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                  · {(elapsedMs / 1000).toFixed(1)}s
                </span>
              </div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                {title}
              </h2>
              {documentName && (
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[450px]">
                  Target Document: <span className="text-gray-200 font-medium">“{documentName}”</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => resetForMode(currentMode)}
                className="px-2.5 py-1 text-xs text-gray-400 hover:text-white rounded-md bg-white/[0.05] hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Restart workflow animation"
              >
                <span>↺</span> Replay
              </button>

              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close workflow modal"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Workflow Preset Switcher Tabs */}
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-white/[0.05] overflow-x-auto text-[11.5px]">
            <span className="text-gray-500 font-medium text-[11px] uppercase tracking-wider flex-shrink-0">
              Pipeline:
            </span>
            <button
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                currentMode === 'document-audit'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
              onClick={() => resetForMode('document-audit')}
            >
              Document Audit
            </button>
            <button
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                currentMode === 'project-plan'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
              onClick={() => resetForMode('project-plan')}
            >
              Project Tasks (Original)
            </button>
            <button
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                currentMode === 'remediation'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
              onClick={() => resetForMode('remediation')}
            >
              Remediation
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-white/[0.05] h-1">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-emerald-400 transition-all duration-300 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Task List Component (Matching image design) */}
        <div className="p-6 space-y-4 max-h-[68vh] overflow-y-auto custom-scrollbar">
          {tasks.map((task) => {
            const isInProgress = task.status === 'in-progress'
            const isCompleted = task.status === 'completed'
            const isPending = task.status === 'pending'

            return (
              <div key={task.id} className="space-y-2">
                {/* Main Task Row */}
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-3.5 min-w-0 pr-2">
                    {/* Status Icon */}
                    {isInProgress && <DottedSpinnerIcon size={20} />}
                    {isCompleted && <CheckmarkIcon size={20} />}
                    {isPending && <PendingCircleIcon size={20} />}

                    {/* Task Title */}
                    <span
                      className={`text-[14.5px] font-normal tracking-wide transition-colors ${
                        isCompleted
                          ? 'text-gray-300'
                          : isInProgress
                          ? 'text-white font-medium drop-shadow-[0_1px_3px_rgba(255,255,255,0.15)]'
                          : 'text-gray-400'
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>

                  {/* Right Status Badge */}
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    {isInProgress && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-[#172554] text-[#93c5fd] border border-[#3b82f6]/40 shadow-[0_0_8px_rgba(59,130,246,0.25)]">
                        in-progress
                      </span>
                    )}

                    {isCompleted && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-[#06331a] text-[#86efac] border border-[#22c55e]/30">
                        completed
                      </span>
                    )}

                    {isPending && (
                      <div className="flex items-center gap-1.5">
                        {task.badges?.map((badge, bIdx) => (
                          <span
                            key={bIdx}
                            className="inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded text-[10.5px] font-mono font-bold bg-[#181b22] text-[#9ca3af] border border-white/10"
                          >
                            {badge}
                          </span>
                        ))}
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide bg-[#14161c] text-[#6b7280] border border-white/10">
                          pending
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subtask Hierarchical Tree (Dashed Left Connector) */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div className="ml-[9.5px] pl-6 border-l border-dashed border-white/20 my-2 space-y-2.5">
                    {task.subtasks.map((sub) => {
                      const subDone = sub.status === 'completed'
                      const subActive = sub.status === 'in-progress'
                      const subWarn = sub.status === 'warning'

                      return (
                        <div key={sub.id} className="flex items-center gap-3">
                          {subDone && <CheckmarkIcon size={16} />}
                          {subActive && <DottedSpinnerIcon size={16} />}
                          {subWarn && <WarningCircleIcon size={16} />}
                          {sub.status === 'pending' && <PendingCircleIcon size={16} />}

                          <span
                            className={`text-[13px] tracking-wide transition-all ${
                              subDone
                                ? 'line-through text-gray-500 font-normal'
                                : subActive
                                ? 'text-gray-100 font-medium'
                                : 'text-gray-300'
                            }`}
                          >
                            {sub.title}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer with Actions & Status */}
        <div className="px-6 py-3.5 bg-[#08090b] border-t border-white/[0.07] flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-mono">
              Rule Pack: <span className="text-gray-300">CIVIC-FAIRNESS-v4.2</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isFinished ? (
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-sm"
              >
                View Document & Results →
              </button>
            ) : (
              <span className="text-gray-400 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                Synthesizing findings...
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export default AIWorkflowProgress
