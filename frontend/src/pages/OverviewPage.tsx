import { ArrowDown, ArrowRight, CircleCheck, Clock3, Database, MapPin, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState, PageHeading, StatTile } from '../components/ui'
import { api, type SiteListData } from '../services/api'

export function OverviewPage() {
  const [data, setData] = useState<SiteListData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    api.getSites().then((result) => { if (active) setData(result) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Data could not be retrieved.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return <>
    <PageHeading eyebrow="SYSTEM OVERVIEW / LIVE OAH" title="Interoperability at a glance" description="AquaManFHIR connects verified OneAquaHealth site and environmental datasets to a traceable FHIR API." action={<div className="source-stamp"><span className="live-dot" />LIVE SOURCE <span className="stamp-divider" />enora-oah.eu</div>} />
    {loading && <LoadingState message="Loading official OneAquaHealth catalogue..." />}
    {error && <ErrorState message={error} />}
    {data && <>
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl"><StatTile label="CONNECTED SOURCE" value="1" detail="Resilience Map API" tone="green" /></div>
        <div className="col-6 col-xl"><StatTile label="RESEARCH SITES" value={data.items.length} detail="Across 5 research cities" /></div>
        <div className="col-6 col-xl"><StatTile label="ENVIRONMENTAL VALUES" value={data.items.reduce((total, site) => total + site.observationCount, 0)} detail="Live risk + urban parameters" tone="aqua" /></div>
        <div className="col-6 col-xl"><StatTile label="FHIR RESOURCES" value="On demand" detail="R4 Location · Observation · Provenance" tone="amber" /></div>
        <div className="col-12 col-xl"><StatTile label="LAST RETRIEVAL" value={new Date(data.retrievedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} detail={new Date(data.retrievedAt).toLocaleDateString()} tone="coral" /></div>
      </div>

      <section className="panel-card mb-4">
        <div className="panel-heading"><div><div className="eyebrow">SOURCE TO CONSUMER</div><h2>Interoperability pipeline</h2></div><Link to="/sites" className="text-link">Open workspace <ArrowRight size={15} /></Link></div>
        <div className="pipeline-track">
          <div className="pipeline-node"><span className="node-icon node-live"><Database size={18} /></span><strong>OAH API</strong><small>verified source</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon"><Waves size={18} /></span><strong>Normalize</strong><small>source provenance</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon"><MapPin size={18} /></span><strong>FHIR R4</strong><small>Location · Observation · Provenance</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon node-validate"><CircleCheck size={18} /></span><strong>Validate</strong><small>structure + quality</small></div><ArrowRight className="pipeline-arrow" size={18} />
          <div className="pipeline-node"><span className="node-icon"><ArrowDown size={18} /></span><strong>Export</strong><small>FHIR Bundle · API</small></div>
        </div>
        {data.sourceErrors.length > 0 && <div className="source-warning"><Clock3 size={15} /> Some optional source layers are unavailable: {data.sourceErrors.map((item) => item.endpoint).join(', ')}</div>}
      </section>

      <div className="row g-3">
        <div className="col-xl-7"><section className="panel-card h-100"><div className="panel-heading"><div><div className="eyebrow">LIVE CATALOGUE</div><h2>Research sites</h2></div><Link to="/sites" className="text-link">View all {data.items.length} <ArrowRight size={15} /></Link></div><div className="table-responsive"><table className="table data-table mb-0"><thead><tr><th>Site</th><th>City</th><th>Coordinates</th><th className="text-end">Values</th></tr></thead><tbody>{data.items.slice(0, 6).map((site) => <tr key={site.id}><td><Link to={`/sites/${encodeURIComponent(site.id)}`} className="site-link"><span className="site-code">{site.id}</span>{site.name}</Link></td><td>{site.cityName ?? site.cityId ?? '—'}</td><td className="mono-cell">{site.latitude?.toFixed(4) ?? '—'}, {site.longitude?.toFixed(4) ?? '—'}</td><td className="text-end">{site.observationCount}</td></tr>)}</tbody></table></div></section></div>
        <div className="col-xl-5"><section className="panel-card h-100"><div className="panel-heading"><div><div className="eyebrow">SOURCE LIMITS</div><h2>Connected data layers</h2></div></div><div className="source-list"><div className="source-row"><span className="source-icon source-ok"><Database size={16} /></span><div><strong>Research sites</strong><small>5 cities · 106 sites</small></div><span className="badge-status badge-live">LIVE</span></div><div className="source-row"><span className="source-icon source-ok"><Waves size={16} /></span><div><strong>Risk + urban indicators</strong><small>Verified Resilience Map records</small></div><span className="badge-status badge-live">LIVE</span></div><div className="source-row"><span className="source-icon source-unavailable"><Clock3 size={16} /></span><div><strong>Citizen-science records</strong><small>Public endpoint not documented</small></div><span className="badge-status badge-off">OFF</span></div><div className="source-row"><span className="source-icon source-unavailable"><MapPin size={16} /></span><div><strong>OAH FHIR profiles</strong><small>Not found in public guidance</small></div><span className="badge-status badge-review">REVIEW</span></div></div><Link to="/data-sources" className="text-link mt-3">Source details <ArrowRight size={15} /></Link></section></div>
      </div>
    </>}
  </>
}
