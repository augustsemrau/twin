import { describe, it, expect, vi } from 'vitest'
import { getApiKey, addTokenUsage, getTokenUsage, resetTokenUsage } from './anthropic-client'

describe('anthropic-client', () => {
  it('reads API key from import.meta.env', () => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'sk-ant-test-key')
    const key = getApiKey()
    expect(key).toBe('sk-ant-test-key')
    vi.unstubAllEnvs()
  })

  it('throws if API key is not set', () => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '')
    expect(() => getApiKey()).toThrow('ANTHROPIC_API_KEY')
    vi.unstubAllEnvs()
  })

  it('tracks cumulative token usage', () => {
    resetTokenUsage()
    addTokenUsage({ input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0 })
    addTokenUsage({ input_tokens: 200, output_tokens: 100, cache_read_tokens: 50, cache_creation_tokens: 0 })
    const usage = getTokenUsage()
    expect(usage.input_tokens).toBe(300)
    expect(usage.output_tokens).toBe(150)
    expect(usage.cache_read_tokens).toBe(50)
  })

  it('calculates estimated cost for Haiku', () => {
    resetTokenUsage()
    addTokenUsage({ input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_tokens: 0, cache_creation_tokens: 0 })
    const usage = getTokenUsage()
    // Haiku: $1/MTok input + $5/MTok output = $6
    expect(usage.estimated_cost_usd).toBeCloseTo(6.0, 1)
  })

  it('calculates estimated cost for Sonnet', () => {
    resetTokenUsage()
    addTokenUsage(
      { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_tokens: 0, cache_creation_tokens: 0 },
      'claude-sonnet-4-5-20250514'
    )
    const usage = getTokenUsage()
    // Sonnet: $3/MTok input + $15/MTok output = $18
    expect(usage.estimated_cost_usd).toBeCloseTo(18.0, 1)
  })

  it('resets token usage', () => {
    addTokenUsage({ input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0 })
    resetTokenUsage()
    const usage = getTokenUsage()
    expect(usage.input_tokens).toBe(0)
    expect(usage.estimated_cost_usd).toBe(0)
  })
})
