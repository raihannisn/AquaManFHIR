# AquaManFHIR

AquaManFHIR is an interoperability prototype for OneAquaHealth environmental and ecosystem data. It retrieves public Resilience Map records, normalizes observed source values with provenance, maps them to FHIR R4 resources, validates structural and data-quality constraints, and exposes the results through an API and controlled Gemini agent.

## Why interoperability

OAH source records are published through source-specific interfaces. AquaManFHIR preserves those records and identifiers while producing standard, machine-readable `Location`, `Observation`, `Provenance`, and `Bundle` resources for research systems and other FHIR consumers.

## Who it is for

Researchers, environmental/public-health data analysts, data stewards, technical integrators, and developers working with One Health data.

## Current live sources

The adapter calls the four public endpoints observed in the official OneAquaHealth Resilience Map:

- `https://api.enora-oah.eu/api/cities/all`
- `https://api.enora-oah.eu/api/sites/all`
- `https://api.enora-oah.eu/api/resilience-map/health-risks`
- `https://api.enora-oah.eu/api/resilience-map/urban-parameters`

Current payloads include five cities, 106 sites, 96 risk records, and 104 urban-parameter records as observed on 2026-10-01. Citizen-science observations, water colour/flow data, health/wellbeing records, and public OAH FHIR profiles are not verified and are not fabricated. See [data discovery](docs/oah-data-discovery.md) and [limitations](docs/limitations.md).

## Architecture and mapping

The backend is Node.js, Express, and TypeScript. The frontend is React, Vite, React Router, and Bootstrap 5. See [architecture](docs/architecture.md), [data flow](docs/data-flow.md), and [FHIR mapping](docs/fhir-mapping.md).

Risk and urban numeric fields become one FHIR R4 Observation per source field, connected to a FHIR Location. A Provenance resource records snapshot retrieval time, source identifiers, and transformation targets. The read-only FHIR REST surface provides a CapabilityStatement and direct resource reads using `application/fhir+json`; the separate AquaManFHIR application API retains its own envelope. A source date is used only when present. Units and profile codes are not invented. Validation uses generated FHIR R4 resource schemas plus AquaManFHIR data-quality rules; terminology bindings and OAH profiles are not validated.

## Gemini agent

The optional Google Gemini agent uses the official `@google/genai` SDK on the backend. It has controlled site, observation, FHIR, validation, and Bundle tools. The API key is never sent to the frontend. Tool usage and source identifiers are returned with the answer. No canned answer is substituted when Gemini is not configured.

## Setup

Requirements: Node.js 20.11+ and npm. From the project root:

```sh
npm install
copy .env.example .env
npm run dev
```

The API listens on `http://localhost:3001`; Vite runs on `http://localhost:5173` and proxies `/api` to the backend. `GEMINI_API_KEY` is optional for the rest of the application and required only for agent requests.

## Environment

See [.env.example](.env.example). `OAH_API_BASE_URL` defaults to the verified `https://api.enora-oah.eu`. `DATABASE_URL` is reserved for a future persistent repository; this prototype uses short-lived in-memory cache/storage.

## Demo flow

1. Open the live sites catalogue and choose an OAH research site.
2. Inspect the raw source records and their provenance.
3. Review normalized source fields and values.
4. Convert the data to FHIR and inspect validation warnings/errors.
5. Export a FHIR Bundle or query the controlled Gemini agent if configured.
6. Use the documented AquaManFHIR API endpoints to consume the JSON output.

## Tests

```sh
npm test
npm run build
```

## Future work

Obtain a supported OAH API contract, citizen-science access/schema, measurement unit metadata, and official FHIR profiles. Add persistent storage, authentication, endpoint monitoring, broader integration tests, and profile-aware validation after those contracts are available.
