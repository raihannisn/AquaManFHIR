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
| `GET` | `/api/sites` | Live OAH sites, city metadata, and available record counts |
| `GET` | `/api/sites/:id` | Site details and provenance |
| `GET` | `/api/sites/:id/observations` | Normalized risk/urban observations for a site |
| `GET` | `/api/sites/:id/citizen-observations` | Explicitly reports unavailable source data; never fabricates records |
| `POST` | `/api/fhir/convert/site/:id` | Convert available live records to Location and Observation resources |
| `GET` | `/api/fhir/resources/:id` | Retrieve a generated resource by ID |
| `POST` | `/api/fhir/validate` | Validate a supplied/generated resource |
| `POST` | `/api/fhir/bundle/:siteId` | Generate a FHIR R4 collection Bundle |
| `POST` | `/api/ai/query` | Grounded Gemini query using controlled backend tools |
| `GET` | `/api/docs/:name` | Retrieve one whitelisted project Markdown document |
| `GET` | `/fhir/metadata` | FHIR R4 CapabilityStatement for supported read interactions |
| `GET` | `/fhir/Location/:id` | Read a generated Location resource directly |
| `GET` | `/fhir/Observation/:id` | Read a generated Observation resource directly |
| `GET` | `/fhir/Provenance/:id` | Read retrieval and transformation provenance directly |
| `GET` | `/fhir/Bundle/:id` | Read a generated collection Bundle directly |

## Examples

`GET /api/sites/C1/observations` returns normalized live source observations, provenance, and whether each FHIR resource has been generated in `data.items`; missing source dates remain absent. A site with no matching records returns an empty list, not mock data.

`GET /api/health` returns `status`, `geminiConfigured`, `oahApiBaseUrl`, and `persistence`. It never returns a secret value. `/api/docs/:name` accepts only the project documents listed in the in-app Documentation page.

`POST /api/fhir/convert/site/C1` returns `data.resources` and `data.validation`. Resources are also stored in the in-memory prototype repository for subsequent inspection. Each conversion includes FHIR Provenance with retrieval time, source identifiers, target references, and the AquaManFHIR adapter. The server does not assert OAH profile conformance.

After conversion, external clients can read resources directly, for example `GET /fhir/Observation/{id}` with `Accept: application/fhir+json`. `GET /fhir/metadata` describes the supported R4 read interactions. This prototype is read-only; search, create, update, delete, transaction, and terminology operations are not implemented.

`POST /api/ai/query` request:

```json
{ "message": "What observations are available for this site?", "siteId": "C1" }
```

Response data contains only `answer`, concise `toolsUsed`, and `sources`. If `GEMINI_API_KEY` is absent, the endpoint returns an actionable configuration error; it never substitutes a fabricated AI response.
