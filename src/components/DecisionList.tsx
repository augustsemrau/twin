/**
 * DecisionList — Decision lifecycle UI.
 *
 * Shows all decisions for a project with active/superseded states.
 * Inline supersede flow: new decision title + text + rationale.
 */

import { useState, useCallback } from 'react'
import { ulid } from 'ulid'
import { readDecisions, writeDecisions } from '@/lib/fs'
import { applyAppendDecision, applySupersede } from '@/lib/state-updater'
import { validateDeltas } from '@/lib/validator'
import type { WorkGraph } from '@/types/graph'
import type { DecisionEntity } from '@/types/entities'
import type { DeltaOperation } from '@/types/deltas'

interface DecisionListProps {
  projectSlug: string
  graph: WorkGraph
  onGraphChanged: () => void
}

export function DecisionList({ projectSlug, graph, onGraphChanged }: DecisionListProps) {
  const [showSuperseded, setShowSuperseded] = useState(true)
  const [supersedeTargetId, setSupersedeTargetId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDecision, setNewDecision] = useState('')
  const [newRationale, setNewRationale] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allDecisions = graph.entities
    .filter((e): e is DecisionEntity => e.kind === 'decision' && e.project === projectSlug)
    .sort((a, b) => {
      // Newest first by date
      if (a.date && b.date) return b.date.localeCompare(a.date)
      if (a.date) return -1
      if (b.date) return 1
      return 0
    })

  const activeDecisions = allDecisions.filter((d) => d.status === 'active')
  const supersededDecisions = allDecisions.filter((d) => d.status === 'superseded')
  const visibleDecisions = showSuperseded ? allDecisions : activeDecisions

  const getSupersedingTitle = useCallback(
    (supersededById: string | undefined | null): string | null => {
      if (!supersededById) return null
      const found = allDecisions.find((d) => d.id === supersededById)
      return found?.title ?? supersededById
    },
    [allDecisions],
  )

  const handleStartSupersede = useCallback((decisionId: string) => {
    setSupersedeTargetId(decisionId)
    setNewTitle('')
    setNewDecision('')
    setNewRationale('')
    setError(null)
  }, [])

  const handleCancelSupersede = useCallback(() => {
    setSupersedeTargetId(null)
    setNewTitle('')
    setNewDecision('')
    setNewRationale('')
    setError(null)
  }, [])

  const handleConfirmSupersede = useCallback(async () => {
    if (!supersedeTargetId || !newTitle.trim() || !newDecision.trim()) return

    setSaving(true)
    setError(null)

    try {
      const newId = ulid()
      const today = new Date().toISOString().split('T')[0]

      // Build delta batch: append_decision + supersede_decision
      const appendDelta: DeltaOperation = {
        op: 'append_decision',
        payload: {
          id: newId,
          title: newTitle.trim(),
          decision: newDecision.trim(),
          rationale: newRationale.trim() || undefined,
          unblocks: [],
          date: today,
          project: projectSlug,
          status: 'active',
        },
      }

      const supersedeDelta: DeltaOperation = {
        op: 'supersede_decision',
        old_id: supersedeTargetId,
        new_id: newId,
        project: projectSlug,
      }

      const deltas = [appendDelta, supersedeDelta]

      // Validate as a batch
      const validation = validateDeltas(deltas, graph)
      if (!validation.valid) {
        setError(validation.errors.map((e) => e.reason).join('; '))
        setSaving(false)
        return
      }

      // Apply to current decisions from disk
      let decisions = await readDecisions(projectSlug)
      decisions = applyAppendDecision(
        decisions,
        appendDelta as Extract<DeltaOperation, { op: 'append_decision' }>,
      )
      decisions = applySupersede(
        decisions,
        supersedeDelta as Extract<DeltaOperation, { op: 'supersede_decision' }>,
      )
      await writeDecisions(projectSlug, decisions)

      handleCancelSupersede()
      onGraphChanged()
    } catch (err) {
      console.error('[DecisionList] Supersede failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [supersedeTargetId, newTitle, newDecision, newRationale, projectSlug, graph, handleCancelSupersede, onGraphChanged])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Decisions</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {activeDecisions.length} active
            {supersededDecisions.length > 0 && `, ${supersededDecisions.length} superseded`}
          </span>
          {supersededDecisions.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showSuperseded}
                onChange={(e) => setShowSuperseded(e.target.checked)}
                className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
              />
              Show superseded
            </label>
          )}
        </div>
      </div>

      {visibleDecisions.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No decisions yet</p>
        </div>
      )}

      <div className="space-y-3">
        {visibleDecisions.map((decision) => {
          const isActive = decision.status === 'active'
          const isSuperseding = supersedeTargetId === decision.id

          return (
            <div key={decision.id}>
              <div
                className={`rounded-lg border p-4 ${
                  isActive
                    ? 'border-l-4 border-l-teal-500 border-gray-200'
                    : 'border-l-4 border-l-gray-300 border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3
                      className={`font-medium ${
                        isActive ? 'text-gray-900' : 'text-gray-400 line-through'
                      }`}
                    >
                      {decision.title}
                    </h3>
                    <p className={`mt-1 text-sm ${isActive ? 'text-gray-700' : 'text-gray-400'}`}>
                      {decision.decision}
                    </p>
                    {decision.rationale && (
                      <p className={`mt-1 text-xs italic ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                        Rationale: {decision.rationale}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      {decision.date && <span>{decision.date}</span>}
                      {decision.decided_by && <span>by {decision.decided_by}</span>}
                      <span className="font-mono">{decision.id.slice(0, 8)}</span>
                    </div>
                    {!isActive && decision.superseded_by && (
                      <p className="mt-2 text-xs text-gray-400">
                        Superseded by: {getSupersedingTitle(decision.superseded_by)}
                      </p>
                    )}
                  </div>
                  {isActive && !isSuperseding && (
                    <button
                      type="button"
                      onClick={() => handleStartSupersede(decision.id)}
                      className="flex-shrink-0 rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                    >
                      Supersede
                    </button>
                  )}
                </div>
              </div>

              {/* Inline supersede form */}
              {isSuperseding && (
                <div className="ml-6 mt-2 rounded-lg border border-teal-200 bg-teal-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-teal-800">
                    New decision replacing "{decision.title}"
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="New decision title"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Decision</label>
                      <textarea
                        value={newDecision}
                        onChange={(e) => setNewDecision(e.target.value)}
                        placeholder="What was decided?"
                        rows={3}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Rationale (optional)</label>
                      <input
                        type="text"
                        value={newRationale}
                        onChange={(e) => setNewRationale(e.target.value)}
                        placeholder="Why the change?"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    {error && (
                      <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleConfirmSupersede}
                        disabled={saving || !newTitle.trim() || !newDecision.trim()}
                        className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {saving ? 'Saving...' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelSupersede}
                        disabled={saving}
                        className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
