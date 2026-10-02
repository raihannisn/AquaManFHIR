# AI Agent

## Provider and trust boundary

The backend uses the official Google GenAI JavaScript SDK (`@google/genai`). `GEMINI_API_KEY`, `GEMINI_MODEL`, and optional comma-separated `GEMINI_FALLBACK_MODELS` are read only by the backend. On a temporary 503 before any tool turn, the service tries configured fallback models in order. It does not switch models after a tool response, preserving the original model’s tool-call signature and context. The React application sends a question and optional site ID to `POST /api/ai/query`; it never calls Gemini or OneAquaHealth directly.

## Tools

The agent can invoke only backend-owned functions:

- `getSites()`
- `getSite(siteId)`
- `getObservations(siteId)`
- `getCitizenObservations(siteId)`
- `getFHIRResources(siteId)`
- `validateFHIR(resourceId)`
- `getValidationReport(resourceId)`
- `createFHIRBundle(siteId)`

Tool arguments are dispatched to AquaManFHIR services, not to a database or the upstream OAH API directly from Gemini. Unknown tools are rejected.

## Grounding policy

The system instruction requires factual claims to come from tool results, preserves source/resource identifiers, calls out unavailable data, and disallows invented measurements, units, dates, resource validity, diagnoses, or clinical recommendations. Answers should be concise; tool and source metadata is returned separately and rendered in the activity panel. The UI renders headings and lists semantically instead of displaying Markdown markers. The API does not return hidden reasoning.

When `GEMINI_API_KEY` is unset or the provider fails, the API reports a safe configuration/provider error; it does not simulate a response. Citizen-science tools report unavailable source data because no public observation endpoint was found.
