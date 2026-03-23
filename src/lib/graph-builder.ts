/**
 * graph-builder.ts — Derives the work graph from a flat list of entities
 *
 * The work graph is always derived in-memory from canonical files.
 * It is never persisted separately.
 */

import type {
  WorkGraphEntity,
  ProjectEntity,
  TaskEntity,
  DeliveryEntity,
  DecisionEntity,
  NoteEntity,
  PersonEntity,
  OpenQuestionEntity,
} from '@/types/entities'
import type { Relationship, WorkGraph } from '@/types/graph'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function findEntity<K extends WorkGraphEntity['kind']>(
  entities: WorkGraphEntity[],
  kind: K,
  predicate: (e: Extract<WorkGraphEntity, { kind: K }>) => boolean,
): Extract<WorkGraphEntity, { kind: K }> | undefined {
  return entities.find(
    (e): e is Extract<WorkGraphEntity, { kind: K }> => e.kind === kind && predicate(e as Extract<WorkGraphEntity, { kind: K }>),
  )
}

// ---------------------------------------------------------------------------
// Relationship derivation
// ---------------------------------------------------------------------------

export function deriveRelationships(entities: WorkGraphEntity[]): Relationship[] {
  const rels: Relationship[] = []

  for (const entity of entities) {
    switch (entity.kind) {
      case 'task': {
        const task = entity as TaskEntity

        // belongs_to: task → project
        if (task.project) {
          const project = findEntity(entities, 'project', (p) => p.slug === task.project)
          if (project) {
            rels.push({
              from: { kind: 'task', id: task.id },
              to: { kind: 'project', id: project.slug },
              type: 'belongs_to',
            })
          }
        }

        // delivers: task → delivery
        if (task.delivery) {
          const delivery = findEntity(entities, 'delivery', (d) => d.id === task.delivery)
          if (delivery) {
            rels.push({
              from: { kind: 'task', id: task.id },
              to: { kind: 'delivery', id: delivery.id },
              type: 'delivers',
            })
          }
        }

        // involves: task (via waiting_on) → person
        if (task.waiting_on) {
          const person = findEntity(entities, 'person', (p) => p.name === task.waiting_on)
          if (person) {
            rels.push({
              from: { kind: 'task', id: task.id },
              to: { kind: 'person', id: person.id },
              type: 'involves',
            })
          }
        }

        // blocks: task-to-task from free-text blocked_by field
        // Deferred — blocked_by is free-text (e.g. "Infra cost estimate"), not a ULID reference.
        // Reliable derivation would require fuzzy matching against task titles.
        break
      }

      case 'delivery': {
        const delivery = entity as DeliveryEntity

        // belongs_to: delivery → project
        if (delivery.project) {
          const project = findEntity(entities, 'project', (p) => p.slug === delivery.project)
          if (project) {
            rels.push({
              from: { kind: 'delivery', id: delivery.id },
              to: { kind: 'project', id: project.slug },
              type: 'belongs_to',
            })
          }
        }
        break
      }

      case 'decision': {
        const decision = entity as DecisionEntity

        // belongs_to: decision → project
        if (decision.project) {
          const project = findEntity(entities, 'project', (p) => p.slug === decision.project)
          if (project) {
            rels.push({
              from: { kind: 'decision', id: decision.id },
              to: { kind: 'project', id: project.slug },
              type: 'belongs_to',
            })
          }
        }

        // unblocks: decision → task (for each ULID in unblocks array)
        if (decision.unblocks) {
          for (const taskId of decision.unblocks) {
            const task = findEntity(entities, 'task', (t) => t.id === taskId)
            if (task) {
              rels.push({
                from: { kind: 'decision', id: decision.id },
                to: { kind: 'task', id: task.id },
                type: 'unblocks',
              })
            }
          }
        }

        // supersedes: the NEW decision supersedes the OLD one
        // superseded_by is on the OLD decision, pointing to the NEW one's ID
        if (decision.superseded_by) {
          const newDecision = findEntity(entities, 'decision', (d) => d.id === decision.superseded_by)
          if (newDecision) {
            rels.push({
              from: { kind: 'decision', id: newDecision.id },
              to: { kind: 'decision', id: decision.id },
              type: 'supersedes',
            })
          }
        }

        // involves: decision (via decided_by) → person
        // decided_by may be compound like "August + client IT team" — check if person name is contained
        if (decision.decided_by) {
          const decidedBy = decision.decided_by
          for (const e of entities) {
            if (e.kind === 'person') {
              const person = e as PersonEntity
              if (decidedBy.includes(person.name)) {
                rels.push({
                  from: { kind: 'decision', id: decision.id },
                  to: { kind: 'person', id: person.id },
                  type: 'involves',
                })
              }
            }
          }
        }
        break
      }

      case 'note': {
        const note = entity as NoteEntity

        // belongs_to: note → project
        if (note.project) {
          const project = findEntity(entities, 'project', (p) => p.slug === note.project)
          if (project) {
            rels.push({
              from: { kind: 'note', id: note.id },
              to: { kind: 'project', id: project.slug },
              type: 'belongs_to',
            })
          }
        }

        // informs: note → delivery via linked_delivery
        // Deferred — NoteEntity does not carry linked_delivery (only the full Note type does).
        // To derive this, we'd need to extend NoteEntity or pass full Note data.
        break
      }

      case 'open_question': {
        const question = entity as OpenQuestionEntity

        // belongs_to: open_question → project
        if (question.project) {
          const project = findEntity(entities, 'project', (p) => p.slug === question.project)
          if (project) {
            rels.push({
              from: { kind: 'open_question', id: question.id },
              to: { kind: 'project', id: project.slug },
              type: 'belongs_to',
            })
          }
        }

        // raises: note → open_question (from source_note)
        if (question.source_note) {
          const note = findEntity(entities, 'note', (n) => n.id === question.source_note)
          if (note) {
            rels.push({
              from: { kind: 'note', id: note.id },
              to: { kind: 'open_question', id: question.id },
              type: 'raises',
            })
          }
        }
        break
      }

      case 'session': {
        // produces: session → artifact
        // Deferred to Phase 3 — no session artifacts in Phase 1
        break
      }

      case 'project':
      case 'person':
        // No outgoing relationships derived from these entity types
        break
    }
  }

  return rels
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

export function buildGraphFromEntities(entities: WorkGraphEntity[]): WorkGraph {
  // 1. Identify archived project slugs
  const archivedSlugs = new Set(
    entities
      .filter((e): e is ProjectEntity => e.kind === 'project' && e.status === 'archived')
      .map((p) => p.slug),
  )

  // 2. Filter out archived projects and entities belonging to them
  const filteredEntities = entities.filter((e) => {
    if (e.kind === 'project') {
      return (e as ProjectEntity).status !== 'archived'
    }
    // Entities with a project field — exclude if project is archived
    const projectField = (e as Record<string, unknown>).project
    if (typeof projectField === 'string' && archivedSlugs.has(projectField)) {
      return false
    }
    return true
  })

  // 3. Derive relationships
  const relationships = deriveRelationships(filteredEntities)

  return {
    entities: filteredEntities,
    relationships,
    built_at: Date.now(),
    file_mtimes: {},
  }
}
