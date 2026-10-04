import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, Download, Filter, RefreshCw, Search, Sparkles, WandSparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, PageHeading, ValidationSummary } from '../components/ui'
import { api, type BundleData, type ConversionData, type Observation, type Site, type SiteDetailData, type SiteListData } from '../services/api'

const SiteMap = lazy(() => import('../components/SiteMap').then(({ SiteMap: component }) => ({ default: component })))

export function SitesPage() {
  const [data, setData] = useState<SiteListData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('all')
  useEffect(() => {
    let active = true
    api.getSites().then((result) => { if (active) setData(result) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Sites could not be retrieved.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const cities = [...new Set(data?.items.map((site) => site.cityName ?? site.cityId ?? 'Unknown') ?? [])].sort()
  const filtered = data?.items.filter((site) => {
    const term = search.toLowerCase()
    const matchesSearch = !term || `${site.id} ${site.name} ${site.cityName ?? ''}`.toLowerCase().includes(term)
    return matchesSearch && (city === 'all' || (site.cityName ?? site.cityId) === city)
  }) ?? []
  return <>
    <PageHeading eyebrow="SOURCE CATALOGUE / OAH" title="Research sites" description="Site records retrieved from the OneAquaHealth Resilience Map API." action={<div className="source-stamp">{data ? `${data.items.length} SITES` : 'LOADING'}</div>} />
    {error && <ErrorState message={error} />}
    {loading && <LoadingState message="Loading site catalogue..." />}
    {!loading && data?.items.length === 0 && <EmptyState title="No research sites returned" detail="The OAH catalogue response did not include any sites." />}
    {data && data.items.length > 0 && <section className="panel-card">
      <div className="filter-bar"><div className="search-control"><Search size={16} /><input aria-label="Search sites" placeholder="Search ID, site, city" value={search} onChange={(event) => setSearch(event.target.value)} /></div><label className="select-control"><Filter size={15} /><select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filter by city"><option value="all">All cities</option>{cities.map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={14} /></label><span className="filter-count">{filtered.length} of {data.items.length} sites</span></div>
      <div className="table-responsive"><table className="table data-table sites-table mb-0"><thead><tr><th>Site ID</th><th>Site name</th><th>City</th><th>Coordinates</th><th className="text-end">Values</th><th>Source data</th><th /></tr></thead><tbody>{filtered.map((site) => <tr key={site.id}><td><span className="site-code">{site.id}</span></td><td><strong className="table-primary-text">{site.name}</strong></td><td>{site.cityName ?? site.cityId ?? '—'}</td><td className="mono-cell">{site.latitude?.toFixed(5) ?? '—'}, {site.longitude?.toFixed(5) ?? '—'}</td><td className="text-end">{site.observationCount}</td><td><span className="badge-status badge-live">AVAILABLE</span></td><td><Link to={`/sites/${encodeURIComponent(site.id)}`} className="table-arrow" aria-label={`Open ${site.id}`}><ArrowUpRight size={16} /></Link></td></tr>)}</tbody></table></div>
      {filtered.length === 0 && <EmptyState title="No matching sites" detail="Adjust the search or city filter." />}
      <div className="table-footnote">Source: <code>GET /api/sites</code> · Retrieved {new Date(data.retrievedAt).toLocaleString()}</div>
    </section>}
  </>
}

export function SiteWorkspacePage() {
  const { siteId = '' } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<SiteDetailData | null>(null)
  const [observations, setObservations] = useState<Observation[]>([])
  const [conversion, setConversion] = useState<ConversionData | null>(null)
  const [bundle, setBundle] = useState<BundleData | null>(null)
  const [downloadNotice, setDownloadNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'convert' | 'bundle' | ''>('')
  const [activeResource, setActiveResource] = useState(0)
  useEffect(() => {
    if (!downloadNotice) return
    const timeout = window.setTimeout(() => setDownloadNotice(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [downloadNotice])
  useEffect(() => {
    let active = true
    setDetail(null)
    setObservations([])
    setConversion(null)
    setBundle(null)
    setError('')
    Promise.all([api.getSite(siteId), api.getObservations(siteId)]).then(([siteData, observationData]) => {
      if (!active) return
      setDetail(siteData)
      setObservations(observationData.items)
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Site data could not be retrieved.') })
    return () => { active = false }
  }, [siteId])
  async function convert() {
    setBusy('convert'); setError('')
    try { setConversion(await api.convertSite(siteId)); setBundle(null); setActiveResource(0) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'FHIR conversion failed.') }
    finally { setBusy('') }
  }
  async function createBundle() {
    setBusy('bundle'); setError('')
    try { setBundle(await api.createBundle(siteId)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Bundle export failed.') }
    finally { setBusy('') }
  }
  function downloadBundle() {
    if (!bundle) return
    const filename = `oah-site-${siteId}.json`
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle.bundle, null, 2)], { type: 'application/fhir+json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDownloadNotice(filename)
  }
  if (!detail && !error) return <LoadingState message={`Loading OneAquaHealth site ${siteId}...`} />
  return <>
    <PageHeading eyebrow="INTEROPERABILITY WORKSPACE / OAH SOURCE DATA" title={detail?.site.name ?? `Site ${siteId}`} description={`${detail?.site.cityName ?? detail?.site.cityId ?? 'Research site'} · Source ID ${siteId} · ${detail?.site.latitude?.toFixed(5) ?? '—'}, ${detail?.site.longitude?.toFixed(5) ?? '—'}`} action={<span className="source-stamp">ONEAQUAHEALTH</span>} />
    {error && <ErrorState message={error} />}
    {downloadNotice && <div className="download-toast" role="status" aria-live="polite"><Check size={16} /><span>Bundle download started: <strong>{downloadNotice}</strong></span></div>}
    {detail && <>
      <div className="workspace-toolbar"><div className="toolbar-meta"><span className="site-code">{siteId}</span><span>Retrieved {new Date(detail.retrievedAt).toLocaleString()}</span>{detail.site.altitude !== undefined && <span>Altitude {detail.site.altitude} m</span>}</div><div className="d-flex flex-wrap gap-2"><button className="btn btn-primary action-button" onClick={convert} disabled={busy !== ''}><WandSparkles size={16} />{busy === 'convert' ? 'Converting…' : 'Convert to FHIR'}</button><button className="btn btn-outline-secondary action-button" onClick={() => navigate(`/agent?site=${encodeURIComponent(siteId)}`)}><Sparkles size={15} />Ask AI</button><button className="btn btn-outline-secondary action-button" onClick={createBundle} disabled={busy !== ''}><ArrowDownToLine size={15} />Export Bundle</button>{bundle && <button className="btn btn-outline-secondary action-button icon-only" onClick={downloadBundle} title="Download FHIR Bundle" aria-label="Download FHIR Bundle"><Download size={16} /></button>}</div></div>
      {bundle && <div className="bundle-export-state"><Check size={15} />Bundle created with {bundle.resources.length} resources · {bundle.validation.status}<button className="text-button" onClick={downloadBundle}>Download JSON</button></div>}
      <div className="row g-3 workspace-columns">
        <div className="col-xl-4"><section className="panel-card workspace-panel h-100"><div className="panel-heading compact-heading"><div><div className="eyebrow">01 / ORIGINAL SOURCE</div><h2>Raw OAH records</h2></div><span className="badge-status badge-live">SOURCE DATA</span></div><div className="source-record-stack">{detail.raw.healthRisk && <SourceRecord title="Health & ecosystem risk" value={detail.raw.healthRisk} />}{detail.raw.urbanParameters && <SourceRecord title="Urban parameters" value={detail.raw.urbanParameters} />}{!detail.raw.healthRisk && !detail.raw.urbanParameters && <EmptyState title="No analytical records for this site" detail="The site is in the retrieved catalogue, but these indicator endpoints returned no row for it." />}</div><div className="provenance-note"><span className="eyebrow">PROVENANCE</span><code>{detail.site.source}</code><small>Original field names and values are preserved in the source record.</small></div></section></div>
        <div className="col-xl-4"><section className="panel-card workspace-panel h-100"><div className="panel-heading compact-heading"><div><div className="eyebrow">02 / NORMALIZED MODEL</div><h2>Mapped observations <span className="heading-count">{observations.length}</span></h2></div><span className="pipeline-mini">RAW <ArrowRight size={12} /> NORMALIZE</span></div>{observations.length === 0 ? <EmptyState title="No observations available" detail="The connected indicators contain no records for this site." /> : <div className="mapping-list">{observations.map((item) => <div className="mapping-item" key={item.id}><div className="mapping-raw"><span className="mapping-label">SOURCE FIELD</span><code>{item.originalField}</code><small>record {item.sourceRecordId.split(':')[0]}</small></div><ArrowRight size={15} className="mapping-arrow" /><div className="mapping-normalized"><span className="mapping-label">NORMALIZED VALUE</span><strong>{item.value}</strong><small>{item.displayName} · {item.observedAt ? new Date(item.observedAt).toLocaleDateString() : 'date not supplied'}</small></div></div>)}</div>}<div className="provenance-note"><span className="eyebrow">TRANSFORMATION RULE</span><small>One numeric source field becomes one normalized observation. No unit or timestamp is inferred.</small></div></section></div>
        <div className="col-xl-4"><section className="panel-card workspace-panel h-100"><div className="panel-heading compact-heading"><div><div className="eyebrow">03 / FHIR R4 OUTPUT</div><h2>Generated resources</h2></div>{conversion && <span className="badge-status badge-generated">{conversion.resources.length} RESOURCES</span>}</div>{conversion ? <><div className="resource-tabs">{conversion.resources.map((resource, index) => <button className={activeResource === index ? 'resource-tab active' : 'resource-tab'} key={`${resource.resourceType}-${resource.id}`} onClick={() => setActiveResource(index)}><span>{resource.resourceType}</span><small>{resource.id}</small></button>)}</div><ValidationSummary report={conversion.validation} /><div className="resource-json"><pre><code>{JSON.stringify(conversion.resources[activeResource], null, 2)}</code></pre></div></> : <EmptyState title="FHIR has not been generated" detail="Convert the available source records to inspect FHIR R4 output and validation." />}<div className="fhir-panel-actions"><button className="text-button" onClick={convert} disabled={busy !== ''}>{conversion ? <RefreshCw size={14} /> : <WandSparkles size={14} />}{conversion ? 'Rebuild resources' : 'Convert to FHIR'}</button><Link to="/fhir" className="text-link">FHIR viewer <ArrowRight size={14} /></Link></div></section></div>
      </div>
      <div className="row g-3 mt-0">
        <div className="col-xl-6"><section className="panel-card site-map-panel"><div className="panel-heading compact-heading"><div><div className="eyebrow">SOURCE LOCATION</div><h2>Site map</h2></div></div><Suspense fallback={<div className="site-map-loading site-map-loading-single">Loading map...</div>}><SiteMap sites={[detail.site]} singleSite /></Suspense></section></div>
        <div className="col-xl-6"><section className="panel-card risk-panel"><HealthRiskCard record={detail.raw.healthRisk} /></section></div>
      </div>
    </>}
  </>
}

const healthRiskFields = [
  { field: 'scaledPathogenRisk', label: 'Scaled pathogen risk' },
  { field: 'scaledFecalRisk', label: 'Scaled fecal risk' },
  { field: 'scaledArgRisk', label: 'Scaled ARG risk' },
  { field: 'healthRiskScore', label: 'Health risk score' },
] as const

function HealthRiskCard({ record }: { record?: Record<string, unknown> }) {
  const metrics = healthRiskFields.flatMap(({ field, label }) => {
    const value = record?.[field]
    return typeof value === 'number' && Number.isFinite(value) ? [{ field, label, value }] : []
  })
  const maxMagnitude = Math.max(0, ...metrics.map(({ value }) => Math.abs(value)))
  const samplingDate = typeof record?.samplingDate === 'string' ? record.samplingDate : 'Not supplied by source'

  return <>
    <div className="panel-heading compact-heading"><div><div className="eyebrow">OAH SOURCE FIELDS</div><h2>Health &amp; ecosystem risk</h2></div></div>
    <p className="risk-source-note">source-scaled index; definition and units not published by OAH. Bar lengths are relative to the largest value shown and are not OAH thresholds.</p>
    <p className="risk-date">Sampling date: <code>{samplingDate}</code></p>
    {metrics.length > 0 ? <div className="risk-metric-list">{metrics.map(({ field, label, value }) => <div className="risk-metric" key={field}>
      <div className="risk-metric-heading"><span>{label}</span><code>{String(value)}</code></div>
      <div className="risk-bar-track" aria-hidden="true"><span style={{ width: `${maxMagnitude ? Math.abs(value) / maxMagnitude * 100 : 0}%` }} /></div>
    </div>)}</div> : <EmptyState title="No risk record for this site" detail="No numeric health or ecosystem risk values were returned for this site." />}
  </>
}

function SourceRecord({ title, value }: { title: string; value: Record<string, unknown> }) {
  return <details className="source-record" open><summary>{title}<ChevronDown size={14} /></summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

export function ObservationsPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [siteId, setSiteId] = useState('')
  const [observations, setObservations] = useState<Observation[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [indicatorFilter, setIndicatorFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [fhirFilter, setFhirFilter] = useState('all')
  useEffect(() => {
    let active = true
    api.getSites().then((data) => { if (active) { setSites(data.items); if (data.items[0]) setSiteId(data.items[0].id) } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Site catalogue could not be retrieved.') })
      .finally(() => { if (active) setSitesLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!siteId) return
    let active = true
    setLoading(true); setError('')
    api.getObservations(siteId).then((data) => { if (active) setObservations(data.items) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Observations could not be retrieved.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [siteId])
  const indicators = [...new Set(observations.map((item) => item.indicator))].sort()
  const filteredObservations = observations.filter((item) =>
    (sourceFilter === 'all' || item.source.includes(sourceFilter)) &&
    (indicatorFilter === 'all' || item.indicator === indicatorFilter) &&
    (dateFilter === 'all' || (dateFilter === 'dated' ? Boolean(item.observedAt) : !item.observedAt)) &&
    (fhirFilter === 'all' || item.fhirStatus === fhirFilter),
  )
  return <>
    <PageHeading eyebrow="SOURCE RECORDS / NORMALIZED" title="Environmental observations" description="Each row is a numeric value from a retrieved OAH source record. Original field names and IDs remain traceable." action={<label className="select-control"><Filter size={15} /><select value={siteId} onChange={(event) => setSiteId(event.target.value)} aria-label="Select site">{sites.map((site) => <option key={site.id} value={site.id}>{site.id} · {site.name}</option>)}</select><ChevronDown size={14} /></label>} />
    {sitesLoading && <LoadingState message="Loading site catalogue..." />}
    {error && <ErrorState message={error} />}{loading && <LoadingState message="Loading OAH environmental observations..." />}
    {!sitesLoading && !siteId && !error && <EmptyState title="No sites available" detail="The OAH catalogue returned no site to select." />}
    {!sitesLoading && !loading && !error && siteId && <section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">SITE {siteId}</div><h2>{filteredObservations.length} of {observations.length} normalized values</h2></div><span className="badge-status badge-generated">OAH SOURCE DATA</span></div><div className="observation-filters"><label className="select-control"><Filter size={14} /><select aria-label="Filter observation source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All sources</option><option value="health-risks">Health risk</option><option value="urban-parameters">Urban context</option></select></label><label className="select-control"><select aria-label="Filter observation indicator" value={indicatorFilter} onChange={(event) => setIndicatorFilter(event.target.value)}><option value="all">All indicators</option>{indicators.map((indicator) => <option key={indicator} value={indicator}>{indicator}</option>)}</select></label><label className="select-control"><select aria-label="Filter date availability" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}><option value="all">Any date</option><option value="dated">Date supplied</option><option value="undated">Date not supplied</option></select></label><label className="select-control"><select aria-label="Filter FHIR status" value={fhirFilter} onChange={(event) => setFhirFilter(event.target.value)}><option value="all">All FHIR states</option><option value="GENERATED">Generated</option><option value="NOT GENERATED">Not generated</option></select></label></div>{observations.length === 0 ? <EmptyState title="No observations are available for this site" detail="This site has no matching record in the connected risk or urban indicator endpoints." /> : filteredObservations.length === 0 ? <EmptyState title="No matching observations" detail="Adjust the source, indicator, date, or FHIR status filters." /> : <div className="table-responsive"><table className="table data-table observations-table mb-0"><thead><tr><th>Source field</th><th>Value</th><th>Source record</th><th>Source layer</th><th>Observed at</th><th>FHIR status</th></tr></thead><tbody>{filteredObservations.map((item) => <tr key={item.id}><td><strong className="table-primary-text">{item.displayName}</strong><div className="subcell"><code>{item.originalField}</code></div></td><td><span className="numeric-value">{item.value}</span><span className="unit-label">{item.unit ?? 'unit not supplied'}</span></td><td className="mono-cell">{item.sourceRecordId}</td><td><span className="source-category">{item.source.includes('health-risks') ? 'Health risk' : 'Urban context'}</span></td><td>{item.observedAt ? new Date(item.observedAt).toLocaleDateString() : <span className="muted-inline">Not supplied</span>}</td><td><span className={`badge-status ${item.fhirStatus === 'GENERATED' ? 'badge-generated' : 'badge-pending'}`}>{item.fhirStatus}</span></td></tr>)}</tbody></table></div>}<div className="table-footnote">Units and source dates are not inferred. FHIR status reflects generated resource availability, not validation outcome.</div></section>}
  </>
}
