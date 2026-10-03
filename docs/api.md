# AquaManFHIR API

All application endpoints return an envelope:

```json
{ "success": true, "data": {}, "error": null }
```

Errors use `{ "success": false, "data": null, "error": { "code": "...", "message": "..." } }`. The frontend never calls OneAquaHealth or Gemini directly. No authentication is implemented in this hackathon prototype; deploy only behind an appropriate access boundary.

FHIR REST reads under `/fhir` are the exception: they return the FHIR resource directly with `Content-Type: application/fhir+json`. FHIR read errors return an R4 `OperationOutcome` rather than the AquaManFHIR envelope.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service readiness |
| `GET` | `/api/sites` | OAH sites, city metadata, record counts, retrieval time, and `isCached` status |
| `GET` | `/api/sites/:id` | Site details, source records, provenance, and `isCached` status |
| `GET` | `/api/sites/:id/observations` | Normalized risk/urban observations and `isCached` status |
| `GET` | `/api/sites/:id/citizen-observations` | Explicitly reports unavailable source data; never fabricates records |
| `POST` | `/api/fhir/convert/site/:id` | Convert available records to Location, Observation, and Provenance resources; includes `isCached` |
| `GET` | `/api/fhir/resources/:id` | Retrieve a generated resource by ID |
| `POST` | `/api/fhir/validate` | Validate a supplied/generated resource |
| `POST` | `/api/fhir/bundle/:siteId` | Generate a FHIR R4 collection Bundle |
| `POST` | `/api/ai/query` | Grounded Gemini query using controlled backend tools |
| `GET` | `/api/docs/:name` | Retrieve one whitelisted project Markdown document |
| `GET` | `/fhir/metadata` | FHIR R4 CapabilityStatement for implemented reads, limited searches, and validation operations |
| `GET` | `/fhir/Location` | Search locations; supports `_count` |
| `GET` | `/fhir/Location/:id` | Read a generated Location resource directly |
| `GET` | `/fhir/Observation` | Search observations; optional `subject=Location/{id}` and `_count` |
| `GET` | `/fhir/Observation/:id` | Read a generated Observation resource directly |
| `GET` | `/fhir/Provenance` | Search generated Provenance; supports `target` and `_count` |
| `GET` | `/fhir/Provenance/:id` | Read retrieval and transformation provenance directly |
| `GET` | `/fhir/Bundle/:id` | Read a generated collection Bundle directly |
| `GET` | `/fhir/CodeSystem/oah-source-field` | Read the project CodeSystem for original OAH source field names |
| `POST` | `/fhir/{resourceType}/$validate` | Validate Location, Observation, Provenance, or Bundle and return an `OperationOutcome` |

## Examples

`GET /api/sites` includes `data.isCached`. If a required live catalogue request fails and a valid disk snapshot exists, site, site-detail, and observation responses include `isCached: true` and the snapshot's original `retrievedAt`. The frontend displays a warning and does not label that data as live. `GET /api/sites/C1/observations` returns normalized source observations, provenance, and whether each FHIR resource has been generated in `data.items`; missing source dates remain absent. A site with no matching records returns an empty list, not mock data.

`GET /api/health` returns `status`, `geminiConfigured`, `oahApiBaseUrl`, and `persistence`. It never returns a secret value. `/api/docs/:name` accepts only the project documents listed in the in-app Documentation page.

`POST /api/fhir/convert/site/C1` returns `data.resources`, `data.validation`, and `data.isCached`. Resources are also stored in the in-memory prototype repository for subsequent inspection. Each conversion includes FHIR Provenance with retrieval time, source identifiers, target references, and the AquaManFHIR adapter. The server does not assert OAH profile conformance.

FHIR endpoints return resources directly with `Content-Type: application/fhir+json`; FHIR request errors return `OperationOutcome` rather than the application envelope.

`GET /fhir/Location?_count=5` returns a `searchset` Bundle of locations generated from the available snapshot. `GET /fhir/Observation?subject=Location/C1&_count=5` converts the site on demand and returns its Observations in a `searchset` Bundle. `subject` may be omitted to search already-generated Observations. `GET /fhir/Provenance?target=Location/C1&_count=5` filters generated provenance by target; a Location target is converted on demand. Search Bundles include `total`, `link[self]`, and entries with `fullUrl` and `resource`; `_count` limits returned entries.

`GET /fhir/CodeSystem/oah-source-field` returns a project CodeSystem derived from numeric source fields in the available snapshot. Observation `code.coding` uses the original OAH field name and its display label. Its canonical URL under `aquamanfhir.example` is deliberately non-resolvable and is not an official OAH terminology or profile. The CodeSystem is read-only and has no search or `$validate` operation.

`POST /fhir/Location/$validate`, `/fhir/Observation/$validate`, `/fhir/Provenance/$validate`, and `/fhir/Bundle/$validate` accept a FHIR resource body and return an `OperationOutcome`. Errors and warnings map from the implemented `ValidationReport`; `details.text` retains the AquaManFHIR issue code and `expression` identifies a source path when available. A valid resource returns an informational issue. The operation validates implemented R4 structure and data-quality checks only.

`GET /fhir/metadata` describes the implemented read, limited search, and validation operations. This prototype does not implement general FHIR search, create, update, delete, transactions, terminology validation, or OAH profile conformance.

`POST /api/ai/query` request:

```json
{ "message": "What observations are available for this site?", "siteId": "C1" }
```

Response data contains only `answer`, concise `toolsUsed`, and `sources`. If `GEMINI_API_KEY` is absent, the endpoint returns an actionable configuration error; it never substitutes a fabricated AI response.
