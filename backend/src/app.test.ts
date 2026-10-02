import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { app, aquaManFhir } from './app.js'

describe('API envelope and validation routes', () => {
  it('returns a readiness envelope', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ success: true, data: { status: 'ready' }, error: null })
  })

  it('exposes a FHIR R4 CapabilityStatement without the AquaManFHIR envelope', async () => {
    const response = await request(app).get('/fhir/metadata').set('Accept', 'application/fhir+json')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({ resourceType: 'CapabilityStatement', fhirVersion: '4.0.1' })
    expect(response.body.success).toBeUndefined()
    expect(response.body.rest[0].resource.map((resource: { type: string }) => resource.type)).toContain('Provenance')
  })

  it('returns FHIR OperationOutcome for an unavailable resource read', async () => {
    const response = await request(app).get('/fhir/Location/DOES-NOT-EXIST').set('Accept', 'application/fhir+json')
    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toContain('application/fhir+json')
    expect(response.body).toMatchObject({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] })
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
})
