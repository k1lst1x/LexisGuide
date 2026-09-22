import { Activity, FileText, Home, Layers, LogOut, MessageSquare, PanelLeft, Plus, Settings, Sparkles } from 'lucide-react'
import { WorkspaceProvider, useWorkspace } from './store'
import { documentDisplayName, openFindings, type NavItem } from './data'
import { HomeView } from './views/HomeView'
import { DocumentsView } from './views/DocumentsView'
import { ReviewView } from './views/ReviewView'
import { ActivityView } from './views/ActivityView'
import { MessagesView } from './views/MessagesView'
import { SettingsView } from './views/SettingsView'
import { AssistantView } from './views/AssistantView'
import { WorkspaceChat } from './WorkspaceChat'
import { AddDocument } from './AddDocument'
import { AccountMenu, Notifications, SearchBox } from './TopBar'
import { ScoreDot } from './ui'
import { useState } from 'react'
import './workspace.css'

const NAV: Array<{ group: string; items: Array<{ key: NavItem; label: string; icon: typeof Home }> }> = [
  { group: 'Review', items: [
    { key: 'overview', label: 'Home', icon: Home },
    { key: 'assistant', label: 'AI Assistant', icon: Sparkles },
    { key: 'documents', label: 'Documents', icon: FileText },
    { key: 'linter', label: 'Review', icon: Layers },
  ] },
  { group: 'Collaborate', items: [
    { key: 'team', label: 'Messages', icon: MessageSquare },
    { key: 'chain', label: 'Activity', icon: Activity },
  ] },
]
const ALL_NAV = [...NAV.flatMap((g) => g.items), { key: 'settings' as NavItem, label: 'Settings', icon: Settings }]

function Shell({ onClose, onSignOut }: { onClose: () => void; onSignOut?: () => void }) {
  const ws = useWorkspace()
  const [collapsed, setCollapsed] = useState(false)
  const current = ALL_NAV.find((item) => item.key === ws.nav) ?? ALL_NAV[0]
  const badge = (key: NavItem) => key === 'linter' ? ws.stats.open.length : key === 'team' ? ws.tasks.filter((t) => !t.completed).length : 0

  return (
    <div className={`ws ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="ws-side" aria-label="Workspace navigation">
        <div className="ws-brand">
          <button type="button" className="ws-brand-mark" onClick={() => ws.go('overview')} aria-label="Open Home" title="Open Home">
            <svg viewBox="0 0 32 32" width="18" height="18"><path d="M6 26C6 15 13 6 27 5c-1 13-9 21-21 21Z" fill="currentColor" /><path d="M9 23c4-5 8-9 14-13" stroke="#fffaeb" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
          </button>
          {!collapsed && <span className="ws-brand-name">LexisGuide</span>}
          <button type="button" className="ws-icon-btn" onClick={() => setCollapsed((v) => !v)} aria-label="Toggle sidebar" aria-expanded={!collapsed}><PanelLeft size={16} /></button>
        </div>

        <button type="button" className="ws-new" onClick={() => ws.setAddOpen(true)} title="Add document">
          <Plus size={16} />{!collapsed && <span>Add document</span>}
        </button>

        <nav className="ws-nav">
          {NAV.map((group) => (
            <div key={group.group} className="ws-nav-group">
              {!collapsed && <span className="ws-rail-label">{group.group}</span>}
              {group.items.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" className={`ws-nav-btn ${ws.nav === key ? 'is-active' : ''}`} onClick={() => ws.go(key)} aria-label={label} aria-current={ws.nav === key ? 'page' : undefined} title={label}>
                  <Icon size={17} />
                  {!collapsed && <span>{label}</span>}
                  {!collapsed && badge(key) > 0 && <em>{badge(key)}</em>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {!collapsed && (
          <div className="ws-recent">
            <span className="ws-rail-label">Recent documents</span>
            {ws.documents.slice(0, 5).map((doc) => (
              <button key={doc.id} type="button" className={`ws-recent-item ${doc.id === ws.selected.id ? 'is-active' : ''}`} onClick={() => ws.openInReview(doc)} title={doc.title}>
                <span>{documentDisplayName(doc)}</span>
                {openFindings(doc, ws.resolved[doc.id]).length ? <ScoreDot score={doc.score} /> : <em className="ws-ok">✓</em>}
              </button>
            ))}
          </div>
        )}

        <div className="ws-side-foot">
          <button type="button" className={`ws-nav-btn ${ws.nav === 'settings' ? 'is-active' : ''}`} onClick={() => ws.go('settings')} aria-label="Settings" title="Settings"><Settings size={17} />{!collapsed && <span>Settings</span>}</button>
          <button type="button" className="ws-nav-btn" onClick={onClose} aria-label="Exit Dashboard" title="Exit to homepage"><LogOut size={17} />{!collapsed && <span>Exit Dashboard</span>}</button>
        </div>
      </aside>

      <div className="ws-main">
        <header className="ws-top">
          <span className="ws-crumb"><current.icon size={15} /> {current.label}</span>
          <SearchBox />
          <div className="ws-top-right">
            <Notifications />
            <AccountMenu onSignOut={onSignOut} onClose={onClose} />
          </div>
        </header>
        <main className="ws-content" key={ws.nav}>
          {ws.nav === 'overview' && <HomeView />}
          {ws.nav === 'assistant' && <AssistantView />}
          {ws.nav === 'documents' && <DocumentsView />}
          {ws.nav === 'linter' && <ReviewView />}
          {ws.nav === 'chain' && <ActivityView />}
          {ws.nav === 'team' && <MessagesView />}
          {ws.nav === 'settings' && <SettingsView />}
        </main>
      </div>

      {ws.nav !== 'assistant' && <WorkspaceChat />}
      <AddDocument />
      {ws.notice && <div className="ws-toast" role="status">{ws.notice}<button type="button" aria-label="Dismiss" onClick={() => ws.setNotice('')}>×</button></div>}

      <nav className="ws-tabbar" aria-label="Mobile navigation">
        {ALL_NAV.filter((item) => item.key !== 'chain').map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" className={ws.nav === key ? 'is-active' : ''} onClick={() => ws.go(key)} aria-label={`Open ${label} from mobile navigation`}><Icon size={18} /><span>{label}</span></button>
        ))}
      </nav>
    </div>
  )
}

export function Workspace({ onClose, onSignOut, userEmail }: { onClose: () => void; onSignOut?: () => void; userEmail?: string }) {
  return (
    <WorkspaceProvider userEmail={userEmail}>
      <Shell onClose={onClose} onSignOut={onSignOut} />
    </WorkspaceProvider>
  )
}
