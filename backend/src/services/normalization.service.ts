import type { NormalizedObservation, NormalizedSite, OahMetricRecord, OahSnapshot } from '../types/domain.js'
import { OahAdapter } from '../adapters/oah/oah.adapter.js'

const siteEndpoint = '/api/sites/all'
const healthEndpoint = '/api/resilience-map/health-risks'
const urbanEndpoint = '/api/resilience-map/urban-parameters'

function displayFieldName(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([0-9]+)m$/, ' $1 m')
    .replace(/^./, (first) => first.toUpperCase())
}

function recordToObservations(
  record: OahMetricRecord,
  endpoint: string,
  retrievedAt: string,
): NormalizedObservation[] {
  const source = `${process.env.OAH_API_BASE_URL ?? 'https://api.enora-oah.eu'}${endpoint}`
  return Object.entries(record)
    .filter(([field, value]) => !['id', 'researchSiteCode', 'samplingDate'].includes(field) && typeof value === 'number' && Number.isFinite(value))
    .map(([field, value]) => {
      const numericValue = value as number
      const sourceRecordId = String(record.id)
      return {
        id: `${endpoint.split('/').at(-1)}-${sourceRecordId}-${field}`,
        siteId: record.researchSiteCode,
        indicator: field,
        displayName: displayFieldName(field),
        value: numericValue,
        valueType: 'number' as const,
        ...(record.samplingDate ? { observedAt: record.samplingDate } : {}),
        source,
        sourceRecordId: `${sourceRecordId}:${field}`,
        sourceRetrievedAt: retrievedAt,
        originalField: field,
        originalValue: numericValue,
      }
    })
}

export class NormalizationService {
  constructor(private readonly adapter: OahAdapter) {}

  async getSnapshot(forceRefresh = false): Promise<OahSnapshot> {
    return this.adapter.getSnapshot(forceRefresh)
  }

  normalizeSites(snapshot: OahSnapshot): NormalizedSite[] {
    const source = this.adapter.getEndpointUrl(siteEndpoint)
    return snapshot.sites.map((site) => ({
      id: site.code,
      externalId: site.code,
      name: site.name,
      ...(typeof site.latitude === 'number' ? { latitude: site.latitude } : {}),
      ...(typeof site.longitude === 'number' ? { longitude: site.longitude } : {}),
      ...(typeof site.altitude === 'number' ? { altitude: site.altitude } : {}),
      ...(site.city?.id ? { cityId: site.city.id } : {}),
      ...(site.city?.name ? { cityName: site.city.name } : {}),
      source,
      sourceRetrievedAt: snapshot.retrievedAt,
    }))
  }

  normalizeObservations(snapshot: OahSnapshot, siteId?: string): NormalizedObservation[] {
    const observations = [
      ...snapshot.healthRisks.flatMap((record) => recordToObservations(record, healthEndpoint, snapshot.retrievedAt)),
      ...snapshot.urbanParameters.flatMap((record) => recordToObservations(record, urbanEndpoint, snapshot.retrievedAt)),
    ]
    return siteId ? observations.filter((observation) => observation.siteId === siteId) : observations
  }

  getRawRecords(snapshot: OahSnapshot, siteId: string): { healthRisk?: OahMetricRecord; urbanParameters?: OahMetricRecord } {
    return {
      healthRisk: snapshot.healthRisks.find((record) => record.researchSiteCode === siteId),
      urbanParameters: snapshot.urbanParameters.find((record) => record.researchSiteCode === siteId),
    }
  }
}
