import type { FhirResource, NormalizedObservation, NormalizedSite, OahSnapshot, ValidationReport } from '../types/domain.js'
import { OahAdapter } from '../adapters/oah/oah.adapter.js'
import { getFhirObservationId, mapBundle, mapLocation, mapSiteResources, mapSourceFieldCodeSystem } from './fhir-mapping.service.js'
import { NormalizationService } from './normalization.service.js'
import { ResourceRepository } from '../repositories/resource.repository.js'
import { validateFhirResource } from './fhir-validation.service.js'

export class AquaManFhirService {
  private readonly normalizer: NormalizationService
  private readonly resources: ResourceRepository

  constructor(normalizer = new NormalizationService(new OahAdapter()), resources = new ResourceRepository()) {
    this.normalizer = normalizer
    this.resources = resources
  }

  async getSites(): Promise<{ items: Array<NormalizedSite & { observationCount: number }>; recordCounts: { cities: number; sites: number; healthRiskRecords: number; urbanParameterRecords: number }; retrievedAt: string; sourceErrors: OahSnapshot['sourceErrors']; isCached: boolean }> {
    const snapshot = await this.normalizer.getSnapshot()
    const sites = this.normalizer.normalizeSites(snapshot)
    const observations = this.normalizer.normalizeObservations(snapshot)
    return {
      items: sites.map((site) => ({ ...site, observationCount: observations.filter((item) => item.siteId === site.id).length })),
      recordCounts: { cities: snapshot.cities.length, sites: snapshot.sites.length, healthRiskRecords: snapshot.healthRisks.length, urbanParameterRecords: snapshot.urbanParameters.length },
      retrievedAt: snapshot.retrievedAt,
      sourceErrors: snapshot.sourceErrors,
      isCached: snapshot.isCached ?? false,
    }
  }

  async getFhirLocations(): Promise<FhirResource[]> {
    const snapshot = await this.normalizer.getSnapshot()
    const locations = this.normalizer.normalizeSites(snapshot).map(mapLocation)
    this.resources.save(locations)
    return locations
  }

  async getSourceFieldCodeSystem(): Promise<FhirResource> {
    const snapshot = await this.normalizer.getSnapshot()
    return mapSourceFieldCodeSystem(this.normalizer.normalizeObservations(snapshot))
  }

  async getSite(siteId: string): Promise<{ site: NormalizedSite; raw: ReturnType<NormalizationService['getRawRecords']>; retrievedAt: string; sourceErrors: OahSnapshot['sourceErrors']; isCached: boolean } | null> {
    const snapshot = await this.normalizer.getSnapshot()
    const site = this.normalizer.normalizeSites(snapshot).find((item) => item.id === siteId)
    if (!site) return null
    return { site, raw: this.normalizer.getRawRecords(snapshot, siteId), retrievedAt: snapshot.retrievedAt, sourceErrors: snapshot.sourceErrors, isCached: snapshot.isCached ?? false }
  }

  async getObservations(siteId?: string): Promise<{ items: Array<NormalizedObservation & { fhirStatus: 'GENERATED' | 'NOT GENERATED' }>; retrievedAt: string; sourceErrors: OahSnapshot['sourceErrors']; isCached: boolean }> {
    const snapshot = await this.normalizer.getSnapshot()
    return {
      items: this.normalizer.normalizeObservations(snapshot, siteId).map((observation) => ({
        ...observation,
        fhirStatus: this.resources.get(getFhirObservationId(observation)) ? 'GENERATED' : 'NOT GENERATED',
      })),
      retrievedAt: snapshot.retrievedAt,
      sourceErrors: snapshot.sourceErrors,
      isCached: snapshot.isCached ?? false,
    }
  }

  async getCitizenObservations(): Promise<{ items: never[]; available: false; message: string }> {
    return { items: [], available: false, message: 'Citizen-science observations are not integrated into this prototype; upstream endpoints are documented, but access requirements have not been verified.' }
  }

  async convertSite(siteId: string): Promise<{ resources: FhirResource[]; validation: ValidationReport; normalized: NormalizedObservation[]; isCached: boolean } | null> {
    const snapshot = await this.normalizer.getSnapshot()
    const site = this.normalizer.normalizeSites(snapshot).find((item) => item.id === siteId)
    if (!site) return null
    const normalized = this.normalizer.normalizeObservations(snapshot, siteId)
    const resources = mapSiteResources(site, normalized, snapshot.retrievedAt)
    this.resources.save(resources)
    const reports = resources.map(validateFhirResource)
    return { resources, normalized, validation: combineReports(reports), isCached: snapshot.isCached ?? false }
  }

  async createBundle(siteId: string): Promise<{ bundle: FhirResource; resources: FhirResource[]; validation: ValidationReport; isCached: boolean } | null> {
    const converted = await this.convertSite(siteId)
    if (!converted) return null
    const bundle = mapBundle(siteId, converted.resources)
    this.resources.save([bundle])
    return { bundle, resources: converted.resources, validation: validateFhirResource(bundle), isCached: converted.isCached }
  }

  getResource(resourceId: string): FhirResource | undefined {
    return this.resources.get(resourceId)
  }

  getSiteResources(siteId: string): FhirResource[] {
    return this.resources.getBySite(siteId)
  }

  getResourcesByType(resourceType: string): FhirResource[] {
    return this.resources.getAll(resourceType)
  }

  validateResource(resource: unknown): ValidationReport {
    return validateFhirResource(resource)
  }

  getValidationReport(resourceId: string): ValidationReport | null {
    const resource = this.resources.get(resourceId)
    return resource ? validateFhirResource(resource) : null
  }
}

function combineReports(reports: ValidationReport[]): ValidationReport {
  const errors = reports.flatMap((report) => report.errors)
  const warnings = reports.flatMap((report) => report.warnings)
  return {
    valid: errors.length === 0,
    status: errors.length ? 'INVALID' : warnings.length ? 'VALID WITH WARNINGS' : 'VALID',
    scope: reports[0]?.scope ?? 'FHIR R4 base resource schemas and AquaManFHIR data-quality checks; terminology and OAH profiles are not validated.',
    warnings,
    errors,
    summary: {
      resourcesChecked: reports.length,
      passed: reports.filter((report) => report.errors.length === 0 && report.warnings.length === 0).length,
      withWarnings: reports.filter((report) => report.errors.length === 0 && report.warnings.length > 0).length,
      rejected: reports.filter((report) => report.errors.length > 0).length,
    },
  }
}
