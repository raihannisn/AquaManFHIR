import type { FhirResource, NormalizedObservation, NormalizedSite } from '../types/domain.js'

function toFhirDateTime(value: string): string {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  return value.includes('T') && !hasTimezone ? value.slice(0, 10) : value
}

export function mapLocation(site: NormalizedSite): FhirResource {
  return {
    resourceType: 'Location',
    id: site.externalId,
    meta: { source: site.source },
    identifier: [{ system: site.source, value: site.externalId }],
    name: site.name,
    ...(site.latitude !== undefined && site.longitude !== undefined
      ? { position: { latitude: site.latitude, longitude: site.longitude } }
      : {}),
  }
}

export function getFhirObservationId(observation: NormalizedObservation): string {
  return observation.id.replace(/[^A-Za-z0-9.-]/g, '-').slice(0, 64)
}

export function mapObservation(observation: NormalizedObservation): FhirResource {
  return {
    resourceType: 'Observation',
    id: getFhirObservationId(observation),
    meta: { source: observation.source },
    identifier: [{ system: observation.source, value: observation.sourceRecordId }],
    status: 'unknown',
    code: { text: observation.indicator },
    valueQuantity: { value: observation.value },
    subject: { reference: `Location/${observation.siteId}` },
    ...(observation.observedAt ? { effectiveDateTime: toFhirDateTime(observation.observedAt) } : {}),
  }
}

export function mapProvenance(siteId: string, resources: FhirResource[], observations: NormalizedObservation[], sourceRetrievedAt: string): FhirResource {
  return {
    resourceType: 'Provenance',
    id: `provenance-${siteId}`.replace(/[^A-Za-z0-9.-]/g, '-').slice(0, 64),
    meta: { source: 'https://api.enora-oah.eu' },
    target: resources.map((resource) => ({ reference: `${resource.resourceType}/${resource.id}` })),
    recorded: sourceRetrievedAt,
    activity: { text: 'Normalize and map OneAquaHealth source data to FHIR R4' },
    agent: [{ who: { display: 'AquaManFHIR OAH data adapter' } }],
    entity: observations.map((observation) => ({
      role: 'source',
      what: { identifier: { system: observation.source, value: observation.sourceRecordId } },
    })),
  }
}

export function mapSiteResources(site: NormalizedSite, observations: NormalizedObservation[], sourceRetrievedAt: string): FhirResource[] {
  const resources = [mapLocation(site), ...observations.filter((item) => item.siteId === site.id).map(mapObservation)]
  return [...resources, mapProvenance(site.id, resources, observations.filter((item) => item.siteId === site.id), sourceRetrievedAt)]
}

export function mapBundle(siteId: string, resources: FhirResource[]): FhirResource {
  return {
    resourceType: 'Bundle',
    id: `oah-site-${siteId}`.replace(/[^A-Za-z0-9.-]/g, '-').slice(0, 64),
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: resources.map((resource) => ({ resource })),
  }
}
