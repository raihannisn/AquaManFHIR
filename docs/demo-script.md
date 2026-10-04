# AquaManFHIR Demo Script

Target duration: about 4 minutes. This script follows the implemented application flow and is suitable for a Track 7 submission video.

## Preparation

- Start the application with `npm run dev` and open `http://localhost:5173`.
- Confirm that the OAH source is available. If the UI marks the snapshot as cached, state its retrieval time and do not describe the data as live.
- Configure Gemini if you plan to include the AI segment. Do not show `.env` or the API key.
- Prepare site `C1` (Exploratorio), or another site with available indicator data.

## Recording timeline and clicks

The six segments below total exactly 4:00. Keep the narration moving while each screen is visible; avoid waiting on long network requests during the recording.

| Time | Duration | Screen and actions |
| --- | ---: | --- |
| 0:00-0:35 | 35 sec | **Overview:** Stay on the Overview page. Point out the source status and site map; no page change needed. |
| 0:35-1:05 | 30 sec | **Sites:** Click **Sites** in the left navigation. Search for `C1`, then click the arrow at the end of its row to open the site workspace. |
| 1:05-1:45 | 40 sec | **C1 workspace:** Show **Raw OAH records**, **Mapped observations**, and **Provenance**. These sections are on the same page. |
| 1:45-2:40 | 55 sec | **FHIR conversion:** Click **Convert to FHIR**. Click the **Location**, **Observation**, and **Provenance** resource tabs; point to validation. Click **Export Bundle**, then **Download JSON**. Wait for the browser's **Downloads** icon to show completion; open it briefly to show `oah-site-C1.json`, then return to the app. |
| 2:40-3:20 | 40 sec | **FHIR Resources:** Click the left navigation item and select `C1` if needed. Click **CapabilityStatement**; return to the app tab, open one resource with its external-link icon, then return and click **Open this site's FHIR Observation search**. |
| 3:20-4:00 | 40 sec | **AI Agent:** Click **AI Agent**, select `C1` if needed, then click **What observations are available for this site?** Wait for the answer, show **Agent activity** and **Source identifiers**, and deliver the closing sentence. |

## Script

### 0:00-0:35 | Problem and concept

**On screen:** Overview page.

**Narration:**

"OneAquaHealth environmental data is available through several endpoints, each with its own source-specific data format. Researchers and system integrators may need extra work before they can use that data with other systems. AquaManFHIR is an interoperability prototype that maps this environmental data to FHIR R4 while preserving its source traceability."

### 0:35-1:05 | Application purpose and data source

**On screen:** Show the source status and map, then open **Sites**.

**Narration:**

"The application retrieves city and research-site catalogues, along with ecosystem-risk and urban-context indicators from the OneAquaHealth Resilience Map. Here, I can choose a site and check the source status and retrieval time. We use only verified public data; we do not fabricate or assume access to citizen-science records or person-level health data."

### 1:05-1:45 | What we built

**On screen:** Open the workspace for site `C1`. Show **Raw OAH records**, **Mapped observations**, and provenance.

**Narration:**

"This workspace presents source records alongside their normalized form. Each numeric source field becomes one observation that remains linked to its original field and record. We preserve source field names and identifiers so the output can be traced back. If the source does not provide a date or unit, AquaManFHIR does not invent one."

### 1:45-2:40 | FHIR mapping and validation

**On screen:** Click **Convert to FHIR**. Show the generated resources and validation summary.

**Narration:**

"A research site maps to a FHIR R4 Location. Each indicator becomes an Observation that references that location, while Provenance records the retrieval time and transformation process. The resources can be inspected and exported as a FHIR Bundle. Validation checks the supported FHIR structures and the application's data-quality rules; it does not claim conformance to an official OneAquaHealth profile."

### 2:40-3:20 | Access through the FHIR API

**On screen:** Open **FHIR Resources**. Show the CapabilityStatement link, a direct resource link, and the Observation search for the selected site.

**Narration:**

"Beyond viewing JSON in the application, consumers can read resources through FHIR endpoints, inspect the CapabilityStatement to see the supported interactions, or search for Observations by site. This demonstrates the Track 7 goal: making environmental data easier to exchange with FHIR-enabled systems without changing the source meaning."

### 3:20-4:00 | AI agent and impact

**On screen:** Open **AI Agent**, select the same site, and ask: `What observations are available for this site?` Show the answer, tool activity, and source identifiers.

**Narration:**

"The AI agent uses controlled backend tools to retrieve data and resources; the model does not access the OAH API directly. This panel shows which tools and source identifiers support the answer. AquaManFHIR helps researchers, data stewards, and integrators trace and use data across systems more consistently. This is still a prototype: available data is limited to verified sources, and we do not add clinical interpretations or risk thresholds."

## Closing

"AquaManFHIR connects OneAquaHealth ecosystem data to traceable FHIR R4 resources that can be validated within the implemented scope and accessed through an API. Our goal is to support One Health interoperability while staying transparent about data provenance and limitations."
