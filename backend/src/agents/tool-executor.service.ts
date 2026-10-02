import type { ToolExecution } from './ai-agent.service.js'
import type { AquaManFhirService } from '../services/aquamanfhir.service.js'

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export class ToolExecutorService {
  constructor(private readonly aquaManFhir: AquaManFhirService) {}

  execute = async (name: string, args: Record<string, unknown>): Promise<ToolExecution> => {
    const siteId = nonEmptyString(args.siteId)
    const resourceId = nonEmptyString(args.resourceId)
    switch (name) {
      case 'getSites': {
        const data = await this.aquaManFhir.getSites()
        return { result: data, sources: data.items.map((site) => site.externalId) }
      }
      case 'getSite': {
        if (!siteId) return { result: { error: 'siteId is required' }, sources: [] }
        const data = await this.aquaManFhir.getSite(siteId)
        return { result: data ?? { error: 'Site not found' }, sources: data ? [data.site.externalId] : [] }
      }
      case 'getObservations': {
        if (!siteId) return { result: { error: 'siteId is required' }, sources: [] }
        const data = await this.aquaManFhir.getObservations(siteId)
        return { result: data, sources: data.items.map((item) => item.sourceRecordId) }
      }
      case 'getCitizenObservations':
        return { result: await this.aquaManFhir.getCitizenObservations(), sources: [] }
      case 'getFHIRResources': {
        if (!siteId) return { result: { error: 'siteId is required' }, sources: [] }
        const data = await this.aquaManFhir.convertSite(siteId)
        return { result: data ?? { error: 'Site not found' }, sources: data ? data.resources.map((resource) => `${resource.resourceType}/${resource.id}`) : [] }
      }
      case 'validateFHIR':
      case 'getValidationReport': {
        if (!resourceId) return { result: { error: 'resourceId is required' }, sources: [] }
        const report = this.aquaManFhir.getValidationReport(resourceId)
        return { result: report ?? { error: 'Resource not found' }, sources: report ? [resourceId] : [] }
      }
      case 'createFHIRBundle': {
        if (!siteId) return { result: { error: 'siteId is required' }, sources: [] }
        const data = await this.aquaManFhir.createBundle(siteId)
        return { result: data ?? { error: 'Site not found' }, sources: data ? [`Bundle/${data.bundle.id}`, ...data.resources.map((resource) => `${resource.resourceType}/${resource.id}`)] : [] }
      }
      default:
        return { result: { error: 'Tool is not available.' }, sources: [] }
    }
  }
}
