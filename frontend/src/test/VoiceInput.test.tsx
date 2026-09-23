import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PromptComposer } from '../chat/PromptComposer'

/** A stand-in for the browser's SpeechRecognition, driven by the test. */
class FakeRecognition {
  static last: FakeRecognition | null = null
  continuous = false
  interimResults = false
  lang = ''
  started = false
  stopped = false
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error?: string }) => void) | null = null
  onend: (() => void) | null = null

  constructor() { FakeRecognition.last = this }
  start() { this.started = true }
  stop() { this.stopped = true }

  /** Deliver what was actually "heard". */
  hear(transcript: string, isFinal = true) {
    const results = [Object.assign([{ transcript }], { isFinal })]
    this.onresult?.({ resultIndex: 0, results })
  }
}

function Harness({ onSubmit = vi.fn() }) {
  const [value, setValue] = useState('')
  return (
    <PromptComposer
      value={value}
      onChange={setValue}
      onSubmit={(text) => { onSubmit(text); setValue('') }}
      voice
    />
  )
}

const stubMic = (getUserMedia: () => Promise<MediaStream>) => {
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
}

const silentStream = () => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream)

beforeEach(() => { FakeRecognition.last = null })
afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('Voice input', () => {
  it('offers dictation and transcribes only what was heard', async () => {
    const user = userEvent.setup()
    stubMic(silentStream)
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Dictate your question' }))
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(true))

    FakeRecognition.last!.hear('what does indemnify mean')

    await waitFor(() => {
      expect(document.querySelector('textarea')).toHaveValue('what does indemnify mean')
    })
    // The button becomes a stop control while listening.
    expect(screen.getByRole('button', { name: 'Stop dictation' })).toBeInTheDocument()
  })

  it('puts no words in the box when nothing is heard', async () => {
    const user = userEvent.setup()
    stubMic(silentStream)
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Dictate your question' }))
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(true))

    // Silence stays silence: no simulated or placeholder transcript.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.querySelector('textarea')).toHaveValue('')
  })

  it('stops dictating and releases the microphone on request', async () => {
    const user = userEvent.setup()
    const stopTrack = vi.fn()
    stubMic(() => Promise.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream))
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Dictate your question' }))
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(true))
    FakeRecognition.last!.hear('a question')

    await user.click(await screen.findByRole('button', { name: 'Stop dictation' }))

    await waitFor(() => expect(stopTrack).toHaveBeenCalled())
    expect(FakeRecognition.last!.stopped).toBe(true)
  })

  it('explains a refused microphone instead of pretending to listen', async () => {
    const user = userEvent.setup()
    stubMic(() => Promise.reject(new Error('NotAllowedError')))
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Dictate your question' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('microphone permission')
    expect(document.querySelector('textarea')).toHaveValue('')
  })

  it('says dictation is unavailable when the browser cannot transcribe', () => {
    // No SpeechRecognition on this window at all.
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
    render(<Harness />)

    expect(screen.getByText(/Dictation needs Chrome, Edge or Safari/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dictate your question' })).not.toBeInTheDocument()
  })

  it('sends the dictated text as an ordinary question', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    stubMic(silentStream)
    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Dictate your question' }))
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(true))
    FakeRecognition.last!.hear('explain this clause')
    await waitFor(() => expect(document.querySelector('textarea')).toHaveValue('explain this clause'))

    await user.click(screen.getByRole('button', { name: 'Stop dictation' }))
    await user.click(await screen.findByRole('button', { name: 'Send question' }))

    expect(onSubmit).toHaveBeenCalledWith('explain this clause')
  })
})
