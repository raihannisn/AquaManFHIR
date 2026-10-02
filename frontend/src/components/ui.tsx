import { Check, Copy, Download, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ValidationReport } from '../services/api'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading d-flex flex-wrap align-items-end justify-content-between gap-3"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

export function StatTile({ label, value, detail, tone = 'aqua' }: { label: string; value: string | number; detail: string; tone?: 'aqua' | 'green' | 'amber' | 'coral' }) {
  return <div className={`stat-tile stat-${tone}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>
}

export function LoadingState({ message = 'Loading connected data...' }: { message?: string }) {
  return <div className="state-panel"><LoaderCircle size={18} className="spin" /><span>{message}</span></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="alert data-alert alert-danger d-flex align-items-center justify-content-between gap-3" role="alert"><span><TriangleAlert size={16} className="me-2" />{message}</span>{onRetry && <button className="btn btn-sm btn-outline-danger" onClick={onRetry}>Retry</button>}</div>
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-mark">—</div><strong>{title}</strong><span>{detail}</span></div>
}

export function JsonViewer({ value, filename }: { value: unknown; filename?: string }) {
  const [copied, setCopied] = useState(false)
  const json = JSON.stringify(value, null, 2)
  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/fhir+json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename ?? 'aquamanfhir-resource.json'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="json-frame"><div className="json-toolbar"><span>FHIR JSON</span><div className="d-flex gap-1"><button className="icon-button" onClick={copy} title={copied ? 'Copied' : 'Copy JSON'} aria-label={copied ? 'Copied' : 'Copy JSON'}>{copied ? <Check size={15} /> : <Copy size={15} />}</button><button className="icon-button" onClick={download} title="Download JSON" aria-label="Download JSON"><Download size={15} /></button></div></div><pre><code>{json}</code></pre></div>
}

export function ValidationSummary({ report }: { report: ValidationReport }) {
  const variant = report.status === 'INVALID' ? 'danger' : report.warnings.length ? 'warning' : 'success'
  type Issue = ValidationReport['warnings'][number]
  const groups = new Map<string, { issue: Issue; count: number; severity: 'error' | 'warning' }>()
  for (const [list, severity] of [[report.errors, 'error'], [report.warnings, 'warning']] as const) {
    for (const issue of list) {
      const key = `${severity}:${issue.code}`
      const current = groups.get(key)
      groups.set(key, { issue, severity, count: (current?.count ?? 0) + 1 })
    }
  }
  return <div className={`validation-summary validation-${variant}`}>
    <div className="d-flex align-items-center justify-content-between gap-2"><strong>{report.status}</strong><span className="validation-counts">{report.errors.length} errors · {report.warnings.length} warnings</span></div>
    <div className="validation-scope">{report.scope}</div>
    {[...groups.entries()].map(([key, { issue, count, severity }]) => <div className={`validation-issue issue-${severity}`} key={key}>
      <span className="issue-code">{severity === 'error' ? 'ERROR' : 'WARN'} · {issue.code}{count > 1 ? ` × ${count}` : ''}</span>
      <span>{issue.message}{count === 1 && issue.path ? <code className="issue-path"> {issue.path}</code> : null}</span>
    </div>)}
    {report.errors.length === 0 && report.warnings.length === 0 && <div className="validation-issue">All implemented structural checks passed.</div>}
  </div>
}
