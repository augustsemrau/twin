import { useState, useCallback } from 'react'
import type { ContextPack, ActiveSession } from '@/types/sessions'
import type { ReconcilerOutput } from '@/types/agents'

export type WritebackPath = 'session_end' | 'clipboard' | 'quick_summary' | 'full_import' | null

export function useSessionTracker() {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])
  const [reconcilerResult, setReconcilerResult] = useState<ReconcilerOutput | null>(null)

  const startSession = useCallback((pack: ContextPack) => {
    const session: ActiveSession = {
      session_id: pack.session_id,
      target: pack.target,
      objective: pack.objective,
      dispatched_at: pack.created_at,
      writeback_received: false,
      writeback_path: null,
    }
    setActiveSessions(prev => [...prev, session])
  }, [])

  const markSessionDone = useCallback((sessionId: string, writebackPath: ActiveSession['writeback_path']) => {
    setActiveSessions(prev => prev.map(s =>
      s.session_id === sessionId ? { ...s, writeback_received: true, writeback_path: writebackPath } : s
    ))
  }, [])

  const updateWritebackPath = useCallback((sessionId: string, path: WritebackPath) => {
    setActiveSessions(prev => prev.map(s =>
      s.session_id === sessionId ? { ...s, writeback_path: path } : s
    ))
  }, [])

  const clearReconcilerResult = useCallback(() => setReconcilerResult(null), [])

  return {
    activeSessions,
    reconcilerResult,
    startSession,
    markSessionDone,
    updateWritebackPath,
    setReconcilerResult,
    clearReconcilerResult,
  }
}
