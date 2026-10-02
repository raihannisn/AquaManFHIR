import { ExternalLink, FileCheck2, Filter, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, JsonViewer, LoadingState, PageHeading, ValidationSummary } from '../components/ui'
import { api, type ConversionData, type Site } from '../services/api'

export function FhirPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [conversion, setConversion] = useState<ConversionData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { api.getSites().then((result) => { setSites(result.items); if (result.items[0]) setSiteId(result.items[0].id) }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The site catalogue could not be retrieved.')) }, [])
  useEffect(() => {
    if (!siteId) return
    let active = true
    setLoading(true); setError('')
    api.convertSite(siteId).then((result) => { if (active) setConversion(result) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'FHIR resources could not be generated.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [siteId])
  return <>
    <PageHeading eyebrow="FHIR R4 / GENERATED FROM LIVE SOURCE" title="FHIR resources" description="Inspect Location, Observation, and Provenance resources. Direct read endpoints use application/fhir+json; no OAH profile conformance is asserted." action={<label className="select-control"><Filter size={15} /><select value={siteId} onChange={(event) => setSiteId(event.target.value)} aria-label="Select site">{sites.map((site) => <option key={site.id} value={site.id}>{site.id} · {site.name}</option>)}</select></label>} />
    {error && <ErrorState message={error} />}{loading && <LoadingState message="Mapping live records to FHIR R4..." />}
    {conversion && <div className="row g-3"><div className="col-xl-7"><JsonViewer value={{ resourceType: 'Bundle', type: 'collection', entry: conversion.resources.map((resource) => ({ resource })) }} filename={`oah-site-${siteId}-resources.json`} /></div><div className="col-xl-5"><section className="panel-card mb-3"><div className="panel-heading"><div><div className="eyebrow">RESOURCE INDEX</div><h2>{conversion.resources.length} resources</h2></div><Link to={`/sites/${encodeURIComponent(siteId)}`} className="text-link">Workspace <ExternalLink size={14} /></Link></div><div className="resource-index">{conversion.resources.map((resource) => <div className="resource-index-row" key={`${resource.resourceType}-${resource.id}`}><span className="resource-type-tag">{resource.resourceType}</span><code>{resource.id}</code><span className="badge-status badge-generated">GENERATED</span></div>)}</div><div className="panel-footer-note">R4 resource types: Location, Observation, Provenance, Bundle. QuestionnaireResponse is not emitted because no public questionnaire payload was verified.</div></section><section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">STRUCTURE + QUALITY</div><h2>Validation result</h2></div><FileCheck2 size={18} className="heading-icon" /></div><ValidationSummary report={conversion.validation} /></section></div></div>}
    {!conversion && !loading && !error && <EmptyState title="Select a site" detail="Choose a source site to map its live records into FHIR." />}
  </>
}

export function ValidationPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [conversion, setConversion] = useState<ConversionData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { api.getSites().then((result) => { setSites(result.items); if (result.items[0]) setSiteId(result.items[0].id) }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The site catalogue could not be retrieved.')) }, [])
  async function validate() {
    if (!siteId) return
    setLoading(true); setError('')
    try { setConversion(await api.convertSite(siteId)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Validation could not run.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (!siteId || conversion) return
    let active = true
    setLoading(true)
    api.convertSite(siteId).then((result) => { if (active) setConversion(result) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Validation could not run.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [siteId, conversion])
  return <>
    <PageHeading eyebrow="FHIR R4 / DATA QUALITY" title="Validation & data quality" description="FHIR R4 base schemas and source-quality rules run separately. Terminology bindings and OAH profiles are not validated." action={<div className="d-flex align-items-center gap-2"><label className="select-control"><Filter size={15} /><select value={siteId} onChange={(event) => { setSiteId(event.target.value); setConversion(null) }} aria-label="Select site">{sites.map((site) => <option key={site.id} value={site.id}>{site.id} · {site.name}</option>)}</select></label><button className="btn btn-outline-secondary icon-action" onClick={() => void validate()} disabled={loading} title="Validate again" aria-label="Validate again"><RefreshCw size={16} /></button></div>} />
    {error && <ErrorState message={error} />}{loading && <LoadingState message="Validating generated FHIR resources..." />}
    {conversion && <div className="row g-3"><div className="col-xl-5"><section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">SITE {siteId}</div><h2>Validation status</h2></div><span className={`validation-badge ${conversion.validation.status === 'INVALID' ? 'badge-invalid' : conversion.validation.warnings.length ? 'badge-warning' : 'badge-valid'}`}>{conversion.validation.status}</span></div><ValidationSummary report={conversion.validation} /><div className="validation-rule-list"><div><span className="rule-dot rule-ok" />Resource type and ID</div><div><span className="rule-dot rule-ok" />Required supported fields</div><div><span className="rule-dot rule-ok" />Value datatype and references</div><div><span className={conversion.validation.warnings.some((item) => item.code === 'MISSING_DATE') ? 'rule-dot rule-warn' : 'rule-dot rule-ok'} />Sampling date availability</div><div><span className={conversion.validation.warnings.some((item) => item.code === 'MISSING_UNIT') ? 'rule-dot rule-warn' : 'rule-dot rule-ok'} />Unit metadata availability</div></div></section></div><div className="col-xl-7"><JsonViewer value={conversion.resources} filename={`oah-site-${siteId}-validated.json`} /></div></div>}
  </>
}
