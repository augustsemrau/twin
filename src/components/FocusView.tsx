import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkGraph } from '@/types/graph'
import type { PrioritiserOutput } from '@/types/agents'
import type { DeltaOperation } from '@/types/deltas'
import type { ProjectEntity, TaskEntity } from '@/types/entities'
import { runPrioritiser } from '@/lib/prioritiser'
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
import { getTokenUsage } from '@/lib/anthropic-client'
import { markStaleForDelta } from '@/lib/claude-generator'
import { StatusBadge } from './StatusBadge'
import { ProposalCard } from './ProposalCard'

interface FocusViewProps {
  graph: WorkGraph
  onGraphChanged: () => void
  inboxCount: number
}

type BriefState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: PrioritiserOutput }
  | { status: 'error'; message: string }

/**
 * Sort tasks for the open items list:
 * overdue -> due today -> blocked -> high -> medium -> low
 */
function sortTasks(tasks: TaskEntity[], today: string): TaskEntity[] {
  const todayMs = new Date(today).getTime()

  function score(t: TaskEntity): number {
    const dueMs = t.due_date ? new Date(t.due_date).getTime() : Infinity
    // Overdue (lowest score = first)
    if (dueMs < todayMs) return 0
    // Due today
    if (t.due_date === today) return 1
    // Blocked
    if (t.status === 'blocked') return 2
    // Priority
    if (t.priority === 'high') return 3
    if (t.priority === 'medium') return 4
    return 5
  }

  return [...tasks].sort((a, b) => score(a) - score(b))
}

function isOverdue(dueDate: string | undefined, today: string): boolean {
  if (!dueDate) return false
  return new Date(dueDate).getTime() < new Date(today).getTime()
}

export function FocusView({ graph, onGraphChanged, inboxCount }: FocusViewProps) {
  const [briefState, setBriefState] = useState<BriefState>({ status: 'idle' })
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  const fetchedRef = useRef(false)

  const today = new Date().toISOString().slice(0, 10)
  const dateObj = new Date(today + 'T12:00:00') // Avoid timezone issues
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const projects = graph.entities.filter(
    (e): e is ProjectEntity => e.kind === 'project' && e.status === 'active',
  )
  const allTasks = graph.entities.filter(
    (e): e is TaskEntity => e.kind === 'task' && e.status !== 'done',
  )
  const openItems = sortTasks(allTasks, today)

  const costToday = getTokenUsage().estimated_cost_usd

  const fetchBrief = useCallback(async () => {
    setBriefState({ status: 'loading' })
    try {
      const result = await runPrioritiser(graph, today)
      setBriefState({ status: 'loaded', data: result })
    } catch (err) {
      setBriefState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [graph, today])

  // Fetch once on mount
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchBrief()
    }
  }, [fetchBrief])

  // Apply a single delta operation
  const applyDelta = async (delta: DeltaOperation) => {
    const validation = validateDeltas([delta], graph)
    if (!validation.valid) {
      console.error('[FocusView] Validation errors:', validation.errors)
      return
    }

    switch (delta.op) {
      case 'create_task': {
        const tasks = await readTasks(delta.payload.project)
        const updated = applyCreateTask(tasks, delta)
        await writeTasks(delta.payload.project, updated)
        break
      }
      case 'update_task_status': {
        const tasks = await readTasks(delta.project)
        const updated = applyUpdateTaskStatus(tasks, delta)
        await writeTasks(delta.project, updated)
        break
      }
      case 'mark_blocked': {
        const tasks = await readTasks(delta.project)
        const updated = applyMarkBlocked(tasks, delta)
        await writeTasks(delta.project, updated)
        break
      }
      case 'mark_unblocked': {
        const tasks = await readTasks(delta.project)
        const updated = applyMarkUnblocked(tasks, delta)
        await writeTasks(delta.project, updated)
        break
      }
      case 'append_decision': {
        const decisions = await readDecisions(delta.payload.project)
        const updated = applyAppendDecision(decisions, delta)
        await writeDecisions(delta.payload.project, updated)
        break
      }
      case 'supersede_decision': {
        const decisions = await readDecisions(delta.project)
        const updated = applySupersede(decisions, delta)
        await writeDecisions(delta.project, updated)
        break
      }
      case 'create_delivery': {
        const deliveries = await readDeliveries(delta.payload.project)
        const updated = applyCreateDelivery(deliveries, delta)
        await writeDeliveries(delta.payload.project, updated)
        break
      }
      case 'update_delivery_status': {
        const deliveries = await readDeliveries(delta.project)
        const updated = applyUpdateDeliveryStatus(deliveries, delta)
        await writeDeliveries(delta.project, updated)
        break
      }
      case 'add_open_question': {
        // applyAddOpenQuestion returns a single new entity; no file write needed here
        // as open questions are derived from the graph builder
        applyAddOpenQuestion(delta)
        break
      }
      case 'resolve_question': {
        // Resolve question requires reading open questions from the graph
        // This is a rare proposal action; skip file write for now
        console.warn('[FocusView] resolve_question delta not yet wired to file I/O')
        break
      }
      case 'upsert_person': {
        const people = await readPeople()
        const updated = applyUpsertPerson(people, delta)
        await writePeople(updated)
        break
      }
      default:
        break
    }

    markStaleForDelta(delta)
    onGraphChanged()
  }

  const handleAcceptProposal = (
    proposal: PrioritiserOutput['proactive_proposals'][0],
  ) => {
    if (proposal.proposed_delta) {
      applyDelta(proposal.proposed_delta)
    }
    // Dismiss after accepting
    setDismissedKeys((prev) => {
      const next = new Set(prev)
      next.add(proposal.entity_refs.sort().join(','))
      return next
    })
  }

  const handleDismissProposal = (
    proposal: PrioritiserOutput['proactive_proposals'][0],
  ) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev)
      next.add(proposal.entity_refs.sort().join(','))
      return next
    })
  }

  const visibleProposals =
    briefState.status === 'loaded'
      ? briefState.data.proactive_proposals.filter(
          (p) => !dismissedKeys.has(p.entity_refs.sort().join(',')),
        )
      : []

  // Find project name for a task
  const projectName = (slug: string) => {
    const p = projects.find((proj) => proj.slug === slug)
    return p ? p.name : slug
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{formattedDate}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {projects.length} active project{projects.length !== 1 ? 's' : ''}
          {' \u00b7 '}
          {inboxCount} inbox item{inboxCount !== 1 ? 's' : ''}
          {' \u00b7 '}
          ${costToday.toFixed(2)} today
        </p>
      </div>

      {/* AI Priority Brief */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        {briefState.status === 'loading' && (
          <p className="text-sm text-gray-500 animate-pulse">
            Generating priority brief...
          </p>
        )}
        {briefState.status === 'loaded' && (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed text-gray-800">
              {briefState.data.brief}
            </p>
            <button
              onClick={fetchBrief}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Refresh
            </button>
          </div>
        )}
        {briefState.status === 'error' && (
          <div>
            <p className="text-sm text-gray-500">
              Priority brief unavailable
            </p>
            <button
              onClick={fetchBrief}
              className="mt-1 text-xs text-blue-600 hover:text-blue-800"
            >
              Tap to retry
            </button>
          </div>
        )}
        {briefState.status === 'idle' && (
          <p className="text-sm text-gray-500">Initializing...</p>
        )}
      </div>

      {/* Proactive Proposals */}
      {visibleProposals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Proactive Proposals
          </h2>
          {visibleProposals.map((proposal, i) => (
            <ProposalCard
              key={`${proposal.entity_refs.join(',')}-${i}`}
              proposal={proposal.proposal}
              triggerReason={proposal.trigger_reason}
              entityRefs={proposal.entity_refs}
              proposedDelta={proposal.proposed_delta}
              onAccept={() => handleAcceptProposal(proposal)}
              onDismiss={() => handleDismissProposal(proposal)}
            />
          ))}
        </div>
      )}

      {/* Open Items */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Open Items
        </h2>
        {openItems.length === 0 ? (
          <p className="text-sm text-gray-400">No open items.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {openItems.map((task) => {
              const overdue = isOverdue(task.due_date, today)
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="text-gray-400">&#9654;</span>
                  <span
                    className={`flex-1 text-sm font-medium ${
                      overdue ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    {task.title}
                  </span>
                  <StatusBadge value={task.status} size="sm" />
                  <StatusBadge value={task.priority} size="sm" />
                  {task.due_date && (
                    <span
                      className={`text-xs ${
                        overdue ? 'font-medium text-red-600' : 'text-gray-500'
                      }`}
                    >
                      {task.due_date.slice(5)}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {projectName(task.project)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
