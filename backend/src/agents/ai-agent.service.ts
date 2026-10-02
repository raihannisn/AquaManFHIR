import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from '@google/genai'

const systemInstruction = `You are AquaManFHIR's OneAquaHealth data agent for researchers and data stewards. Use backend tool results for every factual claim. Never invent measurements, locations, units, dates, resource IDs, or validation results. Preserve source identifiers where relevant. If data is unavailable, say "No data is available from the connected source for that request." Keep the final answer concise and directly answer the question; avoid repeated site metadata and long commentary. Use short section headings or simple lists only when they improve scanning. Do not include tool logs or a source dump in the answer because the interface displays those separately. Never use Markdown code fences, expose hidden reasoning, provide diagnosis, or make clinical recommendations.`

const functionDeclarations: FunctionDeclaration[] = [
  { name: 'getSites', description: 'List research sites available from the connected OneAquaHealth source.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'getSite', description: 'Get one research site and its raw source records.', parameters: { type: Type.OBJECT, properties: { siteId: { type: Type.STRING } }, required: ['siteId'] } },
  { name: 'getObservations', description: 'Get normalized environmental observations for a site.', parameters: { type: Type.OBJECT, properties: { siteId: { type: Type.STRING } }, required: ['siteId'] } },
  { name: 'getCitizenObservations', description: 'Check whether connected citizen-science observations are available for a site.', parameters: { type: Type.OBJECT, properties: { siteId: { type: Type.STRING } }, required: ['siteId'] } },
  { name: 'getFHIRResources', description: 'Generate and return FHIR resources from live source data for a site.', parameters: { type: Type.OBJECT, properties: { siteId: { type: Type.STRING } }, required: ['siteId'] } },
  { name: 'validateFHIR', description: 'Validate a generated FHIR resource by ID.', parameters: { type: Type.OBJECT, properties: { resourceId: { type: Type.STRING } }, required: ['resourceId'] } },
  { name: 'getValidationReport', description: 'Return the validation report for a generated FHIR resource by ID.', parameters: { type: Type.OBJECT, properties: { resourceId: { type: Type.STRING } }, required: ['resourceId'] } },
  { name: 'createFHIRBundle', description: 'Create a FHIR collection Bundle for a site.', parameters: { type: Type.OBJECT, properties: { siteId: { type: Type.STRING } }, required: ['siteId'] } },
]

export interface ToolExecution {
  result: unknown
  sources: string[]
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<ToolExecution>

export interface AgentAnswer {
  answer: string
  toolsUsed: string[]
  sources: string[]
}

export class GeminiConfigurationError extends Error {
  constructor() {
    super('Gemini is not configured. Set GEMINI_API_KEY on the backend.')
    this.name = 'GeminiConfigurationError'
  }
}

export class GeminiProviderError extends Error {
  readonly diagnostic: string
  readonly status: 502 | 503

  constructor(model: string, providerMessage: string) {
    const isTemporarilyUnavailable = /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(providerMessage)
    const message = isTemporarilyUnavailable
      ? 'Gemini is temporarily busy or unavailable. Please retry shortly.'
      : /404|NOT_FOUND/i.test(providerMessage)
      ? `Gemini model "${model}" is unavailable. Set GEMINI_MODEL to a model enabled for your API key.`
      : /401|403|API_KEY_INVALID|PERMISSION_DENIED/i.test(providerMessage)
        ? 'Gemini rejected the API credentials. Verify GEMINI_API_KEY and project access.'
        : 'Gemini could not complete the request. Check model availability and API access.'
    super(message)
    this.name = 'GeminiProviderError'
    this.status = isTemporarilyUnavailable ? 503 : 502
    this.diagnostic = providerMessage.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : ''
}

export async function generateWithModelFallback<T>(
  generate: (model: string) => Promise<T>,
  primaryModel: string,
  fallbackModels: string[],
  fallbackAllowed: boolean,
): Promise<T> {
  try {
    return await generate(primaryModel)
  } catch (error) {
    const primaryError = new GeminiProviderError(primaryModel, errorMessage(error))
    if (!fallbackAllowed || primaryError.status !== 503 || fallbackModels.length === 0) {
      throw primaryError
    }
    let lastError = primaryError
    for (const fallbackModel of fallbackModels) {
      if (fallbackModel === primaryModel) continue
      try {
        return await generate(fallbackModel)
      } catch (fallbackError) {
        lastError = new GeminiProviderError(fallbackModel, errorMessage(fallbackError))
        if (lastError.status !== 503 && !/404|NOT_FOUND/i.test(errorMessage(fallbackError))) throw lastError
      }
    }
    throw lastError
  }
}

export class AiAgentService {
  async query(message: string, siteId: string | undefined, executeTool: ToolExecutor): Promise<AgentAnswer> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new GeminiConfigurationError()

    const ai = new GoogleGenAI({ apiKey })
    const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
    const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.7-flash,gemini-3.5-flash-lite')
      .split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean)
    const contents: Content[] = [{ role: 'user', parts: [{ text: `${message}${siteId ? `\nSelected site ID: ${siteId}` : ''}` }] }]
    const toolsUsed = new Set<string>()
    const sources = new Set<string>()

    for (let step = 0; step < 5; step += 1) {
      const response = await generateWithModelFallback(
        (activeModel) => ai.models.generateContent({
          model: activeModel,
          contents,
          config: {
            systemInstruction,
            temperature: 0.1,
            tools: [{ functionDeclarations }],
          },
        }),
        model,
        fallbackModels,
        step === 0,
      )
      const calls = response.functionCalls ?? []
      if (calls.length === 0) {
        return { answer: response.text?.trim() || 'No data is available from the connected source for that request.', toolsUsed: [...toolsUsed], sources: [...sources] }
      }

      const modelContent = response.candidates?.[0]?.content
      if (!modelContent) {
        throw new GeminiProviderError(model, 'Model returned function calls without the original candidate content.')
      }
      contents.push(modelContent)
      const functionResponses: Array<{ functionResponse: { name: string; response: Record<string, unknown>; id?: string } }> = []
      for (const call of calls) {
        if (!call.name) continue
        toolsUsed.add(call.name)
        const execution = await executeTool(call.name, (call.args ?? {}) as Record<string, unknown>)
        execution.sources.forEach((source) => sources.add(source))
        functionResponses.push({ functionResponse: { name: call.name, response: execution.result as Record<string, unknown>, ...(call.id ? { id: call.id } : {}) } })
      }
      if (functionResponses.length) contents.push({ role: 'user', parts: functionResponses })
    }

    return { answer: 'The request required more tool steps than allowed. Please narrow the question to one site or resource.', toolsUsed: [...toolsUsed], sources: [...sources] }
  }
}
