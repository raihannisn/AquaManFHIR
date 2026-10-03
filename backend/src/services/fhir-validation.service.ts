import { createRequire } from 'node:module'
import type { FhirResource, ValidationIssue, ValidationReport } from '../types/domain.js'

const require = createRequire(import.meta.url)
const {
  createBundleSchema,
  createLocationSchema,
  createObservationSchema,
  createProvenanceSchema,
} = require('@solarahealth/fhir-r4') as typeof import('@solarahealth/fhir-r4')

const observationStatuses = new Set(['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'])
const resourceIdPattern = /^[A-Za-z0-9.-]{1,64}$/
const fhirDateTimePattern = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?)?)?$/
const validationScope = 'FHIR R4 base resource schemas and AquaManFHIR data-quality checks; terminology and OAH profiles are not validated.'
const r4Schemas = {
  Location: createLocationSchema(),
  Observation: createObservationSchema(),
  Provenance: createProvenanceSchema(),
  Bundle: createBundleSchema(),
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issue(code: string, message: string, path?: string): ValidationIssue {
  return { code, message, ...(path ? { path } : {}) }
}

function hasObservationIndicator(value: unknown): boolean {
  if (!isObject(value)) return false
  if (typeof value.text === 'string' && value.text.trim()) return true
  return Array.isArray(value.coding) && value.coding.some((coding) =>
    isObject(coding) && typeof coding.code === 'string' && coding.code.trim().length > 0)
}

export function validateFhirResource(resource: unknown): ValidationReport {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  if (!isObject(resource) || typeof resource.resourceType !== 'string') {
    errors.push(issue('INVALID_RESOURCE', 'FHIR resource must be an object with a resourceType.'))
    return report(errors, warnings)
  }

  const current = resource as FhirResource
  if (!['Location', 'Observation', 'Bundle', 'Provenance'].includes(current.resourceType)) {
    errors.push(issue('UNSUPPORTED_RESOURCE_TYPE', `Resource type ${current.resourceType} is not supported by this validator.`, 'resourceType'))
    return report(errors, warnings)
  }
  const r4Schema = r4Schemas[current.resourceType as keyof typeof r4Schemas]
  const r4Result = r4Schema.safeParse(current)
  if (!r4Result.success) {
    errors.push(...r4Result.error.issues.map((item) => issue('FHIR_R4_SCHEMA', item.message, item.path.join('.'))))
  }
  if (typeof current.id !== 'string' || !resourceIdPattern.test(current.id)) {
    errors.push(issue('INVALID_ID', 'FHIR id must contain 1 to 64 letters, digits, hyphens, or periods.', 'id'))
  }
  if (isObject(current.meta) && typeof current.meta.source !== 'string') {
    warnings.push(issue('INCOMPLETE_PROVENANCE', 'Source provenance is incomplete.', 'meta.source'))
  } else if (!isObject(current.meta)) {
    warnings.push(issue('INCOMPLETE_PROVENANCE', 'Source provenance is not present.', 'meta.source'))
  }

  if (current.resourceType === 'Location') {
    if (typeof current.name !== 'string' || !current.name.trim()) errors.push(issue('MISSING_NAME', 'Location.name is required for AquaManFHIR site resources.', 'name'))
    if (current.position !== undefined) {
      if (!isObject(current.position) || typeof current.position.latitude !== 'number' || typeof current.position.longitude !== 'number') {
        errors.push(issue('INVALID_POSITION', 'Location.position must contain numeric latitude and longitude.', 'position'))
      }
    }
  }

  if (current.resourceType === 'Observation') {
    if (typeof current.status !== 'string' || !observationStatuses.has(current.status)) errors.push(issue('INVALID_STATUS', 'Observation.status is required and must use an allowed R4 code.', 'status'))
    if (!hasObservationIndicator(current.code)) errors.push(issue('MISSING_INDICATOR', 'Observation.code must contain text or a coding with a code value.', 'code'))
    if (!isObject(current.valueQuantity) || typeof current.valueQuantity.value !== 'number' || !Number.isFinite(current.valueQuantity.value)) errors.push(issue('INVALID_VALUE', 'AquaManFHIR Observation.valueQuantity.value must be a finite number.', 'valueQuantity.value'))
    if (!isObject(current.subject) || typeof current.subject.reference !== 'string' || !/^Location\/[A-Za-z0-9.-]{1,64}$/.test(current.subject.reference)) errors.push(issue('MISSING_SITE', 'Observation.subject must reference a FHIR Location.', 'subject.reference'))
    if (current.effectiveDateTime !== undefined && (typeof current.effectiveDateTime !== 'string' || !fhirDateTimePattern.test(current.effectiveDateTime) || Number.isNaN(Date.parse(current.effectiveDateTime)))) errors.push(issue('INVALID_EFFECTIVE_DATE', 'Observation.effectiveDateTime must be a valid FHIR dateTime; time values require a timezone.', 'effectiveDateTime'))
    if (current.effectiveDateTime === undefined) warnings.push(issue('MISSING_DATE', 'The source did not provide a sampling date.', 'effectiveDateTime'))
    if (!isObject(current.valueQuantity) || typeof current.valueQuantity.unit !== 'string') warnings.push(issue('MISSING_UNIT', 'The source did not provide a measurement unit.', 'valueQuantity.unit'))
  }

  if (current.resourceType === 'Provenance') {
    if (!Array.isArray(current.target) || current.target.length === 0 || current.target.some((target) => !isObject(target) || typeof target.reference !== 'string')) {
      errors.push(issue('INVALID_PROVENANCE_TARGET', 'Provenance.target must contain at least one resource reference.', 'target'))
    }
    if (typeof current.recorded !== 'string' || !fhirDateTimePattern.test(current.recorded) || Number.isNaN(Date.parse(current.recorded))) {
      errors.push(issue('INVALID_PROVENANCE_DATE', 'Provenance.recorded must be a valid FHIR dateTime.', 'recorded'))
    }
    if (!Array.isArray(current.agent) || current.agent.length === 0 || current.agent.some((agent) => !isObject(agent) || !isObject(agent.who))) {
      errors.push(issue('MISSING_PROVENANCE_AGENT', 'Provenance.agent must identify the process that performed the transformation.', 'agent'))
    }
    if (current.entity !== undefined && (!Array.isArray(current.entity) || current.entity.some((entity) => !isObject(entity) || !isObject(entity.what)))) {
      errors.push(issue('INVALID_PROVENANCE_ENTITY', 'Each Provenance.entity must identify a source entity.', 'entity'))
    }
  }

  if (current.resourceType === 'Bundle') {
    if (current.type !== 'collection') errors.push(issue('INVALID_BUNDLE_TYPE', 'Generated site Bundles must use type collection.', 'type'))
    if (!Array.isArray(current.entry)) {
      errors.push(issue('MISSING_BUNDLE_ENTRIES', 'Bundle.entry must be an array.', 'entry'))
    } else {
      const entryIds = new Set(current.entry.filter((entry) => isObject(entry) && isObject(entry.resource)).map((entry) => `${(entry as Record<string, unknown>).resource && ((entry as Record<string, unknown>).resource as Record<string, unknown>).resourceType}/${((entry as Record<string, unknown>).resource as Record<string, unknown>).id}`))
      current.entry.forEach((entry, index) => {
        if (!isObject(entry) || !isObject(entry.resource)) {
          errors.push(issue('INVALID_BUNDLE_ENTRY', 'Bundle.entry must contain a resource object.', `entry[${index}]`))
          return
        }
        const nestedReport = validateFhirResource(entry.resource)
        errors.push(...nestedReport.errors.map((item) => ({ ...item, path: `entry[${index}].${item.path ?? ''}` })))
        warnings.push(...nestedReport.warnings.map((item) => ({ ...item, path: `entry[${index}].${item.path ?? ''}` })))
      })
      current.entry.forEach((entry, index) => {
        if (!isObject(entry) || !isObject(entry.resource) || entry.resource.resourceType !== 'Observation' || !isObject(entry.resource.subject)) return
        const reference = entry.resource.subject.reference
        if (typeof reference === 'string' && !entryIds.has(reference)) errors.push(issue('UNRESOLVED_REFERENCE', `Bundle reference ${reference} does not resolve to an included resource.`, `entry[${index}].resource.subject.reference`))
      })
      current.entry.forEach((entry, index) => {
        if (!isObject(entry) || !isObject(entry.resource) || entry.resource.resourceType !== 'Provenance' || !Array.isArray(entry.resource.target)) return
        entry.resource.target.forEach((target, targetIndex) => {
          if (!isObject(target) || typeof target.reference !== 'string') return
          if (!entryIds.has(target.reference)) errors.push(issue('UNRESOLVED_REFERENCE', `Bundle reference ${target.reference} does not resolve to an included resource.`, `entry[${index}].resource.target[${targetIndex}].reference`))
        })
      })
    }
  }

  return report(errors, warnings)
}

function report(errors: ValidationIssue[], warnings: ValidationIssue[]): ValidationReport {
  return {
    valid: errors.length === 0,
    status: errors.length ? 'INVALID' : warnings.length ? 'VALID WITH WARNINGS' : 'VALID',
    scope: validationScope,
    warnings,
    errors,
  }
}
