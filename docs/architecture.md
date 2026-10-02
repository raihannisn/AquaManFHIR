# AquaManFHIR Architecture

## Scope

AquaManFHIR is an interoperability layer over the public data endpoints currently used by the OneAquaHealth Resilience Map. It is not a patient-management or diagnostic application. Live integration currently covers city/site metadata, ecosystem health-risk records, and urban environmental-context parameters only.

## Components

- `frontend/`: React, Vite, TypeScript, React Router, Bootstrap 5. Calls AquaManFHIR APIs only.
- `backend/`: Node.js, Express, TypeScript. Owns OAH access, normalization, FHIR mapping/validation, Gemini configuration, and API envelopes.
- `backend/src/adapters/oah/`: exact verified OAH endpoints documented in `oah-data-discovery.md`; timeout and shape checks belong here.
- `backend/src/services/`: source orchestration, normalization, FHIR conversion/bundles, validation, and AI agent.
- `backend/src/repositories/`: in-memory TTL source snapshot and generated-resource store for the prototype. PostgreSQL remains a later persistence option.
- `docs/`: verified source discovery, flow, API contract, mapping, AI, setup, and limitations.

## Data flow

`Official OAH API -> OAH adapter -> source records -> normalized site/observation models -> FHIR R4 Location/Observation/Provenance -> structural + data-quality validation -> FHIR REST read / Bundle export -> controlled Gemini tools`

The adapter preserves original record IDs, source field names/values, endpoint URL, and retrieval time. A null source sampling date remains null; retrieval time is provenance only and never becomes the observation effective date.

## Normalized data

`NormalizedSite`: `id`, `externalId`, `name`, `latitude?`, `longitude?`, `altitude?`, `cityId?`, `cityName?`, `source`, `sourceRetrievedAt`.

`NormalizedObservation`: `id`, `siteId`, `indicator`, `displayName`, `value`, `valueType`, `unit?`, `observedAt?`, `source`, `sourceRecordId`, `sourceRetrievedAt`, `originalField`, `originalValue`.

`NormalizedObservation` is one numeric source field from one site record. Units and external terminology codes are intentionally absent unless the source later documents them.

## FHIR strategy

- A site maps to FHIR R4 `Location`; use the source site code as resource ID and preserve the source identifier and coordinates when present.
- Each verified numeric risk/urban field maps to FHIR R4 `Observation` with `status: unknown`, `code.text` equal to the source field, `valueQuantity.value`, and `subject.reference` to the site `Location`. Add `effectiveDateTime` only when the source has `samplingDate`.
- A FHIR R4 `Provenance` records the source retrieval timestamp, source-record identifiers, transformation agent, and generated resource targets.
- A FHIR R4 `Bundle` of type `collection` contains the mapped Location, Observations, and Provenance resource.
- Use `meta.source`/identifiers for source traceability. Do not claim OAH profile conformance or terminology binding without official specifications.
- QuestionnaireResponse is not generated because no public questionnaire payload or schema has been found.

## Validation

The validator checks generated resource types, required fields for the supported R4 resource subset, primitive data types, allowed Observation status, Quantity value, Provenance structure, and references inside a generated Bundle. Data-quality checks separately report missing site, indicator, value, effective date, unit, and source provenance. `valid` means all implemented structural checks pass; it is not a full HL7 validator result, terminology validation, or profile conformance. An official OAH profile has not been obtained.

The read-only FHIR REST surface exposes `/fhir/metadata` and direct resource reads at `/fhir/{resourceType}/{id}` using `application/fhir+json`. The application API under `/api` retains its own response envelope.

## Runtime and security

The backend uses environment variables for OAH base URL, Gemini credentials/model, and optional database URL. The browser never receives OAH or Gemini secrets. Requests to OAH use a timeout; API errors become safe response envelopes and detailed server logs. In-memory caching is bounded by TTL and can be replaced with a repository/database adapter later.
