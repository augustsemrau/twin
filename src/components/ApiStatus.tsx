/**
 * ApiStatus — Sidebar footer widget showing API key status and token cost.
 *
 * Reads token usage from useTokenCounter and checks for a configured
 * API key via the VITE_ANTHROPIC_API_KEY env variable.
 */

import { useTokenCounter } from '@/hooks/useTokenCounter'

export function ApiStatus() {
  const { usage } = useTokenCounter()

  let apiAvailable = true
  try {
    const key = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!key) apiAvailable = false
  } catch {
    apiAvailable = false
  }

  const costStr =
    usage.estimated_cost_usd < 0.01
      ? '<$0.01'
      : `$${usage.estimated_cost_usd.toFixed(2)}`

  return (
    <div className="text-xs text-slate-400 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${apiAvailable ? 'bg-green-400' : 'bg-red-400'}`}
        />
        <span>{apiAvailable ? 'Twin active' : 'API key missing'}</span>
        <span className="ml-auto">{costStr} today</span>
      </div>
    </div>
  )
}
