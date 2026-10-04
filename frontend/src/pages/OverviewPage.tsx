import { ArrowDown, ArrowRight, CircleCheck, Clock3, Database, MapPin, Waves } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, PageHeading, StatTile } from '../components/ui'
import { api, type SiteListData } from '../services/api'

const SiteMap = lazy(() => import('../components/SiteMap').then(({ SiteMap: component }) => ({ default: component })))

function getOverviewSourceSummary(data: SiteListData | null) {
  const cityCount = data
    ? new Set(data.items.map((site) => site.cityId ?? site.cityName).filter((city): city is string => Boolean(city))).size
    : 0
  const healthRiskAvailable = Boolean(data) && !data?.sourceErrors.some((item) => item.endpoint.includes('health-risks'))
  const urbanParametersAvailable = Boolean(data) && !data?.sourceErrors.some((item) => item.endpoint.includes('urban-parameters'))
  let metricStatus: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'CACHED' = 'UNAVAILABLE'
  if (healthRiskAvailable && urbanParametersAvailable) metricStatus = 'AVAILABLE'
  else if (healthRiskAvailable || urbanParametersAvailable) metricStatus = 'PARTIAL'
  if (data?.isCached) metricStatus = 'CACHED'
  let metricStatusTone = 'badge-off'
  if (metricStatus === 'AVAILABLE') metricStatusTone = 'badge-live'
  else if (metricStatus === 'PARTIAL') metricStatusTone = 'badge-warning'
  else if (metricStatus === 'CACHED') metricStatusTone = 'badge-warning'
  let sourceStatus = 'CHECKING'
  let sourceStatusKey = 'checking'
  if (data) {
    if (data.isCached) {
      sourceStatus = 'CACHED SNAPSHOT'
      sourceStatusKey = 'cached'
    } else {
      sourceStatus = data.sourceErrors.length ? 'PARTIAL RESPONSE' : 'AVAILABLE'
      sourceStatusKey = data.sourceErrors.length ? 'partial' : 'available'
    }
  }
  return { cityCount, metricStatus, metricStatusTone, sourceStatus, sourceStatusKey }
}

export function OverviewPage() {
  const [data, setData] = useState<SiteListData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    api.getSites().then((result) => { if (active) setData(result) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Data could not be retrieved.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const sourceSummary = getOverviewSourceSummary(data)
  const mappedLocationCount = data?.items.filter((site) =>
    typeof site.latitude === 'number' && Number.isFinite(site.latitude) && site.latitude >= -90 && site.latitude <= 90 &&
    typeof site.longitude === 'number' && Number.isFinite(site.longitude) && site.longitude >= -180 && site.longitude <= 180,
  ).length ?? 0

  return <>
    <PageHeading eyebrow="SYSTEM OVERVIEW / OAH DATA" title="Interoperability at a glance" description="AquaManFHIR retrieves public OneAquaHealth site and environmental data when requested and maps available records to a traceable FHIR API." action={<div className="source-stamp"><span className={`source-state-dot source-state-${sourceSummary.sourceStatusKey}`} />{sourceSummary.sourceStatus} <span className="stamp-divider" />enora-oah.eu</div>} />
    {loading && <LoadingState message="Loading official OneAquaHealth catalogue..." />}
    {error && <ErrorState message={error} />}
    {data?.items.length === 0 && <EmptyState title="No research sites returned" detail="The source catalogue is available but contains no site records in this snapshot." />}
    {data && data.items.length > 0 && <>
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl"><StatTile label="DATA SOURCE" value="OAH" detail="Resilience Map API" tone="green" /></div>
        <div className="col-6 col-xl"><StatTile label="RESEARCH SITES" value={data.items.length} detail={`Across ${sourceSummary.cityCount} represented cities`} /></div>
        <div className="col-6 col-xl"><StatTile label="ENVIRONMENTAL VALUES" value={data.items.reduce((total, site) => total + site.observationCount, 0)} detail="Returned risk + urban fields" tone="aqua" /></div>
        <div className="col-6 col-xl"><StatTile label="FHIR RESOURCES" value="On demand" detail="R4 Location · Observation · Provenance" tone="amber" /></div>
        <div className="col-12 col-xl"><StatTile label="LAST RETRIEVAL" value={new Date(data.retrievedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} detail={new Date(data.retrievedAt).toLocaleDateString()} tone="coral" /></div>
      </div>

      <section className="panel-card mb-4">
        <div className="panel-heading"><div><div className="eyebrow">SOURCE TO CONSUMER</div><h2>Interoperability pipeline</h2></div><Link to="/sites" className="text-link">Open workspace <ArrowRight size={15} /></Link></div>
        <div className="pipeline-track">
          <div className="pipeline-node"><span className="node-icon node-live"><Database size={18} /></span><strong>OAH API</strong><small>public endpoints</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon"><Waves size={18} /></span><strong>Normalize</strong><small>source provenance</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon"><MapPin size={18} /></span><strong>FHIR R4</strong><small>Location · Observation · Provenance</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon node-validate"><CircleCheck size={18} /></span><strong>Validate</strong><small>structure + quality</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon"><ArrowDown size={18} /></span><strong>Export</strong><small>FHIR Bundle · API</small></div>
        </div>
        {data.sourceErrors.length > 0 && <div className="source-warning"><Clock3 size={15} /> Some optional source layers are unavailable: {data.sourceErrors.map((item) => item.endpoint).join(', ')}</div>}
      </section>

      <section className="panel-card mb-4">
        <div className="panel-heading"><div><div className="eyebrow">OAH SITE COORDINATES</div><h2>Research site map</h2></div><span className="badge-status badge-generated">{mappedLocationCount} LOCATIONS</span></div>
        <Suspense fallback={<div className="site-map-loading">Loading map...</div>}><SiteMap sites={data.items} /></Suspense>
        <div className="table-footnote">Markers use source coordinates and are grouped by city. Sites without valid coordinates are omitted from the map.</div>
      </section>

      <div className="row g-3">
        <div className="col-xl-7"><section className="panel-card h-100"><div className="panel-heading"><div><div className="eyebrow">OAH CATALOGUE</div><h2>Research sites</h2></div><Link to="/sites" className="text-link">View all {data.items.length} <ArrowRight size={15} /></Link></div><div className="table-responsive"><table className="table data-table mb-0"><thead><tr><th>Site</th><th>City</th><th>Coordinates</th><th className="text-end">Values</th></tr></thead><tbody>{data.items.slice(0, 6).map((site) => <tr key={site.id}><td><Link to={`/sites/${encodeURIComponent(site.id)}`} className="site-link"><span className="site-code">{site.id}</span>{site.name}</Link></td><td>{site.cityName ?? site.cityId ?? '—'}</td><td className="mono-cell">{site.latitude?.toFixed(4) ?? '—'}, {site.longitude?.toFixed(4) ?? '—'}</td><td className="text-end">{site.observationCount}</td></tr>)}</tbody></table></div></section></div>
        <div className="col-xl-5"><section className="panel-card h-100"><div className="panel-heading"><div><div className="eyebrow">SOURCE LIMITS</div><h2>Connected data layers</h2></div></div><div className="source-list"><div className="source-row"><span className="source-icon source-ok"><Database size={16} /></span><div><strong>Research sites</strong><small>{data.recordCounts.cities} cities · {data.recordCounts.sites} sites</small></div><span className={`badge-status ${data.isCached ? 'badge-warning' : 'badge-live'}`}>{data.isCached ? 'CACHED' : 'AVAILABLE'}</span></div><div className="source-row"><span className="source-icon source-ok"><Waves size={16} /></span><div><strong>Risk + urban indicators</strong><small>Risk {data.recordCounts.healthRiskRecords} · urban {data.recordCounts.urbanParameterRecords} records</small></div><span className={`badge-status ${sourceSummary.metricStatusTone}`}>{sourceSummary.metricStatus}</span></div><div className="source-row"><span className="source-icon source-unavailable"><Clock3 size={16} /></span><div><strong>Citizen-science records</strong><small>Swagger endpoints documented; access unverified</small></div><span className="badge-status badge-review">NOT INTEGRATED</span></div><div className="source-row"><span className="source-icon source-unavailable"><MapPin size={16} /></span><div><strong>OAH FHIR profiles</strong><small>No profile found in public guidance</small></div><span className="badge-status badge-review">NOT IDENTIFIED</span></div></div><Link to="/data-sources" className="text-link mt-3">Source details <ArrowRight size={15} /></Link></section></div>
      </div>
    </>}
  </>
}
