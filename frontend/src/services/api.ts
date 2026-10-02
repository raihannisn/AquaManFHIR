export interface ApiErrorBody {
  code: string
  message: string
}

export class ApiRequestError extends Error {
  constructor(message: string, readonly code = 'API_ERROR') {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: ApiErrorBody | null
}

export interface Site {
  id: string
  externalId: string
  name: string
  cityId?: string
  cityName?: string
  latitude?: number
  longitude?: number
  altitude?: number
  source: string
  sourceRetrievedAt: string
  observationCount?: number
}

export interface Observation {
  id: string
  siteId: string
  indicator: string
  displayName: string
  value: number
  valueType: 'number'
  unit?: string
  observedAt?: string
  source: string
  sourceRecordId: string
  sourceRetrievedAt: string
  originalField: string
  originalValue: number
  fhirStatus: 'GENERATED' | 'NOT GENERATED'
}

export interface ValidationIssue {
  code: string
  message: string
  path?: string
}

export interface ValidationReport {
  valid: boolean
  status: 'VALID' | 'VALID WITH WARNINGS' | 'INVALID'
  scope: string
  warnings: ValidationIssue[]
  errors: ValidationIssue[]
}

export interface FhirResource {
  resourceType: string
  id?: string
  [key: string]: unknown
}

export interface SiteListData {
  items: Array<Site & { observationCount: number }>
  recordCounts: { cities: number; sites: number; healthRiskRecords: number; urbanParameterRecords: number }
  retrievedAt: string
  sourceErrors: Array<{ endpoint: string; message: string }>
}

export interface SiteDetailData {
  site: Site
  raw: { healthRisk?: Record<string, unknown>; urbanParameters?: Record<string, unknown> }
  retrievedAt: string
  sourceErrors: Array<{ endpoint: string; message: string }>
}

export interface ObservationData {
  items: Observation[]
  retrievedAt: string
  sourceErrors: Array<{ endpoint: string; message: string }>
}

export interface ConversionData {
  resources: FhirResource[]
  normalized: Observation[]
  validation: ValidationReport
}

export interface BundleData {
  bundle: FhirResource
  resources: FhirResource[]
  validation: ValidationReport
}

export interface AgentAnswer {
  answer: string
  toolsUsed: string[]
  sources: string[]
}

export interface DocumentationPage {
  name: string
  content: string
}

export interface RuntimeHealth {
  status: string
  geminiConfigured: boolean
  oahApiBaseUrl: string
  persistence: string
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiRequestError('AquaManFHIR backend could not be reached. Start the API and try again.', 'API_UNREACHABLE')
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = await response.json() as ApiEnvelope<T>
  } catch {
    throw new ApiRequestError(`Backend returned an unreadable response (${response.status}).`, 'INVALID_RESPONSE')
  }
  if (!response.ok || !envelope.success || envelope.data === null) {
    throw new ApiRequestError(envelope.error?.message ?? `Request failed (${response.status}).`, envelope.error?.code)
  }
  return envelope.data
}

export const api = {
  getSites: () => request<SiteListData>('/sites'),
  getSite: (siteId: string) => request<SiteDetailData>(`/sites/${encodeURIComponent(siteId)}`),
  getObservations: (siteId: string) => request<ObservationData>(`/sites/${encodeURIComponent(siteId)}/observations`),
  convertSite: (siteId: string) => request<ConversionData>(`/fhir/convert/site/${encodeURIComponent(siteId)}`, { method: 'POST' }),
  createBundle: (siteId: string) => request<BundleData>(`/fhir/bundle/${encodeURIComponent(siteId)}`, { method: 'POST' }),
  validateResource: (resource: FhirResource) => request<ValidationReport>('/fhir/validate', { method: 'POST', body: JSON.stringify({ resource }) }),
  queryAgent: (message: string, siteId?: string) => request<AgentAnswer>('/ai/query', { method: 'POST', body: JSON.stringify({ message, siteId }) }),
  getDocumentation: (name: string) => request<DocumentationPage>(`/docs/${encodeURIComponent(name)}`),
  getHealth: () => request<RuntimeHealth>('/health'),
}
