import cors from 'cors'
import express, { type ErrorRequestHandler, type Request, type Response } from 'express'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { AiAgentService, GeminiConfigurationError, GeminiProviderError } from './agents/ai-agent.service.js'
import { ToolExecutorService } from './agents/tool-executor.service.js'
import { OahUnavailableError } from './adapters/oah/oah.adapter.js'
import { AquaManFhirService } from './services/aquamanfhir.service.js'
import type { ApiEnvelope, FhirResource } from './types/domain.js'

const app = express()
export const aquaManFhir = new AquaManFhirService()
const agent = new AiAgentService()
const toolExecutor = new ToolExecutorService(aquaManFhir)
const docsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs')
const allowedDocuments = new Set(['oah-data-discovery.md', 'architecture.md', 'data-flow.md', 'fhir-mapping.md', 'api.md', 'ai-agent.md', 'setup.md', 'limitations.md'])

app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') ?? ['http://localhost:5173'] }))
app.use(express.json({ limit: '1mb' }))

function sendSuccess<T>(response: Response, data: T, status = 200): void {
  const envelope: ApiEnvelope<T> = { success: true, data, error: null }
  response.status(status).json(envelope)
}

function sendError(response: Response, status: number, code: string, message: string): void {
  const envelope: ApiEnvelope<never> = { success: false, data: null, error: { code, message } }
  response.status(status).json(envelope)
}

function sendFhir(response: Response, resource: FhirResource, status = 200): void {
  response.status(status).type('application/fhir+json').json(resource)
}

function sendFhirOutcome(response: Response, status: number, code: string, diagnostics: string): void {
  sendFhir(response, {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code, diagnostics }],
  }, status)
}

app.get('/api/health', (_request, response) => sendSuccess(response, {
  status: 'ready',
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  oahApiBaseUrl: process.env.OAH_API_BASE_URL ?? 'https://api.enora-oah.eu',
  persistence: 'in-memory',
}))

app.get('/fhir/metadata', (request, response) => {
  sendFhir(response, {
    resourceType: 'CapabilityStatement',
    id: 'aquamanfhir-capability',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    rest: [{
      mode: 'server',
      resource: ['Location', 'Observation', 'Provenance', 'Bundle'].map((type) => ({
        type,
        interaction: [{ code: 'read' }],
      })),
    }],
  })
})

app.get('/fhir/:resourceType/:id', (request, response) => {
  const { resourceType, id } = request.params
  if (!['Location', 'Observation', 'Provenance', 'Bundle'].includes(resourceType)) {
    return sendFhirOutcome(response, 404, 'not-found', `FHIR resource type ${resourceType} is not available.`)
  }
  const resource = aquaManFhir.getResource(id)
  if (!resource || resource.resourceType !== resourceType) {
    return sendFhirOutcome(response, 404, 'not-found', `${resourceType}/${id} was not found. Convert a site or create a Bundle first.`)
  }
  return sendFhir(response, resource)
})

app.get('/api/docs/:name', async (request, response, next) => {
  const name = request.params.name
  if (!allowedDocuments.has(name)) return sendError(response, 404, 'DOCUMENT_NOT_FOUND', 'Documentation page not found.')
  try {
    const content = await readFile(join(docsDirectory, name), 'utf8')
    return sendSuccess(response, { name, content })
  } catch (error) { return next(error) }
})

app.get('/api/sites', async (_request, response, next) => {
  try { sendSuccess(response, await aquaManFhir.getSites()) } catch (error) { next(error) }
})

app.get('/api/sites/:id', async (request, response, next) => {
  try {
    const data = await aquaManFhir.getSite(request.params.id)
    if (!data) return sendError(response, 404, 'SITE_NOT_FOUND', 'Site not found.')
    return sendSuccess(response, data)
  } catch (error) { return next(error) }
})

app.get('/api/sites/:id/observations', async (request, response, next) => {
  try {
    const site = await aquaManFhir.getSite(request.params.id)
    if (!site) return sendError(response, 404, 'SITE_NOT_FOUND', 'Site not found.')
    return sendSuccess(response, await aquaManFhir.getObservations(request.params.id))
  } catch (error) { return next(error) }
})

app.get('/api/sites/:id/citizen-observations', async (_request, response) => {
  sendSuccess(response, await aquaManFhir.getCitizenObservations())
})

app.post('/api/fhir/convert/site/:id', async (request, response, next) => {
  try {
    const data = await aquaManFhir.convertSite(request.params.id)
    if (!data) return sendError(response, 404, 'SITE_NOT_FOUND', 'Site not found.')
    return sendSuccess(response, data)
  } catch (error) { return next(error) }
})

app.get('/api/fhir/resources/:id', (request, response) => {
  const resource = aquaManFhir.getResource(request.params.id)
  if (!resource) return sendError(response, 404, 'RESOURCE_NOT_FOUND', 'FHIR resource not found. Convert a site or create a Bundle first.')
  return sendSuccess(response, resource)
})

app.post('/api/fhir/validate', (request, response) => {
  const parsed = z.object({ resource: z.unknown().optional() }).safeParse(request.body)
  const resource = parsed.success && parsed.data.resource !== undefined ? parsed.data.resource : request.body
  return sendSuccess(response, aquaManFhir.validateResource(resource))
})

app.post('/api/fhir/bundle/:siteId', async (request, response, next) => {
  try {
    const data = await aquaManFhir.createBundle(request.params.siteId)
    if (!data) return sendError(response, 404, 'SITE_NOT_FOUND', 'Site not found.')
    return sendSuccess(response, data)
  } catch (error) { return next(error) }
})

app.post('/api/ai/query', async (request, response, next) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(4000), siteId: z.string().trim().optional() }).safeParse(request.body)
  if (!parsed.success) return sendError(response, 400, 'INVALID_REQUEST', 'Provide a non-empty message and optional siteId.')
  try {
    return sendSuccess(response, await agent.query(parsed.data.message, parsed.data.siteId, toolExecutor.execute))
  } catch (error) { return next(error) }
})

const errorHandler: ErrorRequestHandler = (error, _request: Request, response: Response, _next) => {
  if (error instanceof OahUnavailableError) {
    console.error('OneAquaHealth source failure:', error.message)
    return sendError(response, 502, 'OAH_UNAVAILABLE', 'OneAquaHealth data could not be retrieved.')
  }
  if (error instanceof GeminiConfigurationError) return sendError(response, 503, 'GEMINI_NOT_CONFIGURED', error.message)
  if (error instanceof GeminiProviderError) {
    console.error('Gemini provider failure:', error.diagnostic)
    const code = error.status === 503 ? 'GEMINI_TEMPORARILY_UNAVAILABLE' : 'GEMINI_PROVIDER_ERROR'
    return sendError(response, error.status, code, error.message)
  }
  console.error('Unhandled API error:', error)
  return sendError(response, 500, 'INTERNAL_ERROR', 'The request could not be completed.')
}
app.use(errorHandler)

export { app }
