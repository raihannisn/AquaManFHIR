# Limitations

- Public source integration uses four API endpoints observed in the official Resilience Map browser application. The provider has not published a versioned public API contract or stability guarantee in the pages inspected.
- Citizen-science records are not integrated: the official app entry point requires login, and no public observations endpoint/schema was verified. The API explicitly returns an empty unavailable state rather than fixture records.
- No water colour/flow fields, human health/wellbeing records, or questionnaire response schema were present in the observed source payloads. No synthetic patient data is created.
- No public OAH FHIR profile or terminology guidance was identified. The platform emits standard FHIR R4 Location, Observation, Provenance, and Bundle resources and has a read-only FHIR REST surface, but does not claim OAH profile or terminology conformance.
- Structural validation uses generated FHIR R4 JSON schemas for emitted resource types plus AquaManFHIR quality rules. It does not validate terminology bindings or OAH-specific profiles.
- The FHIR REST surface supports CapabilityStatement discovery and read interactions only. Search, create/update/delete, transactions, and terminology operations are not implemented.
- The source does not supply units for observed numeric values. The mapper preserves source field names/values and validation warns about missing units.
- Some urban records have null sampling dates. Retrieval time is preserved as provenance and is not substituted for observation time.
- The prototype keeps source data in a short-lived in-memory cache and generated FHIR resources in memory. Data is not durable across restarts.
- Gemini functionality requires a backend `GEMINI_API_KEY`. AI requests are not answered by a mock model if the key is absent.
- API endpoints have no user authentication or authorization. Do not expose the prototype publicly without an access-control layer and operational security review.
