import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PromptComposer } from '../chat/PromptComposer'

/** Wrap it the way ChatWidget does: the value lives in the parent. */
function Harness({ onSubmit = vi.fn(), busy = false, initial = '' }) {
  const [value, setValue] = useState(initial)
  return (
    <PromptComposer
      value={value}
      onChange={setValue}
      onSubmit={(text) => { onSubmit(text); setValue('') }}
      busy={busy}
    />
  )
}

/* While collapsed the field carries aria-hidden, so it is deliberately absent
   from the accessibility tree and getByRole cannot reach it. Query the element
   itself, then assert on what a reader would be offered. */
const field = () => document.querySelector('textarea') as HTMLTextAreaElement

describe('PromptComposer', () => {
  it('starts collapsed, with the field out of the tab order', () => {
    render(<Harness />)

    expect(field()).toHaveAttribute('aria-hidden', 'true')
    expect(field()).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: 'Ask LexisGuide' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens when the collapsed pill is clicked', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))

    expect(field()).toHaveAttribute('aria-hidden', 'false')
    expect(field()).toHaveAttribute('tabindex', '0')
  })

  it('is already open when text arrives from elsewhere', () => {
    // A suggestion or "discuss this finding" fills the value before any focus.
    render(<Harness initial="Explain the termination clause" />)

    expect(field()).toHaveAttribute('aria-hidden', 'false')
  })

  it('sends on Enter and collapses again once emptied', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))
    await user.type(field(), 'What does indemnify mean?')
    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledWith('What does indemnify mean?')
    expect(field()).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps Shift+Enter for a new line instead of sending', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))
    await user.type(field(), 'First line{Shift>}{Enter}{/Shift}second line')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(field()).toHaveValue('First line\nsecond line')
  })

  it('will not send blank text or send while an answer is in flight', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { rerender } = render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))
    await user.type(field(), '   ')
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled()

    rerender(<Harness onSubmit={onSubmit} busy initial="A real question" />)
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled()
  })

  it('stays open while it holds text the person has not sent', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Ask LexisGuide' }))
    await user.type(field(), 'half a thought')
    await user.tab()

    expect(field()).toHaveAttribute('aria-hidden', 'false')
  })
})
