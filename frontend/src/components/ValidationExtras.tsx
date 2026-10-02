import { FlaskConical, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { api, type FhirResource, type ValidationReport } from '../services/api'
import { ErrorState, StatTile, ValidationSummary } from './ui'

/** Rule rows for the validation page, derived from the real report instead of hardcoded. */
export const validationRules = [
  { label: 'Resource type and ID', codes: ['UNSUPPORTED_RESOURCE_TYPE', 'INVALID_RESOURCE', 'INVALID_ID', 'FHIR_R4_SCHEMA'] },
  { label: 'Required supported fields', codes: ['MISSING_NAME', 'INVALID_STATUS', 'MISSING_INDICATOR', 'MISSING_BUNDLE_ENTRIES', 'MISSING_PROVENANCE_AGENT'] },
  { label: 'Value datatype and references', codes: ['INVALID_VALUE', 'MISSING_SITE', 'INVALID_POSITION', 'INVALID_EFFECTIVE_DATE', 'UNRESOLVED_REFERENCE', 'INVALID_PROVENANCE_TARGET'] },
  { label: 'Sampling date availability', codes: ['MISSING_DATE'] },
  { label: 'Unit metadata availability', codes: ['MISSING_UNIT'] },
]

export function ruleDotClass(report: ValidationReport, codes: string[]): string {
  if (report.errors.some((item) => codes.includes(item.code))) return 'rule-dot rule-err'
  if (report.warnings.some((item) => codes.includes(item.code))) return 'rule-dot rule-warn'
  return 'rule-dot rule-ok'
}

export function ValidationScorecard({ report }: { report: ValidationReport }) {
  const summary = report.summary
  if (!summary || summary.resourcesChecked === 0) return null
  const pct = (value: number) => `${(value / summary.resourcesChecked) * 100}%`
  return <section className="mb-3">
    <div className="row g-3">
      <div className="col-6 col-xl-3"><StatTile label="RESOURCES CHECKED" value={summary.resourcesChecked} detail="Location · Observation · Provenance" /></div>
      <div className="col-6 col-xl-3"><StatTile label="PASSED CLEAN" value={summary.passed} detail="No errors, no warnings" tone="green" /></div>
      <div className="col-6 col-xl-3"><StatTile label="ACCEPTED WITH WARNINGS" value={summary.withWarnings} detail="Valid FHIR; source metadata is missing" tone="amber" /></div>
      <div className="col-6 col-xl-3"><StatTile label="REJECTED" value={summary.rejected} detail="Blocked by the quality gate" tone="coral" /></div>
    </div>
    <div className="quality-bar" role="img" aria-label={`${summary.passed} passed, ${summary.withWarnings} with warnings, ${summary.rejected} rejected`}>
      <span className="qb-pass" style={{ width: pct(summary.passed) }} />
      <span className="qb-warn" style={{ width: pct(summary.withWarnings) }} />
      <span className="qb-fail" style={{ width: pct(summary.rejected) }} />
    </div>
    <p className="quality-note">Warnings describe gaps in the source, such as no unit or no sampling date. AquaManFHIR reports them instead of inventing values. Errors mean a resource is not valid FHIR and is rejected.</p>
  </section>
}

const observationBase = {
  resourceType: 'Observation',
  meta: { source: 'https://api.enora-oah.eu' },
  status: 'unknown',
  code: { text: 'healthRiskScore' },
  valueQuantity: { value: 0.3091 },
  subject: { reference: 'Location/C1' },
}

const presets: Array<{ id: string; label: string; note: string; resource: FhirResource }> = [
  { id: 'valid', label: 'Source-faithful', note: 'Valid FHIR. Warns that the source gave no unit.', resource: { ...observationBase, id: 'demo-valid', effectiveDateTime: '2023-06-28' } },
  { id: 'missing', label: 'Missing fields', note: 'No status and no subject, so the Observation cannot be placed.', resource: { resourceType: 'Observation', id: 'demo-missing', meta: observationBase.meta, code: observationBase.code, valueQuantity: observationBase.valueQuantity } },
  { id: 'value', label: 'Wrong datatype', note: 'A text value where a number is required.', resource: { ...observationBase, id: 'demo-value', valueQuantity: { value: 'high' } } },
  { id: 'id', label: 'Invalid ID', note: 'FHIR ids allow only letters, digits, hyphens and periods.', resource: { ...observationBase, id: 'bad id_with spaces!' } },
  { id: 'date', label: 'Bad date format', note: 'FHIR dateTime must be ISO 8601, not DD/MM/YYYY.', resource: { ...observationBase, id: 'demo-date', effectiveDateTime: '28/06/2023' } },
  { id: 'ref', label: 'Broken reference', note: 'Bundle points to Location/ZZ9, which is not included.', resource: { resourceType: 'Bundle', id: 'demo-bundle', type: 'collection', entry: [{ resource: { ...observationBase, id: 'o1', subject: { reference: 'Location/ZZ9' } } }] } },
]

export function ValidationPlayground() {
  const [activeId, setActiveId] = useState('missing')
  const [text, setText] = useState(() => JSON.stringify(presets[1].resource, null, 2))
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = presets.find((item) => item.id === activeId)

  function choose(id: string) {
    const preset = presets.find((item) => item.id === id)
    if (!preset) return
    setActiveId(id); setText(JSON.stringify(preset.resource, null, 2)); setReport(null); setError('')
  }
  async function run() {
    setError(''); setReport(null)
    let parsed: FhirResource
    try { parsed = JSON.parse(text) as FhirResource } catch { setError('The text is not valid JSON. Fix the syntax and try again.'); return }
    setBusy(true)
    try { setReport(await api.validateResource(parsed)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Validation could not run.') }
    finally { setBusy(false) }
  }

  return <section className="panel-card mt-3">
    <div className="panel-heading"><div><div className="eyebrow">QUALITY GATE / TRY IT</div><h2>Validation playground</h2></div><span className="playground-icon"><FlaskConical size={16} /></span></div>
    <p className="playground-lead">Pick a broken resource, or edit the JSON yourself, and watch the gate decide. The same validator runs on every generated resource.</p>
    <div className="preset-row" role="tablist" aria-label="Example resources">
      {presets.map((preset) => <button key={preset.id} type="button" role="tab" aria-selected={preset.id === activeId} className={`preset-chip${preset.id === activeId ? ' active' : ''}`} onClick={() => choose(preset.id)}>{preset.label}</button>)}
    </div>
    <div className="row g-3">
      <div className="col-xl-6">
        <div className="playground-note"><ShieldCheck size={13} /> {active?.note}</div>
        <textarea className="playground-editor" spellCheck={false} value={text} onChange={(event) => { setText(event.target.value); setReport(null) }} aria-label="FHIR resource JSON" />
        <button type="button" className="btn btn-primary btn-sm mt-2" onClick={run} disabled={busy}>{busy ? 'Validating…' : 'Validate resource'}</button>
      </div>
      <div className="col-xl-6">
        {error && <ErrorState message={error} />}
        {report && <ValidationSummary report={report} />}
        {!report && !error && <div className="playground-empty">The result appears here. Errors reject a resource. Warnings only flag missing source metadata.</div>}
      </div>
    </div>
  </section>
}
