# AquaManFHIR Architecture

## Scope

AquaManFHIR is an interoperability layer over the public data endpoints currently used by the OneAquaHealth Resilience Map. It is not a patient-management or diagnostic application. Live integration currently covers city/site metadata, ecosystem health-risk records, and urban environmental-context parameters only.

## Components

- `frontend/`: React, Vite, TypeScript, React Router, Bootstrap 5, and Leaflet. Calls AquaManFHIR APIs only; maps use source-provided site coordinates with OpenStreetMap tiles and attribution.
- `backend/`: Node.js, Express, TypeScript. Owns OAH access, normalization, FHIR mapping/validation, Gemini configuration, and API envelopes.
- `backend/src/adapters/oah/`: exact verified OAH endpoints documented in `oah-data-discovery.md`; timeout and shape checks belong here.
- `backend/src/services/`: source orchestration, normalization, FHIR conversion/bundles, validation, and AI agent.
- `backend/src/repositories/`: in-memory generated-resource store. The OAH adapter keeps a 60-second process cache and atomically writes the latest successful raw snapshot to ignored `backend/.cache/oah-snapshot.json` for outage fallback.
- `docs/`: verified source discovery, flow, API contract, mapping, AI, setup, and limitations.

## Data flow

`Official OAH API -> OAH adapter -> source records -> normalized site/observation models -> FHIR R4 Location/Observation/Provenance + project source-field CodeSystem -> structural + data-quality validation -> limited FHIR REST search/read/$validate and Bundle export -> controlled Gemini tools`

The adapter preserves original record IDs, source field names/values, endpoint URL, and retrieval time. A null source sampling date remains null; retrieval time is provenance only and never becomes the observation effective date. When a required city/site request fails, a valid disk snapshot may be served; the API carries `isCached` and the browser must show the original retrieval time and unavailable-live-source warning.

## Normalized data

`NormalizedSite`: `id`, `externalId`, `name`, `latitude?`, `longitude?`, `altitude?`, `cityId?`, `cityName?`, `source`, `sourceRetrievedAt`.

`NormalizedObservation`: `id`, `siteId`, `indicator`, `displayName`, `value`, `valueType`, `unit?`, `observedAt?`, `source`, `sourceRecordId`, `sourceRetrievedAt`, `originalField`, `originalValue`.

`NormalizedObservation` is one numeric source field from one site record. Units and external terminology codes are intentionally absent unless the source later documents them.

## FHIR strategy

- A site maps to FHIR R4 `Location`; use the source site code as resource ID and preserve the source identifier and coordinates when present.
- Each verified numeric risk/urban field maps to FHIR R4 `Observation` with `status: unknown`, `code.text` equal to the source field, a `code.coding` using the original field key and its humanized label, `valueQuantity.value`, and `subject.reference` to the site `Location`. Add `effectiveDateTime` only when the source has `samplingDate`.
- `GET /fhir/CodeSystem/oah-source-field` emits concepts from field names present in the fetched snapshot. Its `https://aquamanfhir.example/...` canonical is a reserved, intentionally non-resolvable project placeholder, not an OAH terminology.
- A FHIR R4 `Provenance` records the source retrieval timestamp, source-record identifiers, transformation agent, and generated resource targets.
- A FHIR R4 `Bundle` of type `collection` contains the mapped Location, Observations, and Provenance resource.
- Use `meta.source`/identifiers for source traceability. Do not claim OAH profile conformance or terminology binding without official specifications.
- QuestionnaireResponse is not generated because no public questionnaire payload or schema has been found.

## Validation

The validator checks Location, Observation, Provenance, and Bundle structure, required fields for the supported R4 subset, primitive data types, allowed Observation status, Quantity value, Provenance structure, and references inside a generated Bundle. A non-empty source-field coding is accepted as an Observation indicator. Data-quality checks separately report missing site, indicator, value, effective date, unit, and source provenance. `valid` means all implemented structural checks pass; it is not a full HL7 validator result, terminology validation, or profile conformance. CodeSystem is read-only and is not exposed through `$validate`. An official OAH profile has not been obtained.

The read-only FHIR REST surface exposes `/fhir/metadata`, limited searches for Location, Observation, and Provenance, direct reads for generated resources and the source-field CodeSystem, and `$validate` for Location, Observation, Provenance, and Bundle. Search returns `searchset` Bundles; subject-based Observation search converts that site on demand. FHIR responses use `application/fhir+json` and FHIR errors use `OperationOutcome`. The application API under `/api` retains its own response envelope.

## Runtime and security

The backend uses environment variables for OAH base URL, Gemini credentials/model, and optional database URL. The browser never receives OAH or Gemini secrets. Requests to OAH use a timeout; API errors become safe response envelopes and detailed server logs. The raw snapshot cache is a local outage fallback, not durable structured persistence; generated FHIR resources are still in memory and are cleared on restart. The prototype has no user authentication or authorization.
