# AquaManFHIR

AquaManFHIR is an interoperability prototype for public OneAquaHealth environmental and ecosystem data. It retrieves Resilience Map records, normalizes observed source values with provenance, maps them to FHIR R4 resources, validates structural and data-quality constraints, and exposes the results through an API and controlled Gemini agent. The project does not claim conformance to an official OAH FHIR profile.

## Why interoperability

OAH source records are published through source-specific interfaces. AquaManFHIR preserves those records and identifiers while producing machine-readable FHIR R4 `Location`, `Observation`, `Provenance`, and `Bundle` resources for research systems and other FHIR consumers. A project-local CodeSystem identifies original OAH source fields; it does not assign external terminology codes.

## Who it is for

Researchers, environmental/public-health data analysts, data stewards, technical integrators, and developers working with One Health data.

## Connected source

The adapter calls the four public endpoints observed in the official OneAquaHealth Resilience Map:

- `https://api.enora-oah.eu/api/cities/all`
- `https://api.enora-oah.eu/api/sites/all`
- `https://api.enora-oah.eu/api/resilience-map/health-risks`
- `https://api.enora-oah.eu/api/resilience-map/urban-parameters`

The four endpoints and example record counts documented in [data discovery](docs/oah-data-discovery.md) were observed on 2026-10-01; they are not a current-count guarantee or a versioned API contract. A successful snapshot is also saved locally at `backend/.cache/oah-snapshot.json`. If a required live catalogue request later fails and that file is valid, the API serves it with `isCached: true`; the UI shows its retrieval time and warns that the live source is unreachable. The official OpenAPI documentation lists Citizen Science endpoints and response DTOs, but this prototype has not integrated them or verified access requirements. Citizen records, health/wellbeing data, and official OAH FHIR profiles are not part of the verified data flow; values and meanings are not fabricated.

## Architecture and mapping

The backend is Node.js, Express, and TypeScript. The frontend is React, Vite, React Router, Bootstrap 5, and Leaflet. The UI maps source-provided site coordinates and shows source-scaled risk values without adding thresholds or clinical interpretation. See [architecture](docs/architecture.md), [data flow](docs/data-flow.md), and [FHIR mapping](docs/fhir-mapping.md).

Risk and urban numeric fields become one FHIR R4 Observation per source field, connected to a FHIR Location. A project CodeSystem preserves each original field key and humanized label; its `aquamanfhir.example` canonical URL is a reserved, non-resolvable placeholder. A Provenance resource records snapshot retrieval time, source identifiers, and transformation targets. The read-only FHIR REST surface provides a CapabilityStatement, limited searches, direct reads, and `$validate` using `application/fhir+json`; the separate AquaManFHIR application API retains its own envelope. A source date is used only when present. Units and external profile/terminology codes are not invented. Validation uses generated FHIR R4 resource schemas plus AquaManFHIR data-quality rules; terminology bindings and OAH profiles are not validated.

## Impact

Researchers, environmental and public-health analysts, data stewards, and application integrators benefit from source values that remain traceable while being available in a common FHIR R4 shape. This lowers the effort needed to exchange and inspect verified environmental records across tools; it does not establish causal or clinical meaning that the source has not published.

## Privacy & security

The connected OAH fields are public site and environmental data; no person-level or citizen-submission records are ingested. The official OpenAPI documents citizen endpoints, but their access requirements and data-use permissions must be verified before integration. The prototype has no authentication or authorization and should not be exposed publicly without an access-control boundary. The Gemini API key is read only by the backend and is never returned to the browser. The local snapshot cache contains the same source data and is excluded from Git.

## Gemini agent

The optional Google Gemini agent uses the official `@google/genai` SDK on the backend. It has controlled site, observation, FHIR, validation, and Bundle tools. The API key is never sent to the frontend. Tool usage and source identifiers are returned with the answer. No canned answer is substituted when Gemini is not configured.

## Setup

Requirements: Node.js 20.11+ and npm. From the project root:

```sh
npm install
copy .env.example .env      # Windows. On macOS/Linux use: cp .env.example .env
npm run check:secrets
npm run dev
```

Secrets live only in `.env`; do not commit or share that file. Run `npm run check:secrets` to scan Git-tracked files for common key shapes before pushing. The API listens on `http://localhost:3001`; Vite runs on `http://localhost:5173` and proxies `/api` and `/fhir` to the backend. `GEMINI_API_KEY` is optional for the rest of the application and required only for agent requests. The API's source snapshot cache is written under the ignored `backend/.cache/` directory.

## Try the FHIR API

With the backend running (`npm run dev`), any FHIR client can call the standard endpoints directly, without the web interface:

```sh
# CapabilityStatement: supported resources, searches and the $validate operation
curl http://localhost:3001/fhir/metadata

# Observations for one research site (returns a searchset Bundle)
curl "http://localhost:3001/fhir/Observation?subject=Location/<site-id>&_count=3"
```

Site IDs are the research site codes returned by `GET http://localhost:3001/api/sites`. On Windows PowerShell use `curl.exe` instead of `curl`, or open the URLs in a browser. The `$validate` operation accepts a resource at `POST /fhir/Observation/$validate` and returns an `OperationOutcome`.

## Environment

See [.env.example](.env.example). `OAH_API_BASE_URL` defaults to the observed `https://api.enora-oah.eu`; the upstream has not published a stability guarantee. `DATABASE_URL` is reserved for future structured persistence. The latest successful source snapshot is cached on disk; generated FHIR resources remain in memory and are cleared when the backend restarts.

## Demo flow

For a timed Indonesian narration and on-screen cues, see the [demo script](docs/demo-script.md).

1. Open the sites catalogue and check the source status before choosing an OAH research site.
2. Inspect the raw source records and their provenance.
3. Review normalized source fields and values.
4. Convert the data to FHIR and inspect validation warnings/errors.
5. Export a FHIR Bundle or query the controlled Gemini agent if configured. If a cached snapshot is in use, the page displays its original retrieval time.
6. Use the documented AquaManFHIR API endpoints to consume the JSON output.

## Tests

```sh
npm test
npm run build
```

## Limitations

- Prototype: no authentication or rate limiting. Do not expose it publicly without an access-control boundary.
- Generated FHIR resources are kept in memory and cleared on restart. Only the latest source snapshot is cached on disk.
- Citizen-science endpoints and response DTOs are documented in the official OpenAPI, but access and authorization are not verified and the prototype does not use them.
- The source supplies no measurement units, and some records have no sampling date. Both are reported as validation warnings and are never filled in.
- There are no official OAH FHIR profiles; terminology bindings and profiles are not validated.
- Risk values are shown as published. They are not interpreted, and the project is not for clinical use.

## Future work

Confirm permitted access and authorization for the documented citizen-science endpoints; obtain measurement-unit metadata and official FHIR profiles. Add persistent storage, authentication, endpoint monitoring, broader integration tests, and profile-aware validation after those contracts are available.
