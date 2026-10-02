import { afterEach, describe, expect, it, vi } from 'vitest'
import { OahAdapter, OahUnavailableError } from './oah.adapter.js'

afterEach(() => vi.unstubAllGlobals())

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('OAH adapter', () => {
  it('retrieves and shape-checks the four verified public endpoint payloads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/cities/all')) return jsonResponse([{ id: 'CO', name: 'Coimbra', longitude: -8.4, latitude: 40.2 }])
      if (url.endsWith('/sites/all')) return jsonResponse([{ code: 'C1', name: 'Exploratório', city: { id: 'CO', name: 'Coimbra' }, latitude: 40.1, longitude: -8.4 }])
      if (url.endsWith('/health-risks')) return jsonResponse([{ id: 1, researchSiteCode: 'C1', healthRiskScore: 0.3 }])
      return jsonResponse([{ id: 2, researchSiteCode: 'C1', samplingDate: null, urbanPct100m: 4 }])
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await new OahAdapter().getSnapshot(true)
    expect(result.cities).toHaveLength(1)
    expect(result.sites[0].code).toBe('C1')
    expect(result.healthRisks[0].healthRiskScore).toBe(0.3)
    expect(result.urbanParameters[0].samplingDate).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(result.sourceErrors).toEqual([])
  })

  it('keeps required catalogue failures fatal and optional analytics failures visible', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/cities/all')) return jsonResponse([{ id: 'CO', name: 'Coimbra' }])
      if (url.endsWith('/sites/all')) return jsonResponse([{ code: 'C1' }])
      return jsonResponse([], url.endsWith('/urban-parameters') ? 503 : 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(new OahAdapter().getSnapshot(true)).rejects.toBeInstanceOf(OahUnavailableError)

    const validFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/cities/all')) return jsonResponse([{ id: 'CO', name: 'Coimbra' }])
      if (url.endsWith('/sites/all')) return jsonResponse([{ code: 'C1', name: 'Site' }])
      return jsonResponse([], url.endsWith('/urban-parameters') ? 503 : 200)
    })
    vi.stubGlobal('fetch', validFetch)
    const result = await new OahAdapter().getSnapshot(true)
    expect(result.urbanParameters).toEqual([])
    expect(result.sourceErrors).toHaveLength(1)
    expect(result.sourceErrors[0].endpoint).toBe('/api/resilience-map/urban-parameters')
  })
})
