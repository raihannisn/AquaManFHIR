import { Activity, BookOpen, Braces, Database, FileCheck2, Files, Home, Map, MessageSquareText, MoreHorizontal, Settings, Waves } from 'lucide-react'
import { useEffect, useState, type SyntheticEvent } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api } from './services/api'
import { AIAgentPage } from './pages/AIAgentPage'
import { DataSourcesPage, ApiPage, DocumentationPage, SettingsPage } from './pages/ReferencePages'
import { FhirPage, ValidationPage } from './pages/FhirPages'
import { ObservationsPage, SiteWorkspacePage, SitesPage } from './pages/WorkspacePages'
import { OverviewPage } from './pages/OverviewPage'
import './App.css'

const navigation = [
  { label: 'Overview', to: '/', icon: Home, end: true },
  { label: 'Data Sources', to: '/data-sources', icon: Database },
  { label: 'Sites', to: '/sites', icon: Map },
  { label: 'Observations', to: '/observations', icon: Activity },
  { label: 'FHIR Resources', to: '/fhir', icon: Files },
  { label: 'Validation', to: '/validation', icon: FileCheck2 },
  { label: 'AI Agent', to: '/agent', icon: MessageSquareText },
  { label: 'FHIR API', to: '/fhir-api', icon: Braces },
  { label: 'Documentation', to: '/documentation', icon: BookOpen },
  { label: 'Settings', to: '/settings', icon: Settings },
]
const mobilePrimaryPaths = new Set(['/', '/sites', '/observations', '/fhir', '/agent'])
const mobilePrimaryNavigation = navigation.filter(({ to }) => mobilePrimaryPaths.has(to))
const mobileMoreNavigation = navigation.filter(({ to }) => !mobilePrimaryPaths.has(to))
const mobileLabels: Record<string, string> = { Overview: 'Home', 'FHIR Resources': 'FHIR', 'AI Agent': 'AI' }

type SourceStatus = 'checking' | 'available' | 'partial' | 'unavailable' | 'cached'

const sourceStatusCopy: Record<SourceStatus, { label: string; detail: string }> = {
  checking: { label: 'CHECKING', detail: 'Checking public API' },
  available: { label: 'OAH AVAILABLE', detail: 'Latest request succeeded' },
  partial: { label: 'PARTIAL DATA', detail: 'Some source layers unavailable' },
  unavailable: { label: 'OAH UNAVAILABLE', detail: 'Latest request failed' },
  cached: { label: 'CACHED SNAPSHOT', detail: 'Live source unreachable' },
}

function Shell() {
  const [query, setQuery] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>('checking')
  const [cachedSnapshotAt, setCachedSnapshotAt] = useState<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const moreActive = mobileMoreNavigation.some(({ to }) => location.pathname === to || location.pathname.startsWith(`${to}/`))
  useEffect(() => {
    let active = true
    api.getSites().then((data) => {
      if (active) {
        setSourceStatus(data.isCached ? 'cached' : data.sourceErrors.length ? 'partial' : 'available')
        setCachedSnapshotAt(data.isCached ? data.retrievedAt : null)
      }
    }).catch(() => {
      if (active) setSourceStatus('unavailable')
    })
    return () => { active = false }
  }, [])
  function openSite(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const siteId = query.trim()
    if (siteId) void navigate(`/sites/${encodeURIComponent(siteId)}`)
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/" className="brand-lockup"><span className="brand-symbol"><Waves size={21} /></span><span><strong>AquaManFHIR</strong><small>OAH INTEROPERABILITY</small></span></NavLink>
      <div className="side-section-label">WORKSPACE</div>
      <nav className="side-nav side-nav-desktop" aria-label="Workspace">{navigation.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
      <nav className="mobile-side-nav" aria-label="Primary navigation">{mobilePrimaryNavigation.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} title={label} aria-label={label} className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{mobileLabels[label] ?? label}</span></NavLink>)}<button type="button" className={`mobile-nav-more${moreOpen || moreActive ? ' active' : ''}`} aria-label="More navigation" aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={() => setMoreOpen((open) => !open)} onKeyDown={(event) => { if (event.key === 'Escape') setMoreOpen(false) }}><MoreHorizontal size={18} /><span>More</span></button></nav>
      {moreOpen && <div id="mobile-more-menu" className="mobile-more-menu" role="menu" onKeyDown={(event) => { if (event.key === 'Escape') setMoreOpen(false) }}>{mobileMoreNavigation.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} role="menuitem" className={({ isActive }) => `mobile-more-link${isActive ? ' active' : ''}`} onClick={() => setMoreOpen(false)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</div>}
      <div className="sidebar-bottom"><div className="sidebar-status"><span className={`source-state-dot source-state-${sourceStatus}`} /><div><strong>OAH API</strong><small>{sourceStatusCopy[sourceStatus].detail}</small></div></div><div className="sidebar-version">IEEE GLOBAL HACKATHON 2026 <span>TRACK 7</span></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="breadcrumb-label"><span>ONEAQUAHEALTH</span><span className="crumb-slash">/</span><strong>DATA INTEROPERABILITY</strong></div><form className="site-search" onSubmit={openSite}><Map size={15} /><input aria-label="Search site ID" placeholder="Open site by ID…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>Enter</kbd></form><div className="topbar-state"><span className={`source-state-dot source-state-${sourceStatus}`} />{sourceStatusCopy[sourceStatus].label}</div></header>
      <main className="content-area">
        {cachedSnapshotAt && <div className="cache-warning" role="status">Showing cached OAH snapshot from {new Date(cachedSnapshotAt).toLocaleString()}; the live source is unreachable.</div>}
        <Outlet />
      </main>
      <footer className="app-footer"><span>AquaManFHIR<span className="footer-muted">· Research data interoperability</span></span><span>OAH source fields preserved <span className="footer-sep">/</span> FHIR R4</span></footer>
    </div>
  </div>
}

export default function App() {
  return <Routes><Route element={<Shell />}><Route index element={<OverviewPage />} /><Route path="data-sources" element={<DataSourcesPage />} /><Route path="sites" element={<SitesPage />} /><Route path="sites/:siteId" element={<SiteWorkspacePage />} /><Route path="observations" element={<ObservationsPage />} /><Route path="fhir" element={<FhirPage />} /><Route path="validation" element={<ValidationPage />} /><Route path="agent" element={<AIAgentPage />} /><Route path="fhir-api" element={<ApiPage />} /><Route path="documentation" element={<DocumentationPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>
}
