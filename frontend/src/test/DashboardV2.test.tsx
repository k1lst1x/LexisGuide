import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    expect(await screen.findAllByText('My rental renewal')).toHaveLength(2)
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
    expect(screen.getByRole('listbox', { name: 'Choose a document' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: /Lease agreement/i }))
    expect(screen.getByRole('button', { name: /Viewing.*Lease agreement/i })).toBeInTheDocument()
  })

  it('shows the interactive document score signal on the dashboard', async () => {
    const user = userEvent.setup()
    render(<DashboardV2 onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(screen.getByRole('img', { name: 'Interactive document score signal' })).toBeInTheDocument()
    expect(screen.getByText('live score model')).toBeInTheDocument()
  })

  it('exits through the sidebar control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DashboardV2 onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Exit Dashboard' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
