import { useCallback, useEffect, useRef, useState } from 'react'

/* Real dictation, or none.

   The browser's SpeechRecognition does the transcribing and the microphone
   stream drives the level meter. When either is unavailable — an unsupported
   browser, a refused microphone, an insecure origin — this reports that
   plainly and stays off. It never invents words: a legal assistant that put
   sentences in someone's mouth would be worse than one that cannot hear. */

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const BANDS = 5

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** True when this browser can transcribe speech at all. */
export const voiceSupported = () =>
  typeof window !== 'undefined' && recognitionConstructor() !== null
  && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

export type VoiceInput = {
  supported: boolean
  recording: boolean
  /** Per-band microphone levels, 0–1, for the meter. */
  levels: number[]
  error: string
  start: () => Promise<void>
  stop: () => void
}

/**
 * @param onTranscript Called with the text so far while dictating. The caller
 *   owns the value; this only ever reports what was actually heard.
 */
export function useVoiceInput(onTranscript: (text: string) => void): VoiceInput {
  const [recording, setRecording] = useState(false)
  const [levels, setLevels] = useState<number[]>(() => new Array(BANDS).fill(0))
  const [error, setError] = useState('')
  const [supported] = useState(voiceSupported)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const frameRef = useRef<number | null>(null)
  // The callback changes on every render of the caller; hold it in a ref so the
  // recognition handlers always reach the current one without restarting.
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      try { recognition.stop() } catch { /* already stopped */ }
    }
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close().catch(() => {})
    contextRef.current = null
    setRecording(false)
    setLevels(new Array(BANDS).fill(0))
  }, [])

  // Release the microphone if the page navigates away mid-dictation.
  useEffect(() => stop, [stop])

  const start = useCallback(async () => {
    const Recognition = recognitionConstructor()
    if (!Recognition || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot transcribe speech. Please type your question.')
      return
    }
    setError('')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('LexisGuide needs microphone permission to take dictation. Please type your question instead.')
      return
    }
    streamRef.current = stream

    // The meter shows the real microphone, so silence reads as silence.
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const context = new AudioCtx()
      contextRef.current = context
      const analyser = context.createAnalyser()
      analyser.fftSize = 64
      context.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const step = Math.floor(data.length / BANDS) || 1
      const tick = () => {
        analyser.getByteFrequencyData(data)
        setLevels(Array.from({ length: BANDS }, (_, band) => {
          let sum = 0
          for (let i = 0; i < step; i += 1) sum += data[band * step + i] ?? 0
          return sum / step / 255
        }))
        frameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // No meter is fine; dictation is what matters.
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    let settled = ''

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) settled += (settled ? ' ' : '') + text.trim()
        else interim += text
      }
      onTranscriptRef.current(`${settled}${interim ? ` ${interim.trim()}` : ''}`.trim())
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone permission was refused. Please type your question instead.')
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError('Dictation stopped unexpectedly. Please try again or type your question.')
      }
      stop()
    }
    recognition.onend = () => stop()

    recognitionRef.current = recognition
    try {
      recognition.start()
      setRecording(true)
    } catch {
      setError('Dictation could not start. Please type your question.')
      stop()
    }
  }, [stop])

  return { supported, recording, levels, error, start, stop }
}
