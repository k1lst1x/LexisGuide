import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SplashScreen } from '../SplashScreen'

describe('SplashScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.sessionStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('waits for startup work, reveals the page, then completes', () => {
    const onReveal = vi.fn()
    const onComplete = vi.fn()
    render(<SplashScreen ready={false} onReveal={onReveal} onComplete={onComplete} />)

    expect(screen.getByRole('status', { name: /loading lexisguide/i })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onReveal).not.toHaveBeenCalled()

    // The splash never waits forever, even if an asset never arrives.
    act(() => { vi.advanceTimersByTime(6000) })
    expect(onReveal).toHaveBeenCalledOnce()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onComplete).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('lexisguide:splash-seen')).toBe('1')
  })

  it('can be skipped with a click', () => {
    const onComplete = vi.fn()
    render(<SplashScreen onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(1500) })
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
