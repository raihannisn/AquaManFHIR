# OneAquaHealth Data Discovery

The Resilience Map requests below were checked on 2026-10-01. The official OpenAPI documentation was reviewed on 2026-10-04.

## Official entry points

- Project portal: https://www.oneaquahealth.eu/project-solutions/
- Public Resilience Map: https://apps.oneaquahealth.eu/resmap/
- Citizen Science App: https://apps.oneaquahealth.eu/login
- Official API documentation: https://api.enora-oah.eu/swagger-ui/index.html
- OpenAPI document: https://api.enora-oah.eu/v3/api-docs
- Citizen Science guide: https://www.oneaquahealth.eu/app/uploads/2025/07/OneAquaHealth-Guide-A4-Citizen-Science-App-Installation-0.4.pdf

The portal describes City Dashboards, a Resilience Map, and a Citizen Science App. The Citizen Science App entry point offers sign-in and sign-up. Its OpenAPI documentation lists Citizen Science endpoints, including `GET /api/citizens/submissions`, `GET /api/citizens/stream_assessments`, single-submission reads, and reference endpoints for water-flow and water-colour types. The documented responses use DTO schemas such as `CitizenSubmissionGetDTO` and `StreamAssessmentDTO`. The specification also lists `POST /api/auth/login`, which returns a JWT; it does not establish whether citizen-read endpoints are callable without authentication or what access permissions apply. AquaManFHIR has not queried or integrated citizen submissions. No OAH-specific FHIR endpoint, profile, or terminology guidance was identified in the API documentation reviewed.

## Verified API requests

All four requests returned HTTP 200 from the public Resilience Map browser session. The app makes these requests to `https://api.enora-oah.eu`:

| Endpoint | Records observed | Fields observed |
| --- | ---: | --- |
| `GET /api/cities/all` | 5 | `id`, `name`, `longitude`, `latitude` |
| `GET /api/sites/all` | 106 | `code`, `name`, `city` (`id`, `name`, `longitude`, `latitude`), `polygon`, `latitude`, `longitude`, `altitude` |
| `GET /api/resilience-map/health-risks` | 96 | `id`, `researchSiteCode`, `samplingDate`, `scaledPathogenRisk`, `scaledFecalRisk`, `scaledArgRisk`, `healthRiskScore` |
| `GET /api/resilience-map/urban-parameters` | 104 | `id`, `researchSiteCode`, `samplingDate`, `distChampCulture`, `distanceToHospitals`, `distanceToLivingStreetRoad`, `distanceToMotorwayRoad`, `distanceToSewageStations`; `patchDensityVeg{50,100,250,500,750,1000,1500,2000}m`; `vegCoverFrac{50,100,250,500,750,1000,1500,2000}m`; `patchDensity{50,100,250,500,750,1000,1500,2000}m`; `humanDensityProxy{50,100,250,500,750,1000,1500,2000}m`; `urbanPct{50,100,250,500,750,1000,1500,2000}m`; `imperviousPct{50,100,250,500,750,1000,1500,2000}m` |

The verified site totals by city ID were `CO` 20, `TO` 24, `GH` 22, `BE` 20, and `OS` 20. Example city: `{ "id": "CO", "name": "Coimbra", "longitude": -8.4103, "latitude": 40.2033 }`. Example site: `{ "code": "C1", "name": "Exploratório", "latitude": 40.19787, "longitude": -8.42865, "altitude": 20 }` (its `city` object is also included by the API).

Example health-risk record: `{ "id": 1, "researchSiteCode": "BN1", "samplingDate": "2023-06-28T00:00:00", "scaledPathogenRisk": 0.2054, "scaledFecalRisk": 0.2427, "scaledArgRisk": 0.4792, "healthRiskScore": 0.3091 }`.

Example urban record contained numeric distances and environmental context indicators; `samplingDate` was `null`. Values must not be treated as a time series unless the source supplies sampling timestamps and multiple observations. Several sites have no matching row in one or both analytical endpoints, so missing data is expected.

## Semantics and mapping limits

- `cities/all` and `sites/all` support a live site catalogue. Preserve API `code` as the source site identifier; preserve coordinates as latitude/longitude and do not infer missing ones.
- Health-risk scalars and urban parameters are the only observation-like fields confirmed in these API responses. Normalize one scalar field per observation while preserving the original field name and value.
- The API did not provide units, code systems, metric definitions, or FHIR profiles in the observed payloads. Do not invent LOINC/SNOMED codes, units, or clinical meaning. Use explicit source-field text labels and warnings for unmapped terminology.
- A null `samplingDate` means no effective date can be mapped. Do not substitute retrieval time as the measurement time.
- Risk scores are environmental/ecosystem indicators, not patient health measurements. No person, patient, diagnosis, or clinical recommendation data was observed.
- Citizen-observation endpoints and DTOs are documented in OpenAPI, but they were not part of the Resilience Map requests observed on 2026-10-01 and are not integrated here. Verify authentication, authorization, data-use permissions, and actual payload semantics before using them. The documented water-flow and water-colour endpoints provide reference types; they are not evidence that citizen submissions have been retrieved.

## Limitations and follow-up

The four Resilience Map endpoint paths and payloads are verified from requests made by the official app. An OpenAPI document is also available, but no stability/version guarantee or citizen-endpoint access policy was identified. The current MVP adapter should time out cleanly, validate response shapes, retain source URLs and retrieval timestamps as provenance, and surface endpoint failures instead of returning demo fixtures. Confirm citizen-endpoint access with OneAquaHealth before integrating submissions. FHIR output uses standard R4 resources, but no OAH-specific profile conformance can be claimed until official guidance is obtained.
