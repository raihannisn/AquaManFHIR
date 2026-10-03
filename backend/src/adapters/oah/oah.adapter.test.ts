import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OahAdapter, OahUnavailableError } from './oah.adapter.js'

let cacheDirectory = ''

async function createAdapter(): Promise<OahAdapter> {
  cacheDirectory = await mkdtemp(join(tmpdir(), 'aquamanfhir-oah-test-'))
  return new OahAdapter(undefined, 10_000, join(cacheDirectory, 'oah-snapshot.json'))
}

afterEach(async () => {
  vi.unstubAllGlobals()
  if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true })
  cacheDirectory = ''
})

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

    const adapter = await createAdapter()
    const result = await adapter.getSnapshot(true)
    expect(result.cities).toHaveLength(1)
    expect(result.sites[0].code).toBe('C1')
    expect(result.healthRisks[0].healthRiskScore).toBe(0.3)
    expect(result.urbanParameters[0].samplingDate).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(result.sourceErrors).toEqual([])
    const savedSnapshot = JSON.parse(await readFile(join(cacheDirectory, 'oah-snapshot.json'), 'utf8'))
    expect(savedSnapshot).toMatchObject({ retrievedAt: result.retrievedAt, sites: result.sites })
    expect(savedSnapshot.isCached).toBeUndefined()
  })

  it('keeps required catalogue failures fatal and optional analytics failures visible', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/cities/all')) return jsonResponse([{ id: 'CO', name: 'Coimbra' }])
      if (url.endsWith('/sites/all')) return jsonResponse([{ code: 'C1' }])
      return jsonResponse([], url.endsWith('/urban-parameters') ? 503 : 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect((await createAdapter()).getSnapshot(true)).rejects.toBeInstanceOf(OahUnavailableError)

    const validFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/cities/all')) return jsonResponse([{ id: 'CO', name: 'Coimbra' }])
      if (url.endsWith('/sites/all')) return jsonResponse([{ code: 'C1', name: 'Site' }])
      return jsonResponse([], url.endsWith('/urban-parameters') ? 503 : 200)
    })
    vi.stubGlobal('fetch', validFetch)
    const result = await (await createAdapter()).getSnapshot(true)
    expect(result.urbanParameters).toEqual([])
    expect(result.sourceErrors).toHaveLength(1)
    expect(result.sourceErrors[0].endpoint).toBe('/api/resilience-map/urban-parameters')
  })

  it('serves the saved raw snapshot and marks it cached after a later live catalogue failure', async () => {
    let liveSourceUnavailable = false
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (liveSourceUnavailable) throw new Error('offline')
      const url = String(input)
      if (url.endsWith('/cities/all')) return jsonResponse([{ id: 'CO', name: 'Coimbra' }])
      if (url.endsWith('/sites/all')) return jsonResponse([{ code: 'C1', name: 'Site' }])
      if (url.endsWith('/health-risks')) return jsonResponse([{ id: 1, researchSiteCode: 'C1', healthRiskScore: 0.3 }])
      return jsonResponse([{ id: 2, researchSiteCode: 'C1', urbanPct100m: 4 }])
    })
    vi.stubGlobal('fetch', fetchMock)
    const adapter = await createAdapter()

    const saved = await adapter.getSnapshot(true)
    liveSourceUnavailable = true
    const fallback = await adapter.getSnapshot(true)

    expect(fallback).toMatchObject({
      isCached: true,
      retrievedAt: saved.retrievedAt,
      sites: saved.sites,
      healthRisks: saved.healthRisks,
      urbanParameters: saved.urbanParameters,
    })
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })
})
