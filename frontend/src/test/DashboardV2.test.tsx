import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DashboardV2 } from '../DashboardV2'

describe('DashboardV2', () => {
  it('navigates to the linter and displays the selected finding', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} userEmail="person@example.com" />)

    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getAllByText('Appeal filing deadline is vague')).toHaveLength(2)
  })

  it('shows the separated finding count and remediation action in Review', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByText('4 findings')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Auto-Remediate/ })).toBeInTheDocument()
  })

  it('adds a non-empty team discussion message', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Messages' }))
    await user.type(screen.getByPlaceholderText('Type a message...'), 'Please cite the appeal rule.')
    await user.click(screen.getByRole('button', { name: /Send/ }))

    expect(screen.getByText('Please cite the appeal rule.')).toBeInTheDocument()
    expect(screen.getByText('You (Reviewer)')).toBeInTheDocument()
  })

  it('opens the messages search workspace', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Messages' }))
    await user.click(screen.getByRole('button', { name: 'Search this conversation' }))

    expect(screen.getByRole('dialog', { name: 'Search messages' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search chats, people, or documents...')).toBeInTheDocument()
  })

  it('searches documents and findings from the top bar', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Search workspace' }))
    await user.type(screen.getByRole('textbox', { name: 'Search documents, issues, or rules' }), 'deadline')

    expect(screen.getByRole('dialog', { name: 'Search workspace' })).toBeInTheDocument()
    expect(screen.getByText('Appeal filing deadline is vague')).toBeInTheDocument()
  })

  it('shows the newest review announcements from notifications', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(screen.getByRole('dialog', { name: 'Latest announcements' })).toBeInTheDocument()
    expect(screen.getByText('Review ready')).toBeInTheDocument()
    expect(screen.getByText('AI scan updated')).toBeInTheDocument()
  })

  it('shows the complete account menu above the workspace', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} userEmail="user@lexisguide.gov" />)

    await user.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(screen.getAllByText('user@lexisguide.gov')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Sign Out & Exit/ })).toBeInTheDocument()
  })

  it('shows interactive workspace activity time in Profile', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.getByRole('heading', { name: 'Time in review' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Thu: 74 minutes in the workspace' }))
    expect(screen.getByText('Thu minutes')).toBeInTheDocument()
  })

  it('explains a highlighted document issue in plain language', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Documents' }))
    await user.click(screen.getByRole('button', { name: /Appeals must be submitted within the standard filing period/i }))

    expect(screen.getByText('Why it matters to you')).toBeInTheDocument()
    expect(screen.getByText(/without specifying an exact calendar date/i)).toBeInTheDocument()
    expect(screen.getByText('Recommended next step')).toBeInTheDocument()
  })

  it('does not show the document tutorial again after it is closed', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    const firstView = render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Documents' }))
    await user.click(await screen.findByRole('button', { name: 'Close tutorial' }))

    expect(window.localStorage.getItem('lexisguide:document-tutorial-seen')).toBe('1')
    firstView.unmount()

    render(<DashboardV2 onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Documents' }))

    expect(screen.queryByRole('dialog', { name: /learn the document check/i })).not.toBeInTheDocument()
  })

  it('scans pasted text and opens the full document in the reader', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Documents' }))
    const closeTutorial = screen.queryByRole('button', { name: 'Close tutorial' })
    if (closeTutorial) await user.click(closeTutorial)
    await user.click(screen.getByRole('button', { name: 'Paste text' }))

    await user.type(screen.getByLabelText('Document name'), 'My rental renewal')
    await user.type(screen.getByLabelText('Document text'), 'Either party may terminate this agreement.')
    await user.click(screen.getByRole('button', { name: 'Scan and add' }))

    expect((await screen.findAllByText('My rental renewal')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Notice period is missing')).toBeInTheDocument()
  })

  it('keeps uploaded HTML inert while extracting its readable text', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Documents' }))
    const closeTutorial = screen.queryByRole('button', { name: 'Close tutorial' })
    if (closeTutorial) await user.click(closeTutorial)

    const html = '<p>Either party may terminate this agreement.</p><img id="codeql-probe" src="x" onerror="window.__codeqlProbe = true"><script>window.__codeqlProbe = true</script>'
    const upload = new File(['fixture'], 'review.html', { type: 'text/html' })
    Object.defineProperty(upload, 'text', { value: async () => html })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()

    fireEvent.change(input!, { target: { files: [upload] } })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('review is ready')
    })
    expect(await screen.findByText('Notice period is missing')).toBeInTheDocument()
    expect(screen.getAllByText('Either party may terminate this agreement.')).not.toHaveLength(0)
    expect(document.querySelector('#codeql-probe')).toBeNull()
    expect((window as typeof window & { __codeqlProbe?: boolean }).__codeqlProbe).toBeUndefined()
  })

  it('uses the document picker to switch the overview context', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await user.click(screen.getByRole('button', { name: /Viewing.*Benefits decision.*8942-B/i }))
    const picker = screen.getByRole('listbox', { name: 'Choose a document' })
    expect(picker).toBeInTheDocument()

    await user.click(within(picker).getByRole('option', { name: /Lease agreement/i }))
    expect(screen.getByRole('button', { name: /Viewing.*Lease agreement/i })).toBeInTheDocument()
  })

  it('links a selected document to its dashboard rating bars', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    const files = screen.getByRole('listbox', { name: 'Documents in workspace' })
    expect(files).toBeInTheDocument()

    await user.click(within(files).getByRole('option', { name: /Lease agreement/i }))

    expect(screen.getByRole('img', { name: /Residential Lease Agreement.*rating breakdown: rating 62 percent/i })).toBeInTheDocument()
    expect(screen.getByText('Rating breakdown')).toBeInTheDocument()
  })

  it('sorts dashboard files by the selected review order', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort files' }), 'score-high')

    const files = screen.getByRole('listbox', { name: 'Documents in workspace' })
    expect(within(files).getAllByRole('option')[0]).toHaveTextContent('Updated benefits decision')
  })

  it('shows the document health as a simple 100-point score bar', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))

    expect(screen.getByRole('img', { name: 'Document score 54 out of 100' })).toBeInTheDocument()
    expect(screen.getByText('Document review score')).toBeInTheDocument()
  })

  it('combines findings and their rating impact in one dashboard panel', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))

    expect(screen.getByRole('heading', { name: 'How findings affect your score' })).toBeInTheDocument()
    expect(screen.getAllByText('High impact')).toHaveLength(3)
    expect(screen.getAllByText('Appeal filing deadline is vague')).not.toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'Finding activity' })).not.toBeInTheDocument()
  })

  it('previews issues on hover and keeps the category filter after a click', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    const highImpact = screen.getByRole('button', { name: /Show high impact files/i })
    fireEvent.mouseEnter(highImpact)

    expect(screen.getByText('Related high impact issues')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByText('Appeal filing deadline is vague')).toBeInTheDocument()
    expect(screen.queryByText('Consequences of inaction not fully detailed')).not.toBeInTheDocument()

    fireEvent.mouseLeave(highImpact)
    expect(screen.getByText('Consequences of inaction not fully detailed')).toBeInTheDocument()

    await user.click(highImpact)
    fireEvent.mouseLeave(highImpact)
    expect(screen.getByText('High impact findings')).toBeInTheDocument()
    expect(screen.queryByText('Consequences of inaction not fully detailed')).not.toBeInTheDocument()
  })

  it('exits through the sidebar control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DashboardV2 onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Exit Dashboard' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('returns a document-grounded chat response when the deployed AI is unavailable', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open LexisGuide assistant' }))
    await user.type(screen.getByRole('textbox', { name: 'Ask LexisGuide' }), 'What should I do about this deadline?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    expect((await screen.findAllByRole('button', { name: 'Open evidence' }, { timeout: 3_000 })).length).toBeGreaterThan(1)
    expect(screen.getAllByText('Appeal filing deadline is vague')).not.toHaveLength(0)
  })

  it('switches dashboard subpages using the persistent top navigation buttons', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Switch to Review' }))
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch to Messages' }))
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch to Documents' }))
    expect(screen.getByText('YOUR WORKSPACE')).toBeInTheDocument()
  })

  it('toggles to AI search mode and executes a natural language query', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: /AI Search/i }))
    expect(screen.getByPlaceholderText(/Ask AI about clauses/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Find termination without notice clauses/i }))
    expect(await screen.findByText('AI Synthesis & Legal Advisory')).toBeInTheDocument()
    expect(screen.getByText(/termination provisions require explicit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in Studio & Editor' })).toBeInTheDocument()
  })
})
