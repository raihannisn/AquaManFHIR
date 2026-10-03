import { describe, expect, it, vi } from 'vitest'
import { OahAdapter } from '../adapters/oah/oah.adapter.js'
import type { OahSnapshot } from '../types/domain.js'
import { mapBundle, mapSiteResources } from './fhir-mapping.service.js'
import { NormalizationService } from './normalization.service.js'
import { validateFhirResource } from './fhir-validation.service.js'
import { AquaManFhirService } from './aquamanfhir.service.js'

const snapshot: OahSnapshot = {
  cities: [{ id: 'CO', name: 'Coimbra' }],
  sites: [{ code: 'C1', name: 'Exploratório', city: { id: 'CO', name: 'Coimbra' }, latitude: 40.1, longitude: -8.4 }],
  healthRisks: [{ id: 1, researchSiteCode: 'C1', samplingDate: '2023-06-28T00:00:00', healthRiskScore: 0.3091 }],
  urbanParameters: [{ id: 1, researchSiteCode: 'C1', samplingDate: null, urbanPct100m: 4.2 }],
  sourceErrors: [],
  retrievedAt: '2026-10-01T00:00:00.000Z',
}

describe('OneAquaHealth normalization and FHIR mapping', () => {
  it('preserves source values and provenance while leaving missing dates absent', () => {
    const adapter = new OahAdapter()
    vi.spyOn(adapter, 'getSnapshot').mockResolvedValue(snapshot)
    const normalizer = new NormalizationService(adapter)
    const sites = normalizer.normalizeSites(snapshot)
    const observations = normalizer.normalizeObservations(snapshot, 'C1')

    expect(sites[0]).toMatchObject({ id: 'C1', externalId: 'C1', latitude: 40.1, sourceRetrievedAt: snapshot.retrievedAt })
    expect(observations).toHaveLength(2)
    expect(observations[0]).toMatchObject({ indicator: 'healthRiskScore', value: 0.3091, sourceRecordId: '1:healthRiskScore', originalField: 'healthRiskScore' })
    expect(observations[0].observedAt).toBe('2023-06-28T00:00:00')
    expect(observations[1].observedAt).toBeUndefined()
    expect(observations[1].unit).toBeUndefined()
    expect(observations[0].id).not.toBe(observations[1].id)
  })

  it('creates R4 Location, Observation, and collection Bundle resources with explicit references', () => {
    const adapter = new OahAdapter()
    vi.spyOn(adapter, 'getSnapshot').mockResolvedValue(snapshot)
    const normalizer = new NormalizationService(adapter)
    const site = normalizer.normalizeSites(snapshot)[0]
    const observations = normalizer.normalizeObservations(snapshot, 'C1')
    const resources = mapSiteResources(site, observations, snapshot.retrievedAt)
    const bundle = mapBundle('C1', resources)

    expect(resources[0]).toMatchObject({ resourceType: 'Location', id: 'C1', position: { latitude: 40.1, longitude: -8.4 } })
    expect(resources[1]).toMatchObject({ resourceType: 'Observation', status: 'unknown', code: { text: 'healthRiskScore' }, subject: { reference: 'Location/C1' } })
    expect(resources[1].effectiveDateTime).toBe('2023-06-28')
    expect(resources[3]).toMatchObject({ resourceType: 'Provenance', recorded: snapshot.retrievedAt })
    expect((resources[3].target as Array<{ reference: string }>)[0].reference).toBe('Location/C1')
    expect((resources[3].entity as Array<{ what: { identifier: { value: string } } }>)[0].what.identifier.value).toBe('1:healthRiskScore')
    expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'collection' })
    expect((bundle.entry as Array<{ resource: { resourceType: string } }>)[0].resource.resourceType).toBe('Location')
    expect((bundle.entry as Array<{ resource: { resourceType: string } }>).at(-1)?.resource.resourceType).toBe('Provenance')
    expect(validateFhirResource(bundle)).toMatchObject({ valid: true, status: 'VALID WITH WARNINGS', errors: [] })
  })

  it('emits source-field codings and a project CodeSystem from observed fields only', async () => {
    const adapter = new OahAdapter()
    vi.spyOn(adapter, 'getSnapshot').mockResolvedValue(snapshot)
    const service = new AquaManFhirService(new NormalizationService(adapter))
    const codeSystem = await service.getSourceFieldCodeSystem()
    const concepts = codeSystem.concept as Array<{ code: string; display: string }>
    const converted = await service.convertSite('C1')
    const observation = converted?.resources.find((resource) => resource.resourceType === 'Observation')
    const coding = (observation?.code as { coding: Array<{ system: string; code: string; display: string }> }).coding[0]

    expect(codeSystem).toMatchObject({
      resourceType: 'CodeSystem',
      id: 'oah-source-field',
      url: 'https://aquamanfhir.example/fhir/CodeSystem/oah-source-field',
      content: 'fragment',
    })
    expect(concepts).toEqual([
      { code: 'healthRiskScore', display: 'Health Risk Score' },
      { code: 'urbanPct100m', display: 'Urban Pct 100 m' },
    ])
    expect(coding).toEqual({
      system: 'https://aquamanfhir.example/fhir/CodeSystem/oah-source-field',
      code: 'healthRiskScore',
      display: 'Health Risk Score',
    })
    expect(observation?.code).toMatchObject({ text: 'healthRiskScore' })
    expect(validateFhirResource(observation)).toMatchObject({ valid: true, status: 'VALID WITH WARNINGS' })
    expect(validateFhirResource(observation).warnings.map((item) => item.code)).toEqual(['MISSING_UNIT'])
  })

  it('accepts an Observation identified by coding without adding coding-specific warnings', () => {
    const report = validateFhirResource({
      resourceType: 'Observation',
      id: 'coded-observation',
      meta: { source: 'https://api.enora-oah.eu/api/resilience-map/health-risks' },
      status: 'unknown',
      code: { coding: [{ system: 'https://aquamanfhir.example/fhir/CodeSystem/oah-source-field', code: 'healthRiskScore', display: 'Health Risk Score' }] },
      valueQuantity: { value: 0.3 },
      subject: { reference: 'Location/C1' },
    })

    expect(report.valid).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.warnings.map((item) => item.code)).toEqual(['MISSING_DATE', 'MISSING_UNIT'])
  })

  it('rejects an Observation with an empty coding array as missing its indicator', () => {
    const report = validateFhirResource({
      resourceType: 'Observation',
      id: 'empty-coding',
      status: 'unknown',
      code: { coding: [] },
      valueQuantity: { value: 0.3 },
      subject: { reference: 'Location/C1' },
    })

    expect(report.errors).toContainEqual(expect.objectContaining({ code: 'MISSING_INDICATOR', path: 'code' }))
  })

  it('reports generated FHIR state from the resource repository', async () => {
    const adapter = new OahAdapter()
    vi.spyOn(adapter, 'getSnapshot').mockResolvedValue(snapshot)
    const service = new AquaManFhirService(new NormalizationService(adapter))
    const beforeConversion = await service.getObservations('C1')
    expect(beforeConversion.items[0].fhirStatus).toBe('NOT GENERATED')

    await service.convertSite('C1')
    const afterConversion = await service.getObservations('C1')
    expect(afterConversion.items.every((item) => item.fhirStatus === 'GENERATED')).toBe(true)
  })

  it('preserves the cached-snapshot marker in the sites response data', async () => {
    const adapter = new OahAdapter()
    vi.spyOn(adapter, 'getSnapshot').mockResolvedValue({ ...snapshot, isCached: true })
    const service = new AquaManFhirService(new NormalizationService(adapter))

    const result = await service.getSites()

    expect(result.isCached).toBe(true)
    expect(result.retrievedAt).toBe(snapshot.retrievedAt)
  })

  it('marks structurally invalid resources invalid rather than claiming success', () => {
    expect(validateFhirResource({ resourceType: 'Observation', id: 'bad', status: 'made-up' })).toMatchObject({ valid: false, status: 'INVALID' })
    expect(validateFhirResource({ resourceType: 'Observation', id: 'bad', effectiveDateTime: '2023-06-28T00:00:00' }).errors).toContainEqual(expect.objectContaining({ code: 'INVALID_EFFECTIVE_DATE' }))
    expect(validateFhirResource({ resourceType: 'Location', id: 'C1', name: 'Site', status: 'not-a-location-status' }).errors).toContainEqual(expect.objectContaining({ code: 'FHIR_R4_SCHEMA' }))
  })
})

describe('Validation summary', () => {
  it('tallies resources by outcome so warnings and rejections are not conflated', async () => {
    const adapter = new OahAdapter()
    vi.spyOn(adapter, 'getSnapshot').mockResolvedValue(snapshot)
    const service = new AquaManFhirService(new NormalizationService(adapter))
    const converted = await service.convertSite('C1')
    const summary = converted?.validation.summary

    expect(summary).toBeDefined()
    expect(summary!.resourcesChecked).toBe(converted!.resources.length)
    expect(summary!.passed + summary!.withWarnings + summary!.rejected).toBe(summary!.resourcesChecked)
    expect(summary!.rejected).toBe(0)
    expect(summary!.withWarnings).toBeGreaterThan(0)
  })
})
