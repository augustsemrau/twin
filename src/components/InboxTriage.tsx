import { useState, useEffect, useCallback } from 'react'
import { ulid } from 'ulid'
import type { WorkGraph } from '@/types/graph'
import type { InboxItem as InboxItemType, ProjectEntity } from '@/types/entities'
import type { DeltaOperation } from '@/types/deltas'
import type { NoteType } from '@/types/common'
import { readInboxItems, clearInbox, writeNote, writeTasks, writeDeliveries, writeDecisions, writePeople, readTasks, readDeliveries, readDecisions, readPeople } from '@/lib/fs'
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
  applyCreateNote,
  applyUpsertPerson,
} from '@/lib/state-updater'
import { InboxItem } from './InboxItem'

interface InboxTriageProps {
  graph: WorkGraph
  onGraphChanged: () => void
  onCountChanged?: (count: number) => void
}

export function InboxTriage({ graph, onGraphChanged, onCountChanged }: InboxTriageProps) {
  const [items, setItems] = useState<InboxItemType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const projects = graph.entities.filter(
    (e): e is ProjectEntity => e.kind === 'project',
  )

  // Load inbox items on mount
  useEffect(() => {
    loadItems()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadItems = async () => {
    try {
      setLoading(true)
      setError(null)
      const loaded = await readInboxItems()
      // Sort chronologically — oldest first
      loaded.sort((a, b) => a.captured.localeCompare(b.captured))
      setItems(loaded)
      onCountChanged?.(loaded.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const removeItem = useCallback((filename: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.filename !== filename)
      onCountChanged?.(next.length)
      return next
    })
  }, [onCountChanged])

  // Apply delta operations to disk
  const applyDeltas = async (deltas: DeltaOperation[]) => {
    for (const delta of deltas) {
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
        case 'create_note': {
          const { content } = applyCreateNote(delta)
          const project = delta.payload.project ?? ''
          await writeNote(project, delta.payload.filename, content)
          break
        }
        case 'upsert_person': {
          const people = await readPeople()
          const updated = applyUpsertPerson(people, delta)
          await writePeople(updated)
          break
        }
        // Other delta types (add_open_question, resolve_question, link_note_delivery, archive_project)
        // are not expected during inbox triage but could be added here if needed
        default:
          break
      }
    }
  }

  // Accept handler: validate deltas, apply, move file, remove from list
  const handleAccept = useCallback(async (item: InboxItemType, deltas: DeltaOperation[]) => {
    try {
      const validation = validateDeltas(deltas, graph)
      if (!validation.valid) {
        console.error('[InboxTriage] Validation errors:', validation.errors)
        setError(`Validation failed: ${validation.errors.map((e) => e.reason).join(', ')}`)
        return
      }

      if (validation.warnings.length > 0) {
        console.warn('[InboxTriage] Validation warnings:', validation.warnings)
      }

      await applyDeltas(deltas)
      await clearInbox(item.filename)
      removeItem(item.filename)
      onGraphChanged()
    } catch (err) {
      console.error('[InboxTriage] Accept failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [graph, removeItem, onGraphChanged])

  // Edit handler: create a note delta from manual classification, validate, apply, remove
  const handleEdit = useCallback(async (
    item: InboxItemType,
    classification: { project: string; noteType: NoteType; title: string },
  ) => {
    try {
      const id = ulid()
      const now = new Date().toISOString()
      const slug = classification.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40)
      const dateStr = now.split('T')[0]
      const filename = `${dateStr}-${slug}.md`

      const delta: DeltaOperation = {
        op: 'create_note',
        payload: {
          id,
          filename,
          title: classification.title,
          type: classification.noteType,
          project: classification.project,
          twin_synced: true,
          people: [],
        },
        body: item.raw,
      }

      const validation = validateDeltas([delta], graph)
      if (!validation.valid) {
        console.error('[InboxTriage] Validation errors:', validation.errors)
        setError(`Validation failed: ${validation.errors.map((e) => e.reason).join(', ')}`)
        return
      }

      await applyDeltas([delta])
      await clearInbox(item.filename)
      removeItem(item.filename)
      onGraphChanged()
    } catch (err) {
      console.error('[InboxTriage] Edit failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [graph, removeItem, onGraphChanged])

  // Discard handler: delete inbox file, remove from list
  const handleDiscard = useCallback(async (item: InboxItemType) => {
    try {
      await clearInbox(item.filename)
      removeItem(item.filename)
    } catch (err) {
      console.error('[InboxTriage] Discard failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [removeItem])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading inbox...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => { setError(null); loadItems() }}
            className="mt-2 text-sm text-red-600 underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-medium">Inbox clear — nothing to triage</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">
        Inbox <span className="text-lg font-normal text-gray-500">({items.length} item{items.length !== 1 ? 's' : ''})</span>
      </h1>

      <div className="space-y-3">
        {items.map((item) => (
          <InboxItem
            key={item.filename}
            item={item}
            resolverOutput={item.resolver_output}
            projects={projects}
            onAccept={handleAccept}
            onEdit={handleEdit}
            onDiscard={handleDiscard}
          />
        ))}
      </div>
    </div>
  )
}
