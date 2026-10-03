import type { FhirResource } from '../types/domain.js'

export class ResourceRepository {
  private readonly resources = new Map<string, FhirResource>()

  save(resources: FhirResource[]): void {
    for (const resource of resources) {
      if (resource.id) this.resources.set(resource.id, structuredClone(resource))
    }
  }

  get(resourceId: string): FhirResource | undefined {
    const resource = this.resources.get(resourceId)
    return resource ? structuredClone(resource) : undefined
  }

  getAll(resourceType?: string): FhirResource[] {
    return [...this.resources.values()]
      .filter((resource) => resourceType === undefined || resource.resourceType === resourceType)
      .map((resource) => structuredClone(resource))
  }

  getBySite(siteId: string): FhirResource[] {
    return [...this.resources.values()]
      .filter((resource) => resource.resourceType === 'Location' && resource.id === siteId ||
        resource.resourceType === 'Observation' && typeof resource.subject === 'object' && resource.subject !== null && (resource.subject as { reference?: unknown }).reference === `Location/${siteId}` ||
        resource.resourceType === 'Provenance' && Array.isArray(resource.target) && resource.target.some((target) => typeof target === 'object' && target !== null && (target as { reference?: unknown }).reference === `Location/${siteId}`))
      .map((resource) => structuredClone(resource))
  }
}
