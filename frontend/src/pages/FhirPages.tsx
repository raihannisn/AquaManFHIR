import { ExternalLink, FileCheck2, Filter, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, JsonViewer, LoadingState, PageHeading, ValidationSummary } from '../components/ui'
import { ValidationPlayground, ValidationScorecard, ruleDotClass, validationRules } from '../components/ValidationExtras'
import { api, type ConversionData, type Site } from '../services/api'

export function FhirPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [sitesLoading, setSitesLoading] = useState(true)
  const [conversion, setConversion] = useState<ConversionData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    api.getSites().then((result) => { if (active) { setSites(result.items); if (result.items[0]) setSiteId(result.items[0].id) } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'The site catalogue could not be retrieved.') })
      .finally(() => { if (active) setSitesLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!siteId) return
    let active = true
    setLoading(true); setError('')
    api.convertSite(siteId).then((result) => { if (active) setConversion(result) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'FHIR resources could not be generated.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [siteId])
  return <>
    <PageHeading eyebrow="FHIR R4 / OAH SOURCE DATA" title="FHIR resources" description="Inspect Location, Observation, and Provenance resources. Direct read endpoints use application/fhir+json; no OAH profile conformance is asserted." action={<label className="select-control"><Filter size={15} /><select value={siteId} disabled={sitesLoading || sites.length === 0} onChange={(event) => setSiteId(event.target.value)} aria-label="Select site">{sitesLoading && <option value="">Loading sites...</option>}{sites.map((site) => <option key={site.id} value={site.id}>{site.id} · {site.name}</option>)}</select></label>} />
    {sitesLoading && <LoadingState message="Loading site catalogue..." />}{error && <ErrorState message={error} />}{loading && <LoadingState message="Mapping retrieved records to FHIR R4..." />}
    {conversion && <div className="row g-3"><div className="col-xl-7"><JsonViewer value={{ resourceType: 'Bundle', type: 'collection', entry: conversion.resources.map((resource) => ({ resource })) }} filename={`oah-site-${siteId}-resources.json`} /></div><div className="col-xl-5"><section className="panel-card mb-3"><div className="panel-heading"><div><div className="eyebrow">RESOURCE INDEX</div><h2>{conversion.resources.length} resources</h2></div><div className="d-flex align-items-center gap-3"><a href="/fhir/metadata" className="text-link" target="_blank" rel="noreferrer">CapabilityStatement <ExternalLink size={14} /></a><Link to={`/sites/${encodeURIComponent(siteId)}`} className="text-link">Workspace <ExternalLink size={14} /></Link></div></div><div className="resource-index">{conversion.resources.map((resource) => <div className="resource-index-row" key={`${resource.resourceType}-${resource.id}`}><span className="resource-type-tag">{resource.resourceType}</span><code>{resource.id}</code><span className="badge-status badge-generated">GENERATED</span>{resource.id && <a href={`/fhir/${resource.resourceType}/${encodeURIComponent(resource.id)}`} className="icon-button" target="_blank" rel="noreferrer" title="Open FHIR resource directly" aria-label={`Open ${resource.resourceType}/${resource.id} from the FHIR API`}><ExternalLink size={14} /></a>}</div>)}</div><div className="panel-footer-note">R4 resource types: Location, Observation, Provenance, Bundle. <a href={`/fhir/Observation?subject=Location/${encodeURIComponent(siteId)}`} target="_blank" rel="noreferrer">Open this site's FHIR Observation search <ExternalLink size={12} /></a>. QuestionnaireResponse is not emitted because no public questionnaire payload was verified.</div></section><section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">STRUCTURE + QUALITY</div><h2>Validation result</h2></div><FileCheck2 size={18} className="heading-icon" /></div><ValidationSummary report={conversion.validation} /></section></div></div>}
    {!sitesLoading && !siteId && !error && <EmptyState title="No sites available" detail="The OAH source returned no research sites to map." />}
    {!conversion && !sitesLoading && !loading && !error && siteId && <EmptyState title="Select a site" detail="Choose a source site to map its available records into FHIR." />}
  </>
}

export function ValidationPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [sitesLoading, setSitesLoading] = useState(true)
  const [conversion, setConversion] = useState<ConversionData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    api.getSites().then((result) => { if (active) { setSites(result.items); if (result.items[0]) setSiteId(result.items[0].id) } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'The site catalogue could not be retrieved.') })
      .finally(() => { if (active) setSitesLoading(false) })
    return () => { active = false }
  }, [])
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
    <PageHeading eyebrow="FHIR R4 / DATA QUALITY" title="Validation & data quality" description="FHIR R4 base schemas and source-quality rules run separately. Terminology bindings and OAH profiles are not validated." action={<div className="d-flex align-items-center gap-2"><label className="select-control"><Filter size={15} /><select value={siteId} disabled={sitesLoading || sites.length === 0} onChange={(event) => { setSiteId(event.target.value); setConversion(null) }} aria-label="Select site">{sitesLoading && <option value="">Loading sites...</option>}{sites.map((site) => <option key={site.id} value={site.id}>{site.id} · {site.name}</option>)}</select></label><button className="btn btn-outline-secondary icon-action" onClick={() => void validate()} disabled={loading || !siteId} title="Validate again" aria-label="Validate again"><RefreshCw size={16} /></button></div>} />
    {sitesLoading && <LoadingState message="Loading site catalogue..." />}{error && <ErrorState message={error} />}{loading && <LoadingState message="Validating generated FHIR resources..." />}
    {!sitesLoading && !siteId && !error && <EmptyState title="No sites available" detail="The OAH source returned no research sites to validate." />}
    {conversion && <><ValidationScorecard report={conversion.validation} /><div className="row g-3"><div className="col-xl-5"><section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">SITE {siteId}</div><h2>Validation status</h2></div><span className={`validation-badge ${conversion.validation.status === 'INVALID' ? 'badge-invalid' : conversion.validation.warnings.length ? 'badge-warning' : 'badge-valid'}`}>{conversion.validation.status}</span></div><ValidationSummary report={conversion.validation} /><div className="validation-rule-list">{validationRules.map((rule) => <div key={rule.label}><span className={ruleDotClass(conversion.validation, rule.codes)} />{rule.label}</div>)}</div></section></div><div className="col-xl-7"><JsonViewer value={conversion.resources} filename={`oah-site-${siteId}-validated.json`} /></div></div></>}
  <ValidationPlayground />
  </>
}
