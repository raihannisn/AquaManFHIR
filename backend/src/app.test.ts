import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { AiAgentService, GeminiProviderError } from './agents/ai-agent.service.js'
import { app, aquaManFhir } from './app.js'
import type { FhirResource, ValidationReport } from './types/domain.js'

function conversion(resources: FhirResource[]) {
  const validation: ValidationReport = { valid: true, status: 'VALID', scope: 'test validation scope', warnings: [], errors: [] }
  return { resources, normalized: [], validation, isCached: false }
}

describe('API envelope and validation routes', () => {
  it('returns a readiness envelope', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ success: true, data: { status: 'ready' }, error: null })
  })

  it('exposes cached OAH snapshot status in the sites API envelope', async () => {
    const getSites = vi.spyOn(aquaManFhir, 'getSites').mockResolvedValue({
      items: [],
      recordCounts: { cities: 0, sites: 0, healthRiskRecords: 0, urbanParameterRecords: 0 },
      retrievedAt: '2026-10-03T00:00:00.000Z',
      sourceErrors: [],
      isCached: true,
    })
    try {
      const response = await request(app).get('/api/sites')
      expect(response.status).toBe(200)
      expect(response.body.data).toMatchObject({ isCached: true, retrievedAt: '2026-10-03T00:00:00.000Z' })
    } finally {
      getSites.mockRestore()
    }
  })

  it('exposes a FHIR R4 CapabilityStatement without the AquaManFHIR envelope', async () => {
    const response = await request(app).get('/fhir/metadata').set('Accept', 'application/fhir+json')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({ resourceType: 'CapabilityStatement', fhirVersion: '4.0.1' })
    expect(response.body.success).toBeUndefined()
    const resources = response.body.rest[0].resource as Array<{ type: string; interaction: Array<{ code: string }>; operation?: Array<{ name: string }> }>
    expect(resources.map((resource) => resource.type)).toEqual(['Location', 'Observation', 'Provenance', 'Bundle', 'CodeSystem'])
    expect(resources.filter((resource) => resource.type !== 'CodeSystem').every((resource) => resource.operation?.some((operation) => operation.name === 'validate'))).toBe(true)
    expect(resources.find((resource) => resource.type === 'Bundle')?.interaction).not.toContainEqual({ code: 'search-type' })
    expect(resources.find((resource) => resource.type === 'CodeSystem')?.interaction).toEqual([{ code: 'read' }])
    expect(response.body.rest[0].resource.find((resource: { type: string }) => resource.type === 'Observation')).toMatchObject({
      interaction: expect.arrayContaining([expect.objectContaining({ code: 'search-type' })]),
      searchParam: expect.arrayContaining([expect.objectContaining({ name: 'subject', type: 'reference' })]),
      operation: [expect.objectContaining({ name: 'validate', type: true })],
    })
    expect(response.body.rest[0].resource.find((resource: { type: string }) => resource.type === 'Provenance').searchParam)
      .toContainEqual(expect.objectContaining({ name: 'target', type: 'reference' }))
  })

  it('returns a FHIR Location searchset with fullUrls and total', async () => {
    const locations: FhirResource[] = [
      { resourceType: 'Location', id: 'C1', name: 'Site 1' },
      { resourceType: 'Location', id: 'C2', name: 'Site 2' },
    ]
    const locationSearch = vi.spyOn(aquaManFhir, 'getFhirLocations').mockResolvedValue(locations)
    try {
      const response = await request(app).get('/fhir/Location?_count=1').set('Accept', 'application/fhir+json')
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/fhir+json')
      expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset', total: 2 })
      expect(response.body.entry).toHaveLength(1)
      expect(response.body.entry[0]).toMatchObject({ fullUrl: expect.stringMatching(/\/fhir\/Location\/C1$/), resource: locations[0] })
    } finally {
      locationSearch.mockRestore()
    }
  })

  it('generates site Observations on demand for a subject search', async () => {
    const resources: FhirResource[] = [
      { resourceType: 'Location', id: 'C1', name: 'Site 1' },
      { resourceType: 'Observation', id: 'obs-1', subject: { reference: 'Location/C1' } },
      { resourceType: 'Observation', id: 'obs-2', subject: { reference: 'Location/C1' } },
      { resourceType: 'Provenance', id: 'prov-C1', target: [{ reference: 'Location/C1' }] },
    ]
    const convertSite = vi.spyOn(aquaManFhir, 'convertSite').mockResolvedValue(conversion(resources))
    try {
      const response = await request(app).get('/fhir/Observation?subject=Location/C1&_count=1').set('Accept', 'application/fhir+json')
      expect(convertSite).toHaveBeenCalledWith('C1')
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/fhir+json')
      expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset', total: 2 })
      expect(response.body.entry).toHaveLength(1)
      expect(response.body.entry[0]).toMatchObject({ fullUrl: expect.stringMatching(/\/fhir\/Observation\/obs-1$/), resource: resources[1] })
    } finally {
      convertSite.mockRestore()
    }
  })

  it('returns an empty searchset when a site has no generated Observations', async () => {
    const resources: FhirResource[] = [
      { resourceType: 'Location', id: 'C-EMPTY', name: 'Site without metrics' },
      { resourceType: 'Provenance', id: 'prov-C-EMPTY', target: [{ reference: 'Location/C-EMPTY' }] },
    ]
    const convertSite = vi.spyOn(aquaManFhir, 'convertSite').mockResolvedValue(conversion(resources))
    try {
      const response = await request(app).get('/fhir/Observation?subject=Location/C-EMPTY')
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset', total: 0, entry: [] })
    } finally {
      convertSite.mockRestore()
    }
  })

  it('allows Observation searches without a subject and returns stored matches', async () => {
    const observation: FhirResource = { resourceType: 'Observation', id: 'obs-stored', subject: { reference: 'Location/C1' } }
    const resourceSearch = vi.spyOn(aquaManFhir, 'getResourcesByType').mockReturnValue([observation])
    try {
      const response = await request(app).get('/fhir/Observation')
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset', total: 1 })
      expect(response.body.entry[0].resource).toEqual(observation)
    } finally {
      resourceSearch.mockRestore()
    }
  })

  it('searches generated Provenance by target and prepares the site on demand', async () => {
    const provenance: FhirResource = {
      resourceType: 'Provenance',
      id: 'prov-C1',
      target: [{ reference: 'Location/C1' }, { reference: 'Observation/obs-1' }],
    }
    const convertSite = vi.spyOn(aquaManFhir, 'convertSite').mockResolvedValue(conversion([
      { resourceType: 'Location', id: 'C1', name: 'Site 1' },
      provenance,
    ]))
    const getResourcesByType = vi.spyOn(aquaManFhir, 'getResourcesByType').mockReturnValue([provenance])
    try {
      const response = await request(app).get('/fhir/Provenance?target=Location/C1')
      expect(convertSite).toHaveBeenCalledWith('C1')
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset', total: 1 })
      expect(response.body.entry[0].resource).toEqual(provenance)
    } finally {
      convertSite.mockRestore()
      getResourcesByType.mockRestore()
    }
  })

  it('returns FHIR OperationOutcome for an unavailable resource read', async () => {
    const response = await request(app).get('/fhir/Location/DOES-NOT-EXIST').set('Accept', 'application/fhir+json')
    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] })
  })

  it('returns an OperationOutcome for a valid FHIR $validate request', async () => {
    const response = await request(app)
      .post('/fhir/Location/$validate')
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Location', id: 'C1', name: 'Exploratório', meta: { source: 'https://api.enora-oah.eu/api/sites/all' } })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [expect.objectContaining({ severity: 'information', code: 'informational' })],
    })
  })

  it('returns an OperationOutcome error when the FHIR resourceType does not match the endpoint', async () => {
    const response = await request(app)
      .post('/fhir/Location/$validate')
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Observation', id: 'obs-1', status: 'final' })
    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [expect.objectContaining({ severity: 'error', code: 'invalid' })],
    })
    expect(response.body.issue[0].diagnostics).toContain('Location')
    expect(response.body.issue[0].diagnostics).toContain('Observation')
  })

  it('returns OperationOutcome errors and warnings for an invalid FHIR $validate request', async () => {
    const response = await request(app)
      .post('/fhir/Observation/$validate')
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Observation', id: 'not a valid id', status: 'made-up' })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body.resourceType).toBe('OperationOutcome')
    expect(response.body.issue).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: expect.any(String),
      details: { text: 'INVALID_ID' },
      diagnostics: expect.stringContaining('FHIR id'),
      expression: ['id'],
    }))
    expect(response.body.issue).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'incomplete' }))
  })

  it('returns an OperationOutcome for an invalid subject search parameter', async () => {
    const response = await request(app).get('/fhir/Observation?subject=Patient/P1')
    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid' }] })
  })

  it('returns a FHIR OperationOutcome for a malformed FHIR JSON body', async () => {
    const response = await request(app)
      .post('/fhir/Observation/$validate')
      .set('Content-Type', 'application/fhir+json')
      .send('{"resourceType":')
    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid' }] })
  })

  it('serves generated resources directly to a FHIR client', async () => {
    const resource = {
      resourceType: 'Observation',
      id: 'health-risks-21-healthRiskScore',
      status: 'unknown',
      code: { text: 'healthRiskScore' },
      subject: { reference: 'Location/C1' },
      valueQuantity: { value: 0.2199 },
    }
    const resourceLookup = vi.spyOn(aquaManFhir, 'getResource').mockReturnValue(resource)
    try {
      const response = await request(app).get('/fhir/Observation/health-risks-21-healthRiskScore').set('Accept', 'application/fhir+json')
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/fhir+json')
      expect(response.body).toEqual(resource)
      expect(response.body.success).toBeUndefined()
    } finally {
      resourceLookup.mockRestore()
    }
  })

  it('serves the project source-field CodeSystem as a FHIR resource', async () => {
    const codeSystem: FhirResource = {
      resourceType: 'CodeSystem',
      id: 'oah-source-field',
      url: 'https://aquamanfhir.example/fhir/CodeSystem/oah-source-field',
      status: 'active',
      content: 'fragment',
      concept: [{ code: 'healthRiskScore', display: 'Health Risk Score' }],
    }
    const getCodeSystem = vi.spyOn(aquaManFhir, 'getSourceFieldCodeSystem').mockResolvedValue(codeSystem)
    try {
      const response = await request(app).get('/fhir/CodeSystem/oah-source-field').set('Accept', 'application/fhir+json')
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/fhir+json')
      expect(response.body).toEqual(codeSystem)
    } finally {
      getCodeSystem.mockRestore()
    }
  })

  it('serves whitelisted project documentation and rejects other files', async () => {
    const response = await request(app).get('/api/docs/oah-data-discovery.md')
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ name: 'oah-data-discovery.md' })
    expect(response.body.data.content).toContain('/api/resilience-map/health-risks')

    const rejected = await request(app).get('/api/docs/.env')
    expect(rejected.status).toBe(404)
    expect(rejected.body.error.code).toBe('DOCUMENT_NOT_FOUND')
  })

  it('returns a real validation report for a supported resource', async () => {
    const response = await request(app).post('/api/fhir/validate').send({
      resource: {
        resourceType: 'Location',
        id: 'C1',
        name: 'Exploratório',
        meta: { source: 'https://api.enora-oah.eu/api/sites/all' },
      },
    })
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ valid: true, status: 'VALID', errors: [], warnings: [] })
  })

  it('accepts a FHIR resource as the request body directly', async () => {
    const response = await request(app).post('/api/fhir/validate').send({
      resourceType: 'Location',
      id: 'C1',
      name: 'Exploratório',
      meta: { source: 'https://api.enora-oah.eu/api/sites/all' },
    })
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ valid: true, status: 'VALID' })
  })

  it('rejects invalid AI requests before provider access', async () => {
    const response = await request(app).post('/api/ai/query').send({ message: '' })
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ success: false, data: null, error: { code: 'INVALID_REQUEST' } })
  })

  it('reports missing Gemini configuration without returning a fabricated answer', async () => {
    const originalKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    try {
      const response = await request(app).post('/api/ai/query').send({ message: 'What observations are available?', siteId: 'C1' })
      expect(response.status).toBe(503)
      expect(response.body).toMatchObject({ success: false, data: null, error: { code: 'GEMINI_NOT_CONFIGURED' } })
    } finally {
      if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey
    }
  })

  it('redacts fake Gemini key shapes from provider HTTP errors and logs', async () => {
    const previousKey = process.env.GEMINI_API_KEY
    const configuredFakeKey = 'configured-test-secret-value-0123456789'
    const aiStudioFakeKey = ['AIza', 'FAKE_KEY_12345678901234567890'].join('')
    const alternateFakeKey = ['AQ.', 'FAKE_PROVIDER_KEY_12345678901234567890'].join('')
    process.env.GEMINI_API_KEY = configuredFakeKey
    const query = vi.spyOn(AiAgentService.prototype, 'query').mockRejectedValue(
      new GeminiProviderError('fake-model', `403 denied ${configuredFakeKey} ${aiStudioFakeKey} ${alternateFakeKey}`),
    )
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const response = await request(app).post('/api/ai/query').send({ message: 'Check source data' })
      const responseBody = JSON.stringify(response.body)
      const logOutput = JSON.stringify(logger.mock.calls)

      expect(response.status).toBe(502)
      for (const fakeKey of [configuredFakeKey, aiStudioFakeKey, alternateFakeKey]) {
        expect(responseBody).not.toContain(fakeKey)
        expect(logOutput).not.toContain(fakeKey)
      }
    } finally {
      query.mockRestore()
      logger.mockRestore()
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = previousKey
    }
  })
})
