import { describe, expect, it, vi } from 'vitest'
import { AiAgentService, GeminiConfigurationError, GeminiProviderError, generateWithModelFallback } from './ai-agent.service.js'
import { ToolExecutorService } from './tool-executor.service.js'
import type { AquaManFhirService } from '../services/aquamanfhir.service.js'

describe('controlled AI tools', () => {
  it('dispatches only allowlisted source tools and preserves source record IDs', async () => {
    const fakeService = {
      getObservations: vi.fn().mockResolvedValue({
        items: [{ sourceRecordId: '21:healthRiskScore' }],
        retrievedAt: '2026-10-01T00:00:00.000Z',
        sourceErrors: [],
        isCached: true,
      }),
      getCitizenObservations: vi.fn().mockResolvedValue({ items: [], available: false, message: 'Citizen-science observations are not integrated into this prototype; upstream endpoints are documented, but access requirements have not been verified.' }),
    } as unknown as AquaManFhirService
    const tools = new ToolExecutorService(fakeService)

    const observations = await tools.execute('getObservations', { siteId: 'C1' })
    const unavailable = await tools.execute('getCitizenObservations', { siteId: 'C1' })
    const unsupported = await tools.execute('queryDatabase', {})

    expect(fakeService.getObservations).toHaveBeenCalledWith('C1')
    expect(observations.sources).toEqual(['21:healthRiskScore'])
    expect(observations.result).toMatchObject({ isCached: true })
    expect(unavailable.result).toMatchObject({ available: false, items: [] })
    expect(unsupported.result).toMatchObject({ error: 'Tool is not available.' })
    expect(unsupported.sources).toEqual([])
  })

  it('does not execute tools when Gemini is not configured', async () => {
    const originalKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    const executor = vi.fn()
    try {
      await expect(new AiAgentService().query('List sites', undefined, executor)).rejects.toBeInstanceOf(GeminiConfigurationError)
      expect(executor).not.toHaveBeenCalled()
    } finally {
      if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey
    }
  })

  it('classifies temporary provider capacity errors without exposing provider details', () => {
    const error = new GeminiProviderError('gemini-3.8-flash', '{"error":{"code":503,"status":"UNAVAILABLE"}}')
    expect(error.status).toBe(503)
    expect(error.message).toContain('retry shortly')
    expect(error.diagnostic).toContain('UNAVAILABLE')
  })

  it('redacts the configured fake key and common Google key shapes from provider diagnostics', () => {
    const previousKey = process.env.GEMINI_API_KEY
    const configuredFakeKey = 'configured-test-secret-value-0123456789'
    const aiStudioFakeKey = ['AIza', 'FAKE_KEY_12345678901234567890'].join('')
    const alternateFakeKey = ['AQ.', 'FAKE_PROVIDER_KEY_12345678901234567890'].join('')
    try {
      process.env.GEMINI_API_KEY = configuredFakeKey
      const error = new GeminiProviderError('fake-model', `denied ${configuredFakeKey}; google ${aiStudioFakeKey}; alternate ${alternateFakeKey}`)

      expect(error.diagnostic).not.toContain(configuredFakeKey)
      expect(error.diagnostic).not.toContain(aiStudioFakeKey)
      expect(error.diagnostic).not.toContain(alternateFakeKey)
      expect(error.diagnostic.match(/\[REDACTED\]/g)).toHaveLength(3)
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = previousKey
    }
  })

  it('uses the stable fallback once when the primary model is busy before tool execution', async () => {
    const generate = vi.fn(async (model: string) => {
      if (model === 'gemini-3.8-flash') throw new Error('503 UNAVAILABLE')
      return { model }
    })
    const result = await generateWithModelFallback(generate, 'gemini-3.8-flash', ['gemini-3.7-flash', 'gemini-3.5-flash-lite'], true)
    expect(result).toEqual({ model: 'gemini-3.7-flash' })
    expect(generate.mock.calls.map(([model]) => model)).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash'])
  })

  it('does not switch models after a tool turn has begun', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('503 UNAVAILABLE'))
    await expect(generateWithModelFallback(generate, 'gemini-3.8-flash', ['gemini-3.7-flash', 'gemini-3.5-flash-lite'], false)).rejects.toMatchObject({ status: 503 })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledWith('gemini-3.8-flash')
  })

  it('tries the next stable model if the first fallback is also temporarily unavailable', async () => {
    const generate = vi.fn(async (model: string) => {
      if (model !== 'gemini-3.5-flash-lite') throw new Error('503 UNAVAILABLE')
      return { model }
    })
    const result = await generateWithModelFallback(generate, 'gemini-3.8-flash', ['gemini-3.7-flash', 'gemini-3.5-flash-lite'], true)
    expect(result).toEqual({ model: 'gemini-3.5-flash-lite' })
    expect(generate.mock.calls.map(([model]) => model)).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'])
  })
})
