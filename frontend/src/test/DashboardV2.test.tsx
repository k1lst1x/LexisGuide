import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardV2 } from '../DashboardV2'

vi.mock('../aws', () => ({ cognitoGetIdToken: vi.fn().mockResolvedValue(null) }))

// The AI service is offline in tests, so every flow exercises the local, document-grounded fallback.
beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})
afterEach(() => vi.unstubAllGlobals())

const renderWorkspace = (props: Partial<Parameters<typeof DashboardV2>[0]> = {}) =>
  render(<DashboardV2 onClose={vi.fn()} {...props} />)

describe('Workspace navigation', () => {
  it('opens Home by default with scores, categories, and the most urgent document', () => {
    renderWorkspace()

    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Document scores' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open findings by category' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Document score 54 out of 100' })).toBeInTheDocument()
  })

  it('opens a document in Review from its score bar', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Lease agreement: score 62 out of 100' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Viewing Lease agreement/ })).toBeInTheDocument()
  })

  it('remembers the last section', () => {
    window.localStorage.setItem('lexisguide:last-section', 'chain')
    renderWorkspace()

    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Score rose from 54 to 89/ })).toBeInTheDocument()
  })

  it('exits through the sidebar control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWorkspace({ onClose })

    await user.click(screen.getByRole('button', { name: 'Exit Dashboard' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Review workflow', () => {
  it('shows the first finding with its explanation, evidence, and next step', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByText('4 findings')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Appeal filing deadline is vague' })).toBeInTheDocument()
    expect(screen.getByText('Why it matters to you')).toBeInTheDocument()
    expect(screen.getByText('Recommended next step')).toBeInTheDocument()
  })

  it('marks a finding resolved and moves to the next open one', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: /Mark resolved/ }))

    expect(screen.getByRole('progressbar', { name: 'Findings resolved' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('heading', { level: 2, name: 'Appeal destination & filing procedure missing' })).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('lexisguide:resolved-findings') ?? '{}')).toEqual({ 'doc-1': ['f-1'] })
  })

  it('explains a highlighted passage in plain language', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    // Highlights are named after the finding they mark, not the passage text.
    await user.click(screen.getByRole('button', { name: /^Finding: .*Appeal destination & filing procedure missing/ }))

    expect(screen.getByRole('heading', { level: 2, name: 'Appeal destination & filing procedure missing' })).toBeInTheDocument()
    expect(screen.getByText(/does not provide an address, URL, form number/i)).toBeInTheDocument()
  })

  it('switches documents from the review switcher', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: /Viewing Benefits decision · #8942-B/ }))
    const picker = screen.getByRole('listbox', { name: 'Choose a document' })
    await user.click(within(picker).getByRole('option', { name: /Lease agreement/ }))

    expect(screen.getByRole('button', { name: /Viewing Lease agreement/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Repair responsibility boundaries ambiguous' })).toBeInTheDocument()
  })

  it('keeps Mark resolved counts in the sidebar badge', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    const reviewNav = screen.getByRole('button', { name: 'Review' })
    expect(within(reviewNav).getByText('6')).toBeInTheDocument()

    await user.click(reviewNav)
    await user.click(screen.getByRole('button', { name: /Mark resolved/ }))
    expect(within(screen.getByRole('button', { name: 'Review' })).getByText('5')).toBeInTheDocument()
  })
})

describe('Adding documents', () => {
  it('scans pasted text and opens it in Review', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getAllByRole('button', { name: /Add document/ })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add a document' })
    await user.click(within(dialog).getByRole('tab', { name: /Paste text/ }))
    await user.type(within(dialog).getByLabelText('Document name'), 'My rental renewal')
    await user.type(within(dialog).getByLabelText('Document text'), 'Either party may terminate this agreement.')
    await user.click(within(dialog).getByRole('button', { name: 'Scan and add' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Notice period is missing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Viewing My rental renewal/ })).toBeInTheDocument()
  })

  it('keeps uploaded HTML inert while extracting its readable text', async () => {
    renderWorkspace()
    const html = '<p>Either party may terminate this agreement.</p><img id="codeql-probe" src="x" onerror="window.__codeqlProbe = true"><script>window.__codeqlProbe = true</script>'
    const upload = new File(['fixture'], 'review.html', { type: 'text/html' })
    Object.defineProperty(upload, 'text', { value: async () => html })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()

    fireEvent.change(input!, { target: { files: [upload] } })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('review is ready'))
    expect(screen.getByRole('heading', { level: 2, name: 'Notice period is missing' })).toBeInTheDocument()
    expect(document.getElementById('codeql-probe')).toBeNull()
    expect((window as Window & { __codeqlProbe?: boolean }).__codeqlProbe).toBeUndefined()
  })

  it('sorts documents by score', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Documents' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort files' }), 'score-high')

    const rows = within(screen.getByRole('list', { name: 'Documents in workspace' })).getAllByRole('listitem')
    expect(within(rows[0]).getByText('Revised Notice of Benefits Denial (Remediated)')).toBeInTheDocument()
  })
})

describe('Search and notifications', () => {
  it('searches documents and findings from the top bar', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Search workspace' }))
    await user.type(screen.getByRole('textbox', { name: 'Search documents, issues, or rules' }), 'deadline')

    const panel = screen.getByRole('dialog', { name: 'Search workspace' })
    expect(within(panel).getByText('Appeal filing deadline is vague')).toBeInTheDocument()
  })

  it('answers AI search questions from workspace evidence when the service is offline', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Search workspace' }))
    await user.click(screen.getByRole('tab', { name: /AI Search/ }))
    await user.click(screen.getByRole('button', { name: 'Find termination without notice clauses' }))

    expect(await screen.findByText(/termination provisions require explicit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in Review' })).toBeInTheDocument()
  })

  it('shows the latest announcements', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    const panel = screen.getByRole('dialog', { name: 'Latest announcements' })
    expect(within(panel).getByText('Review ready')).toBeInTheDocument()
    expect(within(panel).getByText('AI scan updated')).toBeInTheDocument()
  })

  it('shows the account menu and signs out', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    renderWorkspace({ userEmail: 'user@lexisguide.gov', onSignOut })

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByText('user@lexisguide.gov')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Sign Out & Exit/ }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})

describe('Collaboration and settings', () => {
  it('sends a team message', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Messages' }))
    await user.type(screen.getByPlaceholderText('Type a message...'), 'Please cite the appeal rule.')
    await user.click(screen.getByRole('button', { name: /Send/ }))

    expect(screen.getByText('Please cite the appeal rule.')).toBeInTheDocument()
    expect(screen.getByText('You (Reviewer)')).toBeInTheDocument()
  })

  it('opens message search', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Messages' }))
    await user.click(screen.getByRole('button', { name: 'Search this conversation' }))

    expect(screen.getByRole('dialog', { name: 'Search messages' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search chats, people, or documents...')).toBeInTheDocument()
  })

  it('hands a finding to the team as a draft message', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: /Discuss/ }))

    expect(screen.getByPlaceholderText('Type a message...')).toHaveValue('Could we review “Appeal filing deadline is vague” in Benefits decision · #8942-B? ')
  })

  it('shows interactive time in review on Settings', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('heading', { name: 'Time in review' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thu: 74 minutes in the workspace' }))
    expect(screen.getByText('Thu minutes')).toBeInTheDocument()
  })
})

describe('Assistant popup', () => {
  it('answers from the workspace when the live agent is unavailable', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Open LexisGuide assistant' }))
    await user.type(screen.getByRole('textbox', { name: 'Ask LexisGuide' }), 'What should I do about this deadline?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText(/The current review point is/)).toBeInTheDocument()
    expect(screen.getByText(/Sign in to talk with the live AI agent/)).toBeInTheDocument()
  })

  it('asks about a finding straight from Review', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: /Ask assistant/ }))

    const chat = screen.getByRole('dialog', { name: 'Ask LexisGuide' })
    expect(within(chat).getByText(/Explain “Appeal filing deadline is vague” in plain language/)).toBeInTheDocument()
    expect(await within(chat).findByText(/The current review point is/)).toBeInTheDocument()
  })
})
