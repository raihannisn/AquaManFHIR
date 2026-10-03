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
const supportedFhirResourceTypes = ['Location', 'Observation', 'Provenance', 'Bundle'] as const
const readableFhirResourceTypes = [...supportedFhirResourceTypes, 'CodeSystem'] as const
const countSearchParameter = { name: '_count', type: 'number', definition: 'http://hl7.org/fhir/SearchParameter/Resource-count' }
const searchParametersByResourceType: Record<(typeof readableFhirResourceTypes)[number], Array<{ name: string; type: string; definition: string }>> = {
  Location: [countSearchParameter],
  Observation: [
    { name: 'subject', type: 'reference', definition: 'http://hl7.org/fhir/SearchParameter/Observation-subject' },
    countSearchParameter,
  ],
  Provenance: [
    { name: 'target', type: 'reference', definition: 'http://hl7.org/fhir/SearchParameter/Provenance-target' },
    countSearchParameter,
  ],
  Bundle: [],
  CodeSystem: [],
}

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

function singleQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseCount(value: unknown): number | null {
  if (value === undefined) return Number.MAX_SAFE_INTEGER
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const count = Number(value)
  return Number.isSafeInteger(count) ? count : null
}

function parseReference(value: string): { resourceType: string; id: string; reference: string } | undefined {
  const match = /(?:^|\/)(Location|Observation|Provenance|Bundle)\/([A-Za-z0-9.-]{1,64})\/?$/.exec(value)
  if (!match) return undefined
  return { resourceType: match[1], id: match[2], reference: `${match[1]}/${match[2]}` }
}

function searchset(request: Request, resources: FhirResource[], count: number): FhirResource {
  const origin = `${request.protocol}://${request.get('host') ?? 'localhost'}`
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    link: [{ relation: 'self', url: `${origin}${request.originalUrl}` }],
    entry: resources.slice(0, count).flatMap((resource) => resource.id ? [{
      fullUrl: `${origin}/fhir/${resource.resourceType}/${encodeURIComponent(resource.id)}`,
      resource,
    }] : []),
  }
}

function validationIssueCode(code: string): string {
  if (code === 'UNRESOLVED_REFERENCE') return 'not-found'
  if (code === 'UNSUPPORTED_RESOURCE_TYPE') return 'not-supported'
  if (code.startsWith('MISSING_')) return 'required'
  if (code === 'INVALID_RESOURCE' || code === 'FHIR_R4_SCHEMA') return 'structure'
  if (code.startsWith('INVALID_')) return 'value'
  return 'invalid'
}

function validationOutcome(report: ReturnType<AquaManFhirService['validateResource']>): FhirResource {
  const issueEntries = [
    ...report.errors.map((item) => ({ severity: 'error', code: validationIssueCode(item.code), details: { text: item.code }, diagnostics: item.message, ...(item.path ? { expression: [item.path] } : {}) })),
    ...report.warnings.map((item) => ({ severity: 'warning', code: 'incomplete', details: { text: item.code }, diagnostics: item.message, ...(item.path ? { expression: [item.path] } : {}) })),
  ]
  if (issueEntries.length === 0) {
    issueEntries.push({ severity: 'information', code: 'informational', details: { text: 'VALID' }, diagnostics: `Resource passed implemented checks. ${report.scope}` })
  }
  return { resourceType: 'OperationOutcome', issue: issueEntries }
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
      resource: readableFhirResourceTypes.map((type) => {
        const searchParam = searchParametersByResourceType[type]
        return {
          type,
          interaction: [{ code: 'read' }, ...(searchParam.length ? [{ code: 'search-type' }] : [])],
          ...(searchParam.length ? { searchParam } : {}),
          ...(supportedFhirResourceTypes.includes(type as typeof supportedFhirResourceTypes[number])
            ? { operation: [{ name: 'validate', definition: 'http://hl7.org/fhir/OperationDefinition/Resource-validate', type: true }] }
            : {}),
        }
      }),
    }],
  })
})

app.get('/fhir/Location', async (request, response) => {
  const count = parseCount(request.query._count)
  if (count === null) return sendFhirOutcome(response, 400, 'invalid', 'The _count search parameter must be a non-negative integer.')
  try {
    const locations = await aquaManFhir.getFhirLocations()
    return sendFhir(response, searchset(request, locations, count))
  } catch {
    return sendFhirOutcome(response, 502, 'transient', 'OneAquaHealth site data could not be retrieved for this search.')
  }
})

app.get('/fhir/Observation', async (request, response) => {
  const subjectValue = request.query.subject
  const subject = singleQueryValue(subjectValue)
  const count = parseCount(request.query._count)
  if (subjectValue !== undefined && !subject) return sendFhirOutcome(response, 400, 'invalid', 'Observation subject must be a single Location reference.')
  if (count === null) return sendFhirOutcome(response, 400, 'invalid', 'The _count search parameter must be a non-negative integer.')
  if (subject) {
    const reference = parseReference(subject)
    if (reference?.resourceType !== 'Location') {
      return sendFhirOutcome(response, 400, 'invalid', 'Observation subject must reference a Location resource.')
    }
    try {
      const converted = await aquaManFhir.convertSite(reference.id)
      const observations = converted?.resources.filter((resource) => resource.resourceType === 'Observation') ?? []
      return sendFhir(response, searchset(request, observations, count))
    } catch {
      return sendFhirOutcome(response, 502, 'transient', 'OneAquaHealth observations could not be retrieved for this search.')
    }
  }
  return sendFhir(response, searchset(request, aquaManFhir.getResourcesByType('Observation'), count))
})

app.get('/fhir/Provenance', async (request, response) => {
  const target = singleQueryValue(request.query.target)
  const count = parseCount(request.query._count)
  if (count === null) return sendFhirOutcome(response, 400, 'invalid', 'The _count search parameter must be a non-negative integer.')
  const reference = target ? parseReference(target) : undefined
  if (target && !reference) return sendFhirOutcome(response, 400, 'invalid', 'Provenance target must be a FHIR resource reference.')
  try {
    if (reference?.resourceType === 'Location') await aquaManFhir.convertSite(reference.id)
    const resources = aquaManFhir.getResourcesByType('Provenance')
    const matching = reference
      ? resources.filter((resource) => Array.isArray(resource.target) && resource.target.some((item) =>
        typeof item === 'object' && item !== null && (item as { reference?: unknown }).reference === reference.reference))
      : resources
    return sendFhir(response, searchset(request, matching, count))
  } catch {
    return sendFhirOutcome(response, 502, 'transient', 'OneAquaHealth provenance could not be retrieved for this search.')
  }
})

app.post(String.raw`/fhir/:resourceType/\$validate`, express.json({ type: 'application/fhir+json', limit: '1mb' }), (request, response) => {
  const endpointType = request.params.resourceType
  if (!supportedFhirResourceTypes.includes(endpointType as typeof supportedFhirResourceTypes[number])) {
    return sendFhirOutcome(response, 404, 'not-found', `FHIR resource type ${endpointType} is not available.`)
  }
  const requestBody = request.body
  if (requestBody && typeof requestBody === 'object' && 'resourceType' in requestBody && typeof requestBody.resourceType === 'string' && requestBody.resourceType !== endpointType) {
    return sendFhirOutcome(response, 400, 'invalid', `Resource type "${requestBody.resourceType}" does not match the endpoint type "${endpointType}".`)
  }
  return sendFhir(response, validationOutcome(aquaManFhir.validateResource(requestBody)))
})

app.get('/fhir/CodeSystem/oah-source-field', async (_request, response) => {
  try {
    return sendFhir(response, await aquaManFhir.getSourceFieldCodeSystem())
  } catch {
    return sendFhirOutcome(response, 502, 'transient', 'OneAquaHealth source fields could not be retrieved for the project CodeSystem.')
  }
})

app.get('/fhir/:resourceType/:id', (request, response) => {
  const { resourceType, id } = request.params
  if (!readableFhirResourceTypes.includes(resourceType as typeof readableFhirResourceTypes[number])) {
    return sendFhirOutcome(response, 404, 'not-found', `FHIR resource type ${resourceType} is not available.`)
  }
  const resource = aquaManFhir.getResource(id)
  if (resource?.resourceType !== resourceType) {
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


app.use('/fhir', (_request, response) => {
  sendFhirOutcome(response, 404, 'not-found', 'FHIR endpoint was not found.')
})
const errorHandler: ErrorRequestHandler = (error, _request: Request, response: Response, _next) => {
  const fhirError = getFhirErrorResponse(error, _request.originalUrl)
  if (fhirError) return sendFhirOutcome(response, fhirError.status, fhirError.code, fhirError.diagnostics)
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

function getFhirErrorResponse(error: unknown, requestUrl: string): { status: number; code: string; diagnostics: string } | undefined {
  if (!requestUrl.startsWith('/fhir/')) return undefined
  let statusCode = 500
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    statusCode = error.statusCode
  } else if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    statusCode = error.status
  }
  const status = statusCode >= 400 && statusCode < 600 ? statusCode : 500
  const badRequest = status === 400
  return {
    status,
    code: badRequest ? 'invalid' : 'exception',
    diagnostics: badRequest ? 'FHIR request body could not be parsed.' : 'FHIR operation could not be completed.',
  }
}

export { app }
