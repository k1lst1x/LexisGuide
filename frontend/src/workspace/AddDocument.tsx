import { useRef, useState } from 'react'
import { Check, ClipboardPaste, Loader2, UploadCloud, X } from 'lucide-react'
import { useWorkspace, type AddStage } from './store'

const STAGES: Array<{ key: AddStage; label: string }> = [
  { key: 'reading', label: 'Reading the text' },
  { key: 'checking', label: 'Checking clauses' },
  { key: 'scoring', label: 'Scoring and highlighting' },
  { key: 'done', label: 'Ready to review' },
]

export function AddDocument() {
  const ws = useWorkspace()
  const [tab, setTab] = useState<'upload' | 'paste'>('upload')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const working = ws.addStage === 'reading' || ws.addStage === 'checking' || ws.addStage === 'scoring'
  const stageIndex = STAGES.findIndex((s) => s.key === ws.addStage)

  const close = () => {
    if (working) return
    ws.setAddOpen(false)
    ws.setAddStage('idle')
  }
  const submit = async (input: { file: File } | { title: string; text: string }) => {
    const doc = await ws.addDocument(input)
    if (doc) {
      setTitle('')
      setText('')
      window.setTimeout(() => { ws.setAddOpen(false); ws.setAddStage('idle') }, 650)
    }
  }

  return (
    <>
      {/* Kept mounted so drag-and-drop and file pickers work even while the dialog is closed. */}
      <input ref={inputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void submit({ file }); event.target.value = '' }} />
      {ws.addOpen && (
        <div className="ws-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
          <div className="ws-dialog" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <header className="ws-dialog-head">
              <div><h2 id="add-title">Add a document</h2><p>LexisGuide reads it, flags unclear or risky terms, and opens it in Review.</p></div>
              <button type="button" className="ws-icon-btn" aria-label="Close" onClick={close} disabled={working}><X size={16} /></button>
            </header>

            {ws.addStage === 'idle' || ws.addStage === 'error' ? <>
              <div className="ws-segment ws-segment-full" role="tablist" aria-label="How to add">
                <button type="button" role="tab" aria-selected={tab === 'upload'} className={tab === 'upload' ? 'is-active' : ''} onClick={() => setTab('upload')}><UploadCloud size={14} /> Upload file</button>
                <button type="button" role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'is-active' : ''} onClick={() => setTab('paste')}><ClipboardPaste size={14} /> Paste text</button>
              </div>

              {tab === 'upload' ? (
                <button
                  type="button"
                  className={`ws-drop ${dragging ? 'is-over' : ''}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file) void submit({ file }) }}
                >
                  <UploadCloud size={26} />
                  <strong>Drop a file here, or click to choose</strong>
                  <small>PDF, Word (.docx), HTML, RTF or text. Scanned PDFs need pasted text.</small>
                </button>
              ) : (
                <form className="ws-paste" onSubmit={(event) => { event.preventDefault(); void submit({ title, text }) }}>
                  <label className="ws-field"><span>Document name</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Lease renewal 2026" aria-label="Document name" /></label>
                  <label className="ws-field"><span>Document text</span><textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} placeholder="Paste the full text of the notice or agreement" aria-label="Document text" /></label>
                  <button type="submit" className="ws-btn ws-btn-dark" disabled={!text.trim()}>Scan and add</button>
                </form>
              )}

              <label className="ws-field ws-field-inline"><span>Jurisdiction <em>(optional)</em></span><input value={ws.jurisdiction} onChange={(event) => ws.setJurisdiction(event.target.value)} placeholder="e.g. Illinois, USA" aria-label="Jurisdiction" /></label>
              {ws.addStage === 'error' && <p className="ws-error" role="alert">{ws.addMessage}</p>}
            </> : (
              <div className="ws-stages" role="status" aria-live="polite">
                <p className="ws-stages-msg">{ws.addMessage}</p>
                <ol>
                  {STAGES.map((stage, index) => {
                    const state = index < stageIndex || ws.addStage === 'done' ? 'done' : index === stageIndex ? 'active' : 'next'
                    return (
                      <li key={stage.key} className={`is-${state}`}>
                        <span>{state === 'done' ? <Check size={13} /> : state === 'active' ? <Loader2 size={13} className="ws-spin" /> : index + 1}</span>
                        {stage.label}
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
