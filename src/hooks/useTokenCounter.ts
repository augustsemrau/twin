import { useState, useCallback } from 'react'
import { getTokenUsage, resetTokenUsage } from '@/lib/anthropic-client'

export function useTokenCounter() {
  const [usage, setUsage] = useState(getTokenUsage())
  const refresh = useCallback(() => setUsage(getTokenUsage()), [])
  const reset = useCallback(() => { resetTokenUsage(); refresh() }, [refresh])
  return { usage, refresh, reset }
}
