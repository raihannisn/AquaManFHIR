import { ArrowUpRight, BookOpen, CheckCircle2, CircleAlert, Code2, Database, ExternalLink, MapPin, MessageSquareText, Radio, RefreshCw, ShieldCheck, Waves } from 'lucide-react'
import { FileText, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState, LoadingState, PageHeading } from '../components/ui'
import { api, type DocumentationPage as DocumentationContent, type RuntimeHealth, type SiteListData } from '../services/api'

const sourceApiEndpoints = ['/api/cities/all', '/api/sites/all', '/api/resilience-map/health-risks', '/api/resilience-map/urban-parameters']

export function DataSourcesPage() {
  const [data, setData] = useState<SiteListData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.getSites().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Source status could not be retrieved.')) }, [])
  const healthAvailable = !data?.sourceErrors.some((item) => item.endpoint.includes('health-risks'))
  const urbanAvailable = !data?.sourceErrors.some((item) => item.endpoint.includes('urban-parameters'))
  const sitesStatus = getSourceStatus(data, true)
  const healthStatus = getSourceStatus(data, healthAvailable)
  const urbanStatus = getSourceStatus(data, urbanAvailable)
  return <>
    <PageHeading eyebrow="INTEGRATIONS / PUBLIC SOURCE DISCOVERY" title="Data sources" description="Current request status and access limits documented during inspection of OneAquaHealth's public apps and API traffic." action={data && <span className="source-stamp"><span className={data.isCached ? 'source-state-dot source-state-partial' : 'live-dot'} />{data.isCached ? 'CACHED SNAPSHOT' : 'RETRIEVED'} {new Date(data.retrievedAt).toLocaleTimeString()}</span>} />
    {error && <div className="alert alert-danger">{error}</div>}
    {!data && !error && <LoadingState message="Checking OneAquaHealth source availability..." />}
    {data?.items.length === 0 && <EmptyState title="No research sites returned" detail="The source response contains no sites to summarize." />}
    <div className="source-cards-grid"><SourceCard icon={<MapPin size={19} />} name="Research sites" status={sitesStatus.label} statusTone={sitesStatus.tone} record={data ? `${data.recordCounts.sites} sites · ${data.recordCounts.cities} cities` : 'Loading source count…'} endpoint="GET /api/sites/all" detail="Site code, name, city, coordinates and altitude from the public Resilience Map API." /><SourceCard icon={<Waves size={19} />} name="Health & ecosystem risk" status={healthStatus.label} statusTone={healthStatus.tone} record={data ? `${data.recordCounts.healthRiskRecords} records` : 'Loading source count…'} endpoint="GET /api/resilience-map/health-risks" detail="Sampling date and scaled pathogen, faecal, ARG and health risk values." /><SourceCard icon={<Radio size={19} />} name="Urban parameters" status={urbanStatus.label} statusTone={urbanStatus.tone} record={data ? `${data.recordCounts.urbanParameterRecords} records` : 'Loading source count…'} endpoint="GET /api/resilience-map/urban-parameters" detail="Distances, vegetation, density, urban and impervious-surface indicators." /><SourceCard icon={<Database size={19} />} name="Citizen Science API" status="DOCUMENTED" statusTone="review" record="Endpoints and DTOs listed in Swagger" endpoint="https://api.enora-oah.eu/swagger-ui/index.html" detail="Citizen submission endpoints are documented; authentication, access permissions, and payload semantics are not verified. This prototype does not ingest these records." /><SourceCard icon={<Code2 size={19} />} name="OAH FHIR guidance" status="NOT FOUND" statusTone="review" record="No profile contract verified" endpoint="Public project pages inspected" detail="Resources use standard FHIR R4 types; no OAH profile conformance is claimed." /></div>
    <section className="panel-card mt-3"><div className="panel-heading"><div><div className="eyebrow">UPSTREAM INTEGRATION</div><h2>Official Resilience Map API</h2></div><span className="badge-status badge-generated">{sourceApiEndpoints.length} ENDPOINTS OBSERVED</span></div><div className="endpoint-list">{sourceApiEndpoints.map((endpoint) => <div className="endpoint-row" key={endpoint}><span className="http-method">GET</span><code>https://api.enora-oah.eu{endpoint}</code><CheckCircle2 size={15} className="endpoint-ok" /></div>)}</div><div className="panel-footer-note">These Resilience Map requests returned HTTP 200 on 2026-10-01. The upstream also publishes OpenAPI documentation; no version guarantee or unit catalogue was located.</div></section>
  </>
}

function getSourceStatus(data: SiteListData | null, available: boolean): { label: string; tone: string } {
  if (!data) return { label: 'CHECKING', tone: 'review' }
  if (data.isCached) return { label: 'CACHED', tone: 'warning' }
  return available ? { label: 'AVAILABLE', tone: 'live' } : { label: 'UNAVAILABLE', tone: 'off' }
}

function SourceCard({ icon, name, status, statusTone, record, endpoint, detail }: { icon: React.ReactNode; name: string; status: string; statusTone: string; record: string; endpoint: string; detail: string }) {
  return <article className="source-card"><div className="source-card-top"><span className="source-icon source-ok">{icon}</span><span className={`badge-status badge-${statusTone}`}>{status}</span></div><h2>{name}</h2><strong className="source-record-count">{record}</strong><code className="source-endpoint">{endpoint}</code><p>{detail}</p></article>
}

const endpoints = [
  ['GET', '/api/health', 'Report backend readiness and non-secret runtime configuration.'],
  ['GET', '/api/sites', 'Retrieve the public OneAquaHealth site catalogue and available record counts.'],
  ['GET', '/api/sites/:id', 'Retrieve site detail, raw records and source provenance.'],
  ['GET', '/api/sites/:id/observations', 'Return normalized environmental observation values.'],
  ['GET', '/api/sites/:id/citizen-observations', 'Report that citizen-science data is not integrated into this prototype.'],
  ['POST', '/api/fhir/convert/site/:id', 'Map available source records into FHIR R4 resources.'],
  ['GET', '/api/fhir/resources/:id', 'Retrieve a generated resource from the in-memory repository.'],
  ['POST', '/api/fhir/validate', 'Validate a resource using implemented structural and quality checks.'],
  ['POST', '/api/fhir/bundle/:siteId', 'Generate a FHIR R4 collection Bundle for a research site.'],
  ['POST', '/api/ai/query', 'Query the controlled Gemini data agent.'],
  ['GET', '/api/docs/:name', 'Retrieve one whitelisted project document.'],
  ['GET', '/fhir/metadata', 'FHIR R4 CapabilityStatement for direct read access.'],
  ['GET', '/fhir/Location/:id', 'Read a FHIR Location using application/fhir+json.'],
  ['GET', '/fhir/Observation/:id', 'Read a FHIR Observation using application/fhir+json.'],
  ['GET', '/fhir/Provenance/:id', 'Read source and transformation provenance.'],
  ['GET', '/fhir/Bundle/:id', 'Read a FHIR collection Bundle directly.'],
]

export function ApiPage() {
  return <>
    <PageHeading eyebrow="DEVELOPER INTERFACE / EXPRESS" title="FHIR API" description="Backend contract for applications that need normalized OAH source data and interoperable FHIR output." action={<span className="base-url"><span className="live-dot" />BASE URL <code>/api</code></span>} />
    <section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">ENDPOINT REFERENCE</div><h2>Routes</h2></div><span className="badge-status badge-generated">JSON ENVELOPE</span></div><div className="api-routes">{endpoints.map(([method, path, description]) => <article className="api-route" key={`${method}-${path}`}><div className="api-route-head"><span className={`http-method method-${method.toLowerCase()}`}>{method}</span><code>{path}</code><span className="api-auth">AquaManFHIR backend</span></div><p>{description}</p></article>)}</div><div className="panel-footer-note">Success: <code>{'{ success: true, data, error: null }'}</code> · Error responses contain <code>success: false</code>, null data, and a safe error object. Full contract is available on the Documentation page.</div></section>
    <div className="row g-3 mt-0"><div className="col-lg-6"><section className="panel-card h-100"><div className="panel-heading"><div><div className="eyebrow">REQUEST EXAMPLE</div><h2>Create a site Bundle</h2></div></div><pre className="code-sample"><code>POST /api/fhir/bundle/C1{ '\n' }Content-Type: application/json{ '\n\n' }{'{}'}</code></pre></section></div><div className="col-lg-6"><section className="panel-card h-100"><div className="panel-heading"><div><div className="eyebrow">RESPONSE SHAPE</div><h2>Traceable resources</h2></div></div><pre className="code-sample"><code>{'{'}{ '\n  "success": true,\n  "data": { "bundle": { "resourceType": "Bundle", "type": "collection" },\n    "validation": { "valid": true, "warnings": [], "errors": [] } },\n  "error": null\n}'}</code></pre></section></div></div>
  </>
}

export function DocumentationPage() {
  const [selected, setSelected] = useState('')
  const [document, setDocument] = useState<DocumentationContent | null>(null)
  const [documentLoading, setDocumentLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!selected) { setDocument(null); setError(''); setDocumentLoading(false); return () => { active = false } }
    setDocument(null); setError(''); setDocumentLoading(true)
    api.getDocumentation(selected).then((result) => { if (active) setDocument(result) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Document could not be loaded.') })
      .finally(() => { if (active) setDocumentLoading(false) })
    return () => { active = false }
  }, [selected])
  return <>
    <PageHeading eyebrow="IMPLEMENTATION NOTES / TRACK 7" title="Documentation" description="System behavior, mapping decisions, setup, and explicit integration limitations." />
    <div className="doc-link-grid"><DocLink title="OAH data discovery" path="oah-data-discovery.md" icon={<Database size={18} />} detail="Verified endpoints, field structures, observed counts, and source limitations." onSelect={setSelected} /><DocLink title="Architecture" path="architecture.md" icon={<Code2 size={18} />} detail="Layer boundaries, normalized models, FHIR mapping, validation, and security." onSelect={setSelected} /><DocLink title="Data flow" path="data-flow.md" icon={<RefreshCw size={18} />} detail="OAH adapter through normalized FHIR to downstream API and AI tools." onSelect={setSelected} /><DocLink title="FHIR mapping" path="fhir-mapping.md" icon={<ShieldCheck size={18} />} detail="Source fields, normalized values, FHIR elements, and mapping behavior." onSelect={setSelected} /><DocLink title="API contract" path="api.md" icon={<Radio size={18} />} detail="Routes, request examples, success/error envelopes, and AI interface." onSelect={setSelected} /><DocLink title="AI agent" path="ai-agent.md" icon={<MessageSquareText size={18} />} detail="Gemini trust boundary, tools, and grounding policy." onSelect={setSelected} /><DocLink title="Setup" path="setup.md" icon={<RefreshCw size={18} />} detail="Requirements, environment, run commands, and verification." onSelect={setSelected} /><DocLink title="Limitations" path="limitations.md" icon={<CircleAlert size={18} />} detail="What is connected, unavailable, and required before production." onSelect={setSelected} /></div>
    {error && <div className="alert alert-danger mt-3">{error}</div>}
    {documentLoading && <LoadingState message="Loading project document..." />}
    {selected && !documentLoading && !document && !error && <EmptyState title="Document is empty" detail="No content was returned for the selected document." />}
    {document && <section className="panel-card doc-viewer mt-3"><div className="panel-heading"><div><div className="eyebrow">PROJECT DOCUMENTATION</div><h2><FileText size={16} /> {document.name}</h2></div><button className="icon-action" onClick={() => setSelected('')} aria-label="Close document"><X size={15} /></button></div><pre>{document.content}</pre></section>}
    <section className="panel-card mt-3"><div className="panel-heading"><div><div className="eyebrow">SYSTEM PRINCIPLE</div><h2>Preserve evidence, do not infer it</h2></div><BookOpen size={18} className="heading-icon" /></div><p className="documentation-callout">Source field names, record identifiers, endpoint URLs, and original numeric values stay traceable through normalization and FHIR output. Missing units or sampling dates remain missing and appear as data-quality warnings.</p><a className="text-link" href="https://apps.oneaquahealth.eu/resmap/" target="_blank" rel="noreferrer">Open official Resilience Map <ExternalLink size={14} /></a></section>
  </>
}

export function SettingsPage() {
  const [health, setHealth] = useState<RuntimeHealth | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.getHealth().then(setHealth).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Runtime settings could not be retrieved.')) }, [])
  return <>
    <PageHeading eyebrow="RUNTIME / NON-SECRET CONFIGURATION" title="Settings" description="Read-only status for this AquaManFHIR instance. Secrets remain on the backend and are never returned." />
    {error && <div className="alert alert-danger">{error}</div>}
    {!health && !error && <div className="state-panel">Loading backend configuration...</div>}
    {health && <div className="settings-grid"><section className="panel-card"><div className="eyebrow">API PROCESS</div><h2>{health.status === 'ready' ? 'Ready' : 'Unavailable'}</h2><span className={`badge-status ${health.status === 'ready' ? 'badge-live' : 'badge-off'}`}>{health.status.toUpperCase()}</span></section><section className="panel-card"><div className="eyebrow">ONEAQUAHEALTH</div><h2>Source API</h2><code>{health.oahApiBaseUrl}</code><p>Live endpoint access is checked when source routes are requested.</p></section><section className="panel-card"><div className="eyebrow">GEMINI</div><h2>{health.geminiConfigured ? 'Configured' : 'Not configured'}</h2><span className={`badge-status ${health.geminiConfigured ? 'badge-live' : 'badge-review'}`}>{health.geminiConfigured ? 'BACKEND KEY PRESENT' : 'API KEY REQUIRED'}</span><p>The key value is never returned to the frontend.</p></section><section className="panel-card"><div className="eyebrow">PERSISTENCE</div><h2>{health.persistence}</h2><p>Source cache and generated FHIR resources are cleared when the API process restarts.</p></section></div>}
  </>
}

function DocLink({ title, path, icon, detail, onSelect }: { title: string; path: string; icon: React.ReactNode; detail: string; onSelect: (name: string) => void }) {
  return <button className="doc-link-card" onClick={() => onSelect(path)}><span className="source-icon source-ok">{icon}</span><strong>{title}</strong><span>{detail}</span><ArrowUpRight size={15} className="doc-arrow" /></button>
}
