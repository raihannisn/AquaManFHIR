export interface OahCity {
  id: string
  name: string
  longitude?: number | null
  latitude?: number | null
}

export interface OahSite {
  code: string
  name: string
  city?: OahCity | null
  polygon?: unknown
  latitude?: number | null
  longitude?: number | null
  altitude?: number | null
}

export interface OahMetricRecord {
  id: string | number
  researchSiteCode: string
  samplingDate?: string | null
  [field: string]: unknown
}

export interface OahSourceError {
  endpoint: string
  message: string
}

export interface OahSnapshot {
  cities: OahCity[]
  sites: OahSite[]
  healthRisks: OahMetricRecord[]
  urbanParameters: OahMetricRecord[]
  sourceErrors: OahSourceError[]
  retrievedAt: string
}

export interface NormalizedSite {
  id: string
  externalId: string
  name: string
  latitude?: number
  longitude?: number
  altitude?: number
  cityId?: string
  cityName?: string
  source: string
  sourceRetrievedAt: string
}

export interface NormalizedObservation {
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
}

export interface FhirResource {
  resourceType: string
  id?: string
  [field: string]: unknown
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
  /** Per-resource tally, present when several resources were validated together. */
  summary?: ValidationSummaryCounts
}

export interface ValidationSummaryCounts {
  resourcesChecked: number
  passed: number
  withWarnings: number
  rejected: number
}

export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}
