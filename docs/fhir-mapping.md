# FHIR Mapping

Mappings below are limited to fields observed in live OneAquaHealth API responses on 2026-10-01. They produce FHIR R4 resources without claiming conformance to an OAH-specific profile.

| Source field | Source meaning in API | Normalized field | FHIR resource | FHIR element | Transformation |
| --- | --- | --- | --- | --- | --- |
| `sites[].code` | Research site code | `NormalizedSite.externalId` | `Location` | `id`, `identifier.value` | Preserve source code; use as FHIR resource ID |
| `sites[].name` | Research site name | `NormalizedSite.name` | `Location` | `name` | Preserve text |
| `sites[].latitude`, `sites[].longitude` | Site coordinates | `NormalizedSite.latitude`, `longitude` | `Location` | `position.latitude`, `position.longitude` | Preserve numeric coordinates when both are present |
| `health-risks[].researchSiteCode` | Related research site | `NormalizedObservation.siteId` | `Observation` | `subject.reference` | Resolve to `Location/{siteCode}` using the standard FHIR R4 Observation subject reference |
| `health-risks[].id`, `urban-parameters[].id` | API record ID | `NormalizedObservation.sourceRecordId` | `Observation` | `identifier.value` | Combine record ID with original field name for a stable per-field identifier |
| `health-risks[].samplingDate`, `urban-parameters[].samplingDate` | Source sampling timestamp; urban may be null | `NormalizedObservation.observedAt` | `Observation` | `effectiveDateTime` | Include only when non-null; timezone-less source timestamps are represented as their source calendar date because FHIR dateTime requires a timezone when a time is present. Never replace with retrieval time |
| `scaledPathogenRisk`, `scaledFecalRisk`, `scaledArgRisk`, `healthRiskScore` | Source risk scalars | `NormalizedObservation.indicator`, `value` | `Observation` | `code.text`, `valueQuantity.value` | Preserve field name and numeric value; unit/code unavailable |
| `distChampCulture`, `distanceToHospitals`, `distanceToLivingStreetRoad`, `distanceToMotorwayRoad`, `distanceToSewageStations` | Urban-context distances | `NormalizedObservation.indicator`, `value` | `Observation` | `code.text`, `valueQuantity.value` | Preserve source field name and numeric value; unit unavailable |
| `patchDensityVeg*`, `vegCoverFrac*`, `patchDensity*`, `humanDensityProxy*`, `urbanPct*`, `imperviousPct*` | Urban/vegetation metrics at source-named radii | `NormalizedObservation.indicator`, `value` | `Observation` | `code.text`, `valueQuantity.value` | Preserve exact source key, including radius; do not assign unsupported units or terminology |
| API endpoint URL | Source endpoint | `NormalizedSite.source` / `NormalizedObservation.source` | `Location`, `Observation` | `meta.source`, `identifier.system` | Preserve endpoint provenance |
| Snapshot retrieval timestamp | Time AquaManFHIR retrieved the source snapshot | `sourceRetrievedAt` | `Provenance` | `recorded` | Preserve retrieval time as provenance; never use it as observation effective time |
| Source observation identifiers | Original source record and field | `sourceRecordId`, `originalField` | `Provenance` | `entity.what.identifier` | Preserve source identifier and source endpoint for each generated observation |
| Generated resource IDs | AquaManFHIR output resources | Resource IDs | `Provenance` | `target.reference` | Reference generated Location and Observation resources |
| Transformation process | AquaManFHIR OAH adapter | Adapter name | `Provenance` | `agent.who.display`, `activity.text` | Identify the transforming process without inventing a human agent |

For `Observation.status`, the mapper uses the valid R4 code `unknown` because the source has no resource status. The data-quality validator warns when no unit or sampling date is supplied. `Provenance.recorded` is source retrieval time and must not be interpreted as measurement time. No `QuestionnaireResponse` mapping exists until a verified questionnaire/citizen-observation payload is available.
