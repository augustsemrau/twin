/**
 * validator.ts — Rule-based delta validator
 *
 * Checks delta operations against the current work graph.
 * No LLM calls — pure rule checks.
 */

import type { DeltaOperation } from '@/types/deltas'
import type { WorkGraph } from '@/types/graph'
import type { WorkGraphEntity, TaskEntity, DecisionEntity, ProjectEntity } from '@/types/entities'

export type ValidationError = { op: DeltaOperation; reason: string }
export type ValidationWarning = { op: DeltaOperation; reason: string }

export type ValidationResult = {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findEntityById(graph: WorkGraph, kind: string, id: string): WorkGraphEntity | undefined {
  return graph.entities.find(e => {
    if (e.kind !== kind) return false
    if (e.kind === 'project') return (e as ProjectEntity).slug === id
    return 'id' in e && (e as unknown as { id: string }).id === id
  })
}

function findProjectBySlug(graph: WorkGraph, slug: string): boolean {
  return graph.entities.some(e => e.kind === 'project' && (e as ProjectEntity).slug === slug)
}

// ---------------------------------------------------------------------------
// Per-operation validators
// ---------------------------------------------------------------------------

function validateOp(
  op: DeltaOperation,
  graph: WorkGraph,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  allDeltas: DeltaOperation[] = [],
): void {
  const err = (reason: string) => errors.push({ op, reason })
  const warn = (reason: string) => warnings.push({ op, reason })

  switch (op.op) {
    case 'create_task': {
      const { project, delivery, id } = op.payload
      if (!id) { err('id must be a non-empty string'); return }
      if (!findProjectBySlug(graph, project)) {
        err(`project '${project}' not found in graph`)
      }
      if (delivery != null && delivery !== '') {
        if (!findEntityById(graph, 'delivery', delivery)) {
          err(`delivery '${delivery}' not found in graph`)
        }
      }
      break
    }

    case 'update_task_status': {
      const { task_id } = op
      if (!task_id) { err('task_id must be a non-empty string'); return }
      const entity = findEntityById(graph, 'task', task_id)
      if (!entity) {
        err(`task '${task_id}' not found in graph`)
        return
      }
      // entity is confirmed to be a task
      break
    }

    case 'mark_blocked': {
      const { task_id } = op
      if (!task_id) { err('task_id must be a non-empty string'); return }
      const entity = findEntityById(graph, 'task', task_id)
      if (!entity) {
        err(`task '${task_id}' not found in graph`)
        return
      }
      const task = entity as TaskEntity
      if (task.status === 'blocked') {
        warn(`task '${task_id}' is already blocked`)
      }
      break
    }

    case 'mark_unblocked': {
      const { task_id } = op
      if (!task_id) { err('task_id must be a non-empty string'); return }
      const entity = findEntityById(graph, 'task', task_id)
      if (!entity) {
        err(`task '${task_id}' not found in graph`)
        return
      }
      const task = entity as TaskEntity
      if (task.status !== 'blocked') {
        err(`task '${task_id}' is not blocked (current status: '${task.status}')`)
      }
      break
    }

    case 'append_decision': {
      const { project, title, id } = op.payload
      if (!id) { err('id must be a non-empty string'); return }
      if (!findProjectBySlug(graph, project)) {
        err(`project '${project}' not found in graph`)
        return
      }
      // Warn if a decision with the same title already exists
      const duplicate = graph.entities.find(
        e => e.kind === 'decision' && (e as DecisionEntity).title === title
      )
      if (duplicate) {
        warn(`a decision with title '${title}' already exists`)
      }
      break
    }

    case 'supersede_decision': {
      const { old_id, new_id, project } = op
      if (!old_id) { err('old_id must be a non-empty string'); return }
      if (!new_id) { err('new_id must be a non-empty string'); return }
      if (!findProjectBySlug(graph, project)) {
        err(`project '${project}' not found in graph`)
        return
      }
      const oldEntity = findEntityById(graph, 'decision', old_id)
      if (!oldEntity) {
        err(`decision '${old_id}' not found in graph`)
        return
      }
      const oldDecision = oldEntity as DecisionEntity
      if (oldDecision.status !== 'active') {
        err(`decision '${old_id}' is not active (current status: '${oldDecision.status}')`)
      }
      // Check graph first, then look for new_id in same batch's append_decision payloads
      const inGraph = findEntityById(graph, 'decision', new_id)
      const inBatch = allDeltas.some(
        d => d.op === 'append_decision' && d.payload.id === new_id,
      )
      if (!inGraph && !inBatch) {
        err(`decision '${new_id}' not found in graph`)
      }
      break
    }

    case 'create_delivery': {
      const { project, id } = op.payload
      if (!id) { err('id must be a non-empty string'); return }
      if (!findProjectBySlug(graph, project)) {
        err(`project '${project}' not found in graph`)
      }
      break
    }

    case 'update_delivery_status': {
      const { delivery_id } = op
      if (!delivery_id) { err('delivery_id must be a non-empty string'); return }
      if (!findEntityById(graph, 'delivery', delivery_id)) {
        err(`delivery '${delivery_id}' not found in graph`)
      }
      break
    }

    case 'create_note': {
      const { project, id } = op.payload
      if (!id) { err('id must be a non-empty string'); return }
      if (project != null && project !== '') {
        if (!findProjectBySlug(graph, project)) {
          err(`project '${project}' not found in graph`)
        }
      }
      break
    }

    case 'add_open_question': {
      const { project, id } = op.payload
      if (!id) { err('id must be a non-empty string'); return }
      if (!findProjectBySlug(graph, project)) {
        err(`project '${project}' not found in graph`)
      }
      break
    }

    case 'resolve_question': {
      const { question_id } = op
      if (!question_id) { err('question_id must be a non-empty string'); return }
      if (!findEntityById(graph, 'open_question', question_id)) {
        err(`open question '${question_id}' not found in graph`)
      }
      break
    }

    case 'link_note_delivery': {
      const { note_id, delivery_id } = op
      if (!note_id) { err('note_id must be a non-empty string'); return }
      if (!delivery_id) { err('delivery_id must be a non-empty string'); return }
      if (!findEntityById(graph, 'note', note_id)) {
        err(`note '${note_id}' not found in graph`)
      }
      if (!findEntityById(graph, 'delivery', delivery_id)) {
        err(`delivery '${delivery_id}' not found in graph`)
      }
      break
    }

    case 'upsert_person': {
      const { id, name } = op.payload
      if (!id) { err('id must be a non-empty string'); return }
      if (!name || name.trim() === '') {
        err('name must be a non-empty string')
      }
      break
    }

    case 'archive_project': {
      const { project_slug } = op
      if (!project_slug) { err('project_slug must be a non-empty string'); return }
      const projectEntity = graph.entities.find(
        e => e.kind === 'project' && (e as ProjectEntity).slug === project_slug
      ) as ProjectEntity | undefined
      if (!projectEntity) {
        err(`project '${project_slug}' not found in graph`)
        return
      }
      if (projectEntity.status === 'archived') {
        err(`project '${project_slug}' is already archived`)
      }
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateDeltas(deltas: DeltaOperation[], graph: WorkGraph): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  for (const op of deltas) {
    validateOp(op, graph, errors, warnings, deltas)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
