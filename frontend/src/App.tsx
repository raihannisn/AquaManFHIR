import { Activity, BookOpen, Braces, Database, FileCheck2, Files, Home, Map, MessageSquareText, Settings, Waves } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
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
  { label: 'FHIR API', to: '/api', icon: Braces },
  { label: 'Documentation', to: '/documentation', icon: BookOpen },
  { label: 'Settings', to: '/settings', icon: Settings },
]

function Shell() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  function openSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const siteId = query.trim()
    if (siteId) navigate(`/sites/${encodeURIComponent(siteId)}`)
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/" className="brand-lockup"><span className="brand-symbol"><Waves size={21} /></span><span><strong>AquaManFHIR</strong><small>OAH INTEROPERABILITY</small></span></NavLink>
      <div className="side-section-label">WORKSPACE</div>
      <nav className="side-nav">{navigation.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-status"><span className="live-dot" /><div><strong>OAH source</strong><small>Public API · monitored</small></div></div><div className="sidebar-version">IEEE GLOBAL HACKATHON 2026 <span>TRACK 7</span></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="breadcrumb-label"><span>ONEAQUAHEALTH</span><span className="crumb-slash">/</span><strong>DATA INTEROPERABILITY</strong></div><form className="site-search" onSubmit={openSite}><Map size={15} /><input aria-label="Search site ID" placeholder="Open site by ID…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>Enter</kbd></form><div className="topbar-state"><span className="live-dot" />LIVE</div></header>
      <main className="content-area"><Outlet /></main>
      <footer className="app-footer"><span>AquaManFHIR<span className="footer-muted">· Research data interoperability</span></span><span>OAH source fields preserved <span className="footer-sep">/</span> FHIR R4</span></footer>
    </div>
  </div>
}

export default function App() {
  return <Routes><Route element={<Shell />}><Route index element={<OverviewPage />} /><Route path="data-sources" element={<DataSourcesPage />} /><Route path="sites" element={<SitesPage />} /><Route path="sites/:siteId" element={<SiteWorkspacePage />} /><Route path="observations" element={<ObservationsPage />} /><Route path="fhir" element={<FhirPage />} /><Route path="validation" element={<ValidationPage />} /><Route path="agent" element={<AIAgentPage />} /><Route path="api" element={<ApiPage />} /><Route path="documentation" element={<DocumentationPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>
}
