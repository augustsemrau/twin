/**
 * state-updater.ts — Pure transformation functions for delta operations
 *
 * Each function takes current data + delta, returns new data.
 * Immutable: returns new arrays/objects, never mutates input.
 *
 * I/O-dependent operations (link_note_delivery, archive_project) are
 * handled at the I/O layer and not included here.
 */

import { ulid } from 'ulid'
import type {
  TaskEntity,
  DeliveryEntity,
  DecisionEntity,
  PersonEntity,
  NoteEntity,
  OpenQuestionEntity,
} from '@/types/entities'
import type { DeltaOperation } from '@/types/deltas'

// ---------------------------------------------------------------------------
// Task operations
// ---------------------------------------------------------------------------

export function applyCreateTask(
  tasks: TaskEntity[],
  delta: Extract<DeltaOperation, { op: 'create_task' }>,
): TaskEntity[] {
  const { payload } = delta
  const newTask: TaskEntity = {
    kind: 'task',
    ref: { file: `projects/${payload.project}/tasks.yaml` },
    id: payload.id || ulid(),
    title: payload.title,
    status: payload.status,
    priority: payload.priority,
    due_date: payload.due_date,
    blocked_by: payload.blocked_by,
    waiting_on: payload.waiting_on,
    project: payload.project,
    delivery: payload.delivery,
  }
  return [...tasks, newTask]
}

export function applyUpdateTaskStatus(
  tasks: TaskEntity[],
  delta: Extract<DeltaOperation, { op: 'update_task_status' }>,
): TaskEntity[] {
  return tasks.map((t) =>
    t.id === delta.task_id ? { ...t, status: delta.status } : t,
  )
}

export function applyMarkBlocked(
  tasks: TaskEntity[],
  delta: Extract<DeltaOperation, { op: 'mark_blocked' }>,
): TaskEntity[] {
  return tasks.map((t) =>
    t.id === delta.task_id
      ? {
          ...t,
          status: 'blocked' as const,
          blocked_by: delta.blocked_by,
          waiting_on: delta.waiting_on,
        }
      : t,
  )
}

export function applyMarkUnblocked(
  tasks: TaskEntity[],
  delta: Extract<DeltaOperation, { op: 'mark_unblocked' }>,
): TaskEntity[] {
  return tasks.map((t) =>
    t.id === delta.task_id
      ? {
          ...t,
          status: 'todo' as const,
          blocked_by: null,
          waiting_on: null,
        }
      : t,
  ) as TaskEntity[]
}

// ---------------------------------------------------------------------------
// Decision operations
// ---------------------------------------------------------------------------

export function applyAppendDecision(
  decisions: DecisionEntity[],
  delta: Extract<DeltaOperation, { op: 'append_decision' }>,
): DecisionEntity[] {
  const { payload } = delta
  const newDecision: DecisionEntity = {
    kind: 'decision',
    ref: { file: `projects/${payload.project}/decisions.yaml` },
    id: payload.id || ulid(),
    title: payload.title,
    decision: payload.decision,
    rationale: payload.rationale,
    unblocks: payload.unblocks,
    date: payload.date,
    decided_by: payload.decided_by,
    project: payload.project,
    status: payload.status,
    superseded_by: payload.superseded_by,
  }
  return [...decisions, newDecision]
}

export function applySupersede(
  decisions: DecisionEntity[],
  delta: Extract<DeltaOperation, { op: 'supersede_decision' }>,
): DecisionEntity[] {
  // Verify the new decision exists
  const newExists = decisions.some((d) => d.id === delta.new_id)
  if (!newExists) {
    throw new Error(
      `Cannot supersede: new decision ${delta.new_id} does not exist`,
    )
  }
  return decisions.map((d) =>
    d.id === delta.old_id
      ? { ...d, status: 'superseded' as const, superseded_by: delta.new_id }
      : d,
  )
}

// ---------------------------------------------------------------------------
// Delivery operations
// ---------------------------------------------------------------------------

export function applyCreateDelivery(
  deliveries: DeliveryEntity[],
  delta: Extract<DeltaOperation, { op: 'create_delivery' }>,
): DeliveryEntity[] {
  const { payload } = delta
  const newDelivery: DeliveryEntity = {
    kind: 'delivery',
    ref: { file: `projects/${payload.project}/deliveries.yaml` },
    id: payload.id || ulid(),
    slug: payload.slug,
    title: payload.title,
    type: payload.type,
    status: payload.status,
    due_date: payload.due_date,
    brief: payload.brief,
    project: payload.project,
  }
  return [...deliveries, newDelivery]
}

export function applyUpdateDeliveryStatus(
  deliveries: DeliveryEntity[],
  delta: Extract<DeltaOperation, { op: 'update_delivery_status' }>,
): DeliveryEntity[] {
  return deliveries.map((d) =>
    d.id === delta.delivery_id ? { ...d, status: delta.status } : d,
  )
}

// ---------------------------------------------------------------------------
// Note operations
// ---------------------------------------------------------------------------

export function applyCreateNote(
  delta: Extract<DeltaOperation, { op: 'create_note' }>,
): { entity: NoteEntity; content: string } {
  const { payload, body } = delta
  const id = payload.id || ulid()

  const entity: NoteEntity = {
    kind: 'note',
    ref: { file: `projects/${payload.project}/notes/${payload.filename}` },
    id,
    filename: payload.filename,
    title: payload.title,
    type: payload.type,
    project: payload.project,
    twin_synced: payload.twin_synced,
    people: payload.people,
  }

  // Serialize as markdown with YAML frontmatter
  const frontmatter = [
    '---',
    `id: ${id}`,
    `title: ${payload.title}`,
    `type: ${payload.type}`,
    `project: ${payload.project ?? ''}`,
    `twin_synced: ${payload.twin_synced}`,
    `people: [${payload.people.join(', ')}]`,
    '---',
  ].join('\n')

  const content = `${frontmatter}\n\n${body}\n`

  return { entity, content }
}

// ---------------------------------------------------------------------------
// Open question operations
// ---------------------------------------------------------------------------

export function applyAddOpenQuestion(
  delta: Extract<DeltaOperation, { op: 'add_open_question' }>,
): OpenQuestionEntity {
  const { payload } = delta
  return {
    kind: 'open_question',
    ref: { file: `projects/${payload.project}/tasks.yaml` },
    id: payload.id || ulid(),
    question: payload.question,
    project: payload.project,
    source_note: payload.source_note,
    status: payload.status,
  }
}

export function applyResolveQuestion(
  questions: OpenQuestionEntity[],
  delta: Extract<DeltaOperation, { op: 'resolve_question' }>,
): OpenQuestionEntity[] {
  return questions.map((q) =>
    q.id === delta.question_id ? { ...q, status: 'resolved' as const } : q,
  )
}

// ---------------------------------------------------------------------------
// Person operations
// ---------------------------------------------------------------------------

export function applyUpsertPerson(
  people: PersonEntity[],
  delta: Extract<DeltaOperation, { op: 'upsert_person' }>,
): PersonEntity[] {
  const { payload } = delta
  const existingIndex = people.findIndex((p) => p.id === payload.id)

  if (existingIndex !== -1) {
    // Update existing
    return people.map((p) =>
      p.id === payload.id
        ? {
            ...p,
            name: payload.name,
            role: payload.role,
            projects: payload.projects,
          }
        : p,
    )
  }

  // Append new
  const newPerson: PersonEntity = {
    kind: 'person',
    ref: { file: 'people.yaml' },
    id: payload.id || ulid(),
    name: payload.name,
    role: payload.role,
    projects: payload.projects,
  }
  return [...people, newPerson]
}
