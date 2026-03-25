import { useState } from 'react'
import type { WorkGraph } from '@/types/graph'
import type { DeltaOperation } from '@/types/deltas'
import type { ProposedObservation, ResolverOutput } from '@/types/agents'
import { DeltaReview } from './DeltaReview'
import { runResolver } from '@/lib/resolver'
import { validateDeltas } from '@/lib/validator'
import {
  applyCreateTask,
  applyUpdateTaskStatus,
  applyMarkBlocked,
  applyMarkUnblocked,
  applyAppendDecision,
  applySupersede,
  applyCreateDelivery,
  applyUpdateDeliveryStatus,
  applyAddOpenQuestion,
  applyUpsertPerson,
} from '@/lib/state-updater'
import {
  readTasks,
  readDeliveries,
  readDecisions,
  readPeople,
  writeTasks,
  writeDeliveries,
  writeDecisions,
  writePeople,
} from '@/lib/fs'
import { markStaleForDelta } from '@/lib/claude-generator'

interface SessionEndModalProps {
  sessionId: string  // used by parent to identify which session
  projectSlug?: string
  graph: WorkGraph
  onSave: (summary: string, flags: { decisions: boolean; tasks: boolean; nothing: boolean }) => void
  onGraphChanged: () => void
  onImportFull: () => void
  onCancel: () => void
}

type Phase = 'form' | 'resolving' | 'review'

export function SessionEndModal({
  sessionId,
  projectSlug,
  graph,
  onSave,
  onGraphChanged,
  onImportFull,
  onCancel,
}: SessionEndModalProps) {
  void sessionId // tracked by parent
  const [summary, setSummary] = useState('')
  const [decisions, setDecisions] = useState(false)
  const [tasks, setTasks] = useState(false)
  const [nothing, setNothing] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [resolverOutput, setResolverOutput] = useState<ResolverOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleNothingToggle = (checked: boolean) => {
    setNothing(checked)
    if (checked) {
      setDecisions(false)
      setTasks(false)
    }
  }

  const handleSave = async () => {
    if (nothing || !summary.trim()) {
      onSave(nothing ? '' : summary.trim(), { decisions, tasks, nothing })
      return
    }

    // Run Resolver on the summary text
    setPhase('resolving')
    setError(null)
    try {
      // Build a context-rich input for the Resolver
      const hints: string[] = []
      if (decisions) hints.push('The user indicated decisions were made.')
      if (tasks) hints.push('The user indicated new tasks were identified.')
      const resolverInput = hints.length > 0
        ? `${summary.trim()}\n\n[Hints: ${hints.join(' ')}]`
        : summary.trim()

      const result = await runResolver(resolverInput, graph, projectSlug)
      setResolverOutput(result)
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('form')
    }
  }

  const applyDelta = async (delta: DeltaOperation) => {
    switch (delta.op) {
      case 'create_task': {
        const t = await readTasks(delta.payload.project)
        const updated = applyCreateTask(t, delta)
        await writeTasks(delta.payload.project, updated)
        break
      }
      case 'update_task_status': {
        const t = await readTasks(delta.project)
        const updated = applyUpdateTaskStatus(t, delta)
        await writeTasks(delta.project, updated)
        break
      }
      case 'mark_blocked': {
        const t = await readTasks(delta.project)
        const updated = applyMarkBlocked(t, delta)
        await writeTasks(delta.project, updated)
        break
      }
      case 'mark_unblocked': {
        const t = await readTasks(delta.project)
        const updated = applyMarkUnblocked(t, delta)
        await writeTasks(delta.project, updated)
        break
      }
      case 'append_decision': {
        const d = await readDecisions(delta.payload.project)
        const updated = applyAppendDecision(d, delta)
        await writeDecisions(delta.payload.project, updated)
        break
      }
      case 'supersede_decision': {
        const d = await readDecisions(delta.project)
        const updated = applySupersede(d, delta)
        await writeDecisions(delta.project, updated)
        break
      }
      case 'create_delivery': {
        const dl = await readDeliveries(delta.payload.project)
        const updated = applyCreateDelivery(dl, delta)
        await writeDeliveries(delta.payload.project, updated)
        break
      }
      case 'update_delivery_status': {
        const dl = await readDeliveries(delta.project)
        const updated = applyUpdateDeliveryStatus(dl, delta)
        await writeDeliveries(delta.project, updated)
        break
      }
      case 'add_open_question': {
        applyAddOpenQuestion(delta)
        break
      }
      case 'resolve_question': {
        console.warn('[SessionEndModal] resolve_question delta not yet wired to file I/O')
        break
      }
      case 'upsert_person': {
        const p = await readPeople()
        const updated = applyUpsertPerson(p, delta)
        await writePeople(updated)
        break
      }
      default:
        break
    }

    markStaleForDelta(delta)
  }

  const handleAcceptDeltas = async (selected: ProposedObservation[]) => {
    try {
      const deltas = selected
        .map((obs) => obs.proposed_delta)
        .filter((d): d is DeltaOperation => d !== null)

      if (deltas.length > 0) {
        const validation = validateDeltas(deltas, graph)
        if (!validation.valid) {
          console.error('[SessionEndModal] Validation errors:', validation.errors)
        }

        // Apply only valid deltas (those not mentioned in errors)
        const errorIds = new Set(
          (validation.errors ?? []).map((e: { delta_index: number }) => e.delta_index),
        )
        for (let i = 0; i < deltas.length; i++) {
          if (!errorIds.has(i)) {
            await applyDelta(deltas[i])
          }
        }

        onGraphChanged()
      }
    } catch (err) {
      console.error('[SessionEndModal] Error applying deltas:', err)
    }

    onSave(summary.trim(), { decisions, tasks, nothing })
  }

  const handleDiscardDeltas = () => {
    // Still save the summary, just discard resolver suggestions
    onSave(summary.trim(), { decisions, tasks, nothing })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'form' && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              What came out of this session?
            </h2>

            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Quick summary — 1-3 sentences"
              disabled={nothing}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              rows={3}
            />

            <div className="mb-6 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={decisions}
                  onChange={(e) => setDecisions(e.target.checked)}
                  disabled={nothing}
                  className="h-4 w-4 accent-blue-600"
                />
                Decisions were made
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={tasks}
                  onChange={(e) => setTasks(e.target.checked)}
                  disabled={nothing}
                  className="h-4 w-4 accent-blue-600"
                />
                New tasks identified
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={nothing}
                  onChange={(e) => handleNothingToggle(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                Nothing actionable — just thinking
              </label>
            </div>

            {error && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onImportFull}
                  className="rounded-md border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  Import full conversation
                </button>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === 'resolving' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm text-gray-600">Analyzing summary...</p>
          </div>
        )}

        {phase === 'review' && resolverOutput && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Review proposed changes
            </h2>
            <DeltaReview
              observations={resolverOutput.proposed_observations}
              confidence={resolverOutput.confidence}
              onAccept={handleAcceptDeltas}
              onDiscard={handleDiscardDeltas}
            />
          </>
        )}
      </div>
    </div>
  )
}
