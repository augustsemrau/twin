import Anthropic from '@anthropic-ai/sdk'
import type { TokenUsage, ApiCallRecord } from '@/types/agents'

const PRICING = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cache_read: 0.1, cache_write: 1.25 },
  'claude-sonnet-4-5-20250514': { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 },
} as const

type ModelId = keyof typeof PRICING

let _client: Anthropic | null = null
let _totalUsage = {
  input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0,
  estimated_cost_usd: 0,
}
const _callLog: ApiCallRecord[] = []

export function getApiKey(): string {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set. Add VITE_ANTHROPIC_API_KEY to .env')
  return key
}

export function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: getApiKey(),
      maxRetries: 3,
      timeout: 30_000,
      dangerouslyAllowBrowser: true,
    })
  }
  return _client
}

export function addTokenUsage(usage: TokenUsage, model: ModelId = 'claude-haiku-4-5-20251001') {
  _totalUsage.input_tokens += usage.input_tokens
  _totalUsage.output_tokens += usage.output_tokens
  _totalUsage.cache_read_tokens += usage.cache_read_tokens
  _totalUsage.cache_creation_tokens += usage.cache_creation_tokens
  const pricing = PRICING[model] ?? PRICING['claude-haiku-4-5-20251001']
  _totalUsage.estimated_cost_usd +=
    (usage.input_tokens / 1_000_000) * pricing.input +
    (usage.output_tokens / 1_000_000) * pricing.output +
    (usage.cache_read_tokens / 1_000_000) * pricing.cache_read +
    (usage.cache_creation_tokens / 1_000_000) * pricing.cache_write
}

export function getTokenUsage() { return { ..._totalUsage } }
export function resetTokenUsage() {
  _totalUsage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, estimated_cost_usd: 0 }
}
export function getCallLog() { return [..._callLog] }
export function addCallRecord(record: ApiCallRecord) { _callLog.push(record) }
