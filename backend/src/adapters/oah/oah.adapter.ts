import { z } from 'zod'
import type { OahCity, OahMetricRecord, OahSite, OahSnapshot, OahSourceError } from '../../types/domain.js'

const citySchema = z.object({
  id: z.string(),
  name: z.string(),
  longitude: z.number().nullable().optional(),
  latitude: z.number().nullable().optional(),
}).passthrough()

const siteSchema = z.object({
  code: z.string(),
  name: z.string(),
  city: citySchema.nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  altitude: z.number().nullable().optional(),
}).passthrough()

const metricRecordSchema = z.object({
  id: z.union([z.string(), z.number()]),
  researchSiteCode: z.string(),
  samplingDate: z.string().nullable().optional(),
}).passthrough()

const endpointPaths = {
  cities: '/api/cities/all',
  sites: '/api/sites/all',
  healthRisks: '/api/resilience-map/health-risks',
  urbanParameters: '/api/resilience-map/urban-parameters',
} as const

export class OahUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OahUnavailableError'
  }
}

export class OahAdapter {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private cachedSnapshot?: OahSnapshot
  private cacheExpiresAt = 0

  constructor(baseUrl = process.env.OAH_API_BASE_URL ?? 'https://api.enora-oah.eu', timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.timeoutMs = timeoutMs
  }

  async getSnapshot(forceRefresh = false): Promise<OahSnapshot> {
    if (!forceRefresh && this.cachedSnapshot && Date.now() < this.cacheExpiresAt) {
      return this.cachedSnapshot
    }

    const [citiesResult, sitesResult, healthResult, urbanResult] = await Promise.allSettled([
      this.getArray(endpointPaths.cities, citySchema),
      this.getArray(endpointPaths.sites, siteSchema),
      this.getArray(endpointPaths.healthRisks, metricRecordSchema),
      this.getArray(endpointPaths.urbanParameters, metricRecordSchema),
    ])

    if (citiesResult.status === 'rejected' || sitesResult.status === 'rejected') {
      const reason = citiesResult.status === 'rejected' ? citiesResult.reason : sitesResult.status === 'rejected' ? sitesResult.reason : null
      throw new OahUnavailableError(reason instanceof Error ? reason.message : 'Required OneAquaHealth site data is unavailable.')
    }

    const sourceErrors: OahSourceError[] = []
    const optionalRecords = (result: PromiseSettledResult<OahMetricRecord[]>, endpoint: string): OahMetricRecord[] => {
      if (result.status === 'fulfilled') return result.value
      sourceErrors.push({ endpoint, message: result.reason instanceof Error ? result.reason.message : 'Source request failed.' })
      return []
    }

    const snapshot: OahSnapshot = {
      cities: citiesResult.value as OahCity[],
      sites: sitesResult.value as OahSite[],
      healthRisks: optionalRecords(healthResult, endpointPaths.healthRisks),
      urbanParameters: optionalRecords(urbanResult, endpointPaths.urbanParameters),
      sourceErrors,
      retrievedAt: new Date().toISOString(),
    }
    this.cachedSnapshot = snapshot
    this.cacheExpiresAt = Date.now() + 60_000
    return snapshot
  }

  getEndpointUrl(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private async getArray<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
    const endpoint = this.getEndpointUrl(path)
    let response: Response
    try {
      response = await fetch(endpoint, { signal: AbortSignal.timeout(this.timeoutMs) })
    } catch (error) {
      throw new OahUnavailableError(`OneAquaHealth request failed for ${path}: ${error instanceof Error ? error.message : 'network error'}`)
    }
    if (!response.ok) {
      throw new OahUnavailableError(`OneAquaHealth returned HTTP ${response.status} for ${path}.`)
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new OahUnavailableError(`OneAquaHealth returned invalid JSON for ${path}.`)
    }
    if (!Array.isArray(payload)) {
      throw new OahUnavailableError(`OneAquaHealth response for ${path} was not an array.`)
    }
    return payload.map((item, index) => {
      const parsed = schema.safeParse(item)
      if (!parsed.success) {
        throw new OahUnavailableError(`OneAquaHealth response for ${path} contains an invalid record at index ${index}.`)
      }
      return parsed.data
    })
  }
}
