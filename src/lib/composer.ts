/**
 * composer.ts — Assembles context packs for Chat, Code, and Cowork dispatch
 *
 * Template-driven brief generation (no LLM call).
 * Three brief formats matching spec sections 10.1–10.3.
 */

import { ulid } from 'ulid'
import type { DispatchTarget } from '@/types/common'
import type { ContextPack, WritebackContract } from '@/types/sessions'
import type { EntityRef, WorkGraphEntity, TaskEntity, DeliveryEntity, DecisionEntity, NoteEntity, OpenQuestionEntity } from '@/types/entities'
import type { WorkGraph } from '@/types/graph'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuildContextPackParams = {
  target: DispatchTarget
  objective: string
  selectedSources: EntityRef[]
  graph: WorkGraph
  globalContext: string
  projectSlug: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function priorityRank(p: string | undefined): number {
  return PRIORITY_ORDER[p ?? ''] ?? 99
}

/**
 * Filter graph entities that belong to a specific project.
 */
export function getProjectEntities(graph: WorkGraph, projectSlug: string): WorkGraphEntity[] {
  return graph.entities.filter((e) => {
    if (e.kind === 'project') return e.slug === projectSlug
    if ('project' in e) return (e as { project?: string }).project === projectSlug
    return false
  })
}

/**
 * Format a list of entities as a markdown bullet list with IDs.
 */
export function formatEntityList(
  entities: WorkGraphEntity[],
  kind: WorkGraphEntity['kind'],
): string {
  if (entities.length === 0) return 'None'

  return entities
    .map((e) => {
      switch (kind) {
        case 'task': {
          const t = e as TaskEntity
          return `- **[${t.id}]** ${t.title} — _${t.status}_ (${t.priority ?? 'no priority'})`
        }
        case 'delivery': {
          const d = e as DeliveryEntity
          return `- **[${d.id}]** ${d.title} — _${d.status}_ (${d.type})`
        }
        case 'decision': {
          const d = e as DecisionEntity
          return `- **[${d.id}]** ${d.title}: ${d.decision}`
        }
        case 'note': {
          const n = e as NoteEntity
          return `- **[${n.id}]** ${n.title}`
        }
        case 'open_question': {
          const q = e as OpenQuestionEntity
          return `- **[${q.id}]** ${q.question}`
        }
        default: {
          const id = 'id' in e ? (e as { id: string }).id : ''
          const name = 'name' in e ? (e as { name: string }).name : 'title' in e ? (e as { title: string }).title : ''
          return `- **[${id}]** ${name}`
        }
      }
    })
    .join('\n')
}

/**
 * Build the writeback instructions section appended to every brief.
 */
export function buildWritebackSection(
  sessionId: string,
  entityIdMap: Record<string, string>,
): string {
  const mappingLines = Object.entries(entityIdMap)
    .map(([id, title]) => `- ${id}: ${title}`)
    .join('\n')

  return `---
## Session writeback instructions

Session ID: ${sessionId}
Write your session manifest to: ~/twin/sessions/${sessionId}-manifest.yaml
Schema: ~/twin/sessions/writeback-schema.yaml

When referencing existing tasks in your manifest, use these IDs:
${mappingLines}`
}

// ---------------------------------------------------------------------------
// Entity ID map builder
// ---------------------------------------------------------------------------

function buildEntityIdMap(entities: WorkGraphEntity[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const e of entities) {
    // Exclude superseded decisions — only active decisions belong in the map
    if (e.kind === 'decision' && (e as DecisionEntity).status === 'superseded') continue

    if ('id' in e && typeof (e as { id: unknown }).id === 'string') {
      const id = (e as { id: string }).id
      const label =
        'title' in e ? (e as { title: string }).title :
        'name' in e ? (e as { name: string }).name :
        'question' in e ? (e as { question: string }).question :
        id
      map[id] = label
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Brief builders
// ---------------------------------------------------------------------------

function extractFirstSentences(text: string, count: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? []
  return sentences.slice(0, count).join(' ').trim() || text.slice(0, 200)
}

function buildChatBrief(params: {
  sessionId: string
  objective: string
  globalContext: string
  projectSlug: string
  entities: WorkGraphEntity[]
  entityIdMap: Record<string, string>
}): string {
  const { sessionId, objective, globalContext, projectSlug, entities, entityIdMap } = params

  const notes = entities.filter((e): e is NoteEntity => e.kind === 'note' && e.twin_synced)
  const decisions = entities.filter(
    (e): e is DecisionEntity => e.kind === 'decision' && e.status === 'active',
  )
  const openQuestions = entities.filter(
    (e): e is OpenQuestionEntity => e.kind === 'open_question' && e.status === 'open',
  )

  const notesSummary =
    notes.length > 0
      ? notes.map((n) => `- **${n.title}** [${n.id}]`).join('\n')
      : 'No synced notes available'

  const decisionsSection =
    decisions.length > 0
      ? formatEntityList(decisions.slice(-5), 'decision')
      : 'None'

  const questionsSection =
    openQuestions.length > 0
      ? formatEntityList(openQuestions, 'open_question')
      : 'No open questions'

  const whoIAm = extractFirstSentences(globalContext, 2)

  const writebackSection = buildWritebackSection(sessionId, entityIdMap)

  return `## Context for this thinking session
_Session: ${sessionId} · Scope: project — ${projectSlug}_

**Who I am:** ${whoIAm}
**Objective:** ${objective}

## What I already know
${notesSummary}

## Decisions already made
${decisionsSection}

## What I'm uncertain about
${questionsSection}

## Key constraints
_See context.md for full constraints._

${writebackSection}`
}

function buildCodeBrief(params: {
  sessionId: string
  objective: string
  globalContext: string
  projectSlug: string
  entities: WorkGraphEntity[]
  entityIdMap: Record<string, string>
}): string {
  const { sessionId, globalContext, projectSlug, entities, entityIdMap } = params

  const tasks = entities
    .filter((e): e is TaskEntity => e.kind === 'task')
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))

  const activeTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'todo')
  const blockedTasks = tasks.filter((t) => t.blocked_by || t.waiting_on || t.status === 'blocked')
  const decisions = entities.filter(
    (e): e is DecisionEntity => e.kind === 'decision' && e.status === 'active',
  )
  const openQuestions = entities.filter(
    (e): e is OpenQuestionEntity => e.kind === 'open_question' && e.status === 'open',
  )
  const deliveries = entities.filter(
    (e): e is DeliveryEntity =>
      e.kind === 'delivery' && e.status !== 'delivered' && e.status !== 'archived',
  )

  const highestPriority = activeTasks[0]
  const pickUpHere = highestPriority
    ? `${highestPriority.title} [${highestPriority.id}]`
    : 'No actionable items'

  const openQuestionsSection =
    openQuestions.length > 0
      ? formatEntityList(openQuestions, 'open_question')
      : 'None'

  const writebackSection = buildWritebackSection(sessionId, entityIdMap)

  return `## Role & expertise
${globalContext}

## Project context
_Project: ${projectSlug} — see context.md for full background._

## Current focus
${formatEntityList(activeTasks, 'task')}

## Architecture decisions already made
${formatEntityList(decisions, 'decision')}

## Open technical questions
${openQuestionsSection}

## Blocked items
${formatEntityList(blockedTasks, 'task')}

## Deliveries in progress
${formatEntityList(deliveries, 'delivery')}

## Pick up here
${pickUpHere}

---
_Full context available in this folder:_
_tasks.yaml · deliveries.yaml · decisions.yaml · notes/_

${writebackSection}`
}

function buildCoworkBrief(params: {
  sessionId: string
  objective: string
  globalContext: string
  projectSlug: string
  entities: WorkGraphEntity[]
  entityIdMap: Record<string, string>
}): string {
  const { sessionId, objective, globalContext, projectSlug, entities, entityIdMap } = params

  const deliveries = entities.filter(
    (e): e is DeliveryEntity =>
      e.kind === 'delivery' && e.status !== 'delivered' && e.status !== 'archived',
  )
  const decisions = entities.filter(
    (e): e is DecisionEntity => e.kind === 'decision' && e.status === 'active',
  )
  const notes = entities.filter((e): e is NoteEntity => e.kind === 'note' && e.twin_synced)

  // Pick the first active delivery (or use objective as fallback)
  const delivery = deliveries[0]

  const deliveryTitle = delivery ? delivery.title : objective
  const deliveryType = delivery ? delivery.type : 'other'
  const deliveryBrief = delivery?.brief ?? 'See objective above'
  const deliveryDue = delivery?.due_date ?? 'No due date set'

  const notePaths =
    notes.length > 0
      ? notes.map((n) => `- projects/${projectSlug}/notes/${n.filename}`).join('\n')
      : 'No source notes available'

  const writebackSection = buildWritebackSection(sessionId, entityIdMap)

  return `## Delivery brief

**What to produce:** ${deliveryTitle} — ${deliveryType}
**What done looks like:** ${deliveryBrief}
**Due:** ${deliveryDue}

## Audience & tone
_See context.md for audience and tone guidance._

## Source materials
${notePaths}

## Decisions already made
${formatEntityList(decisions, 'decision')}

## Format requirements
${deliveryBrief}

## Who I am
${globalContext}

---
_All source files are in this folder. Read them before starting._

${writebackSection}`
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildContextPack(params: BuildContextPackParams): ContextPack {
  const { target, objective, selectedSources, graph, globalContext, projectSlug } = params

  // 1. Generate session ULID
  const sessionId = ulid()

  // 2. Get project entities and build entity ID map
  const projectEntities = getProjectEntities(graph, projectSlug)
  const entityIdMap = buildEntityIdMap(projectEntities)

  // 3. Assemble brief based on target
  const briefParams = {
    sessionId,
    objective,
    globalContext,
    projectSlug,
    entities: projectEntities,
    entityIdMap,
  }

  let briefMarkdown: string
  switch (target) {
    case 'chat':
      briefMarkdown = buildChatBrief(briefParams)
      break
    case 'code':
      briefMarkdown = buildCodeBrief(briefParams)
      break
    case 'cowork':
      briefMarkdown = buildCoworkBrief(briefParams)
      break
  }

  // 4. Build writeback contract
  const writebackContract: WritebackContract = {
    session_id: sessionId,
    expected_outputs: deriveExpectedOutputs(target, objective),
    writeback_file: `~/twin/sessions/${sessionId}-manifest.yaml`,
    schema_version: '1.0',
  }

  return {
    session_id: sessionId,
    target,
    objective,
    brief_markdown: briefMarkdown,
    selected_sources: selectedSources,
    entity_id_map: entityIdMap,
    writeback_contract: writebackContract,
    created_at: new Date().toISOString(),
  }
}

function deriveExpectedOutputs(target: DispatchTarget, _objective: string): string[] {
  switch (target) {
    case 'chat':
      return ['summary', 'decisions', 'open_questions']
    case 'code':
      return ['tasks_updated', 'tasks_created', 'decisions']
    case 'cowork':
      return ['artifacts', 'summary']
  }
}

// ---------------------------------------------------------------------------
// Async I/O — saves context pack to disk
// ---------------------------------------------------------------------------

export async function saveContextPack(pack: ContextPack): Promise<void> {
  const { writeSessionPack } = await import('./fs')
  await writeSessionPack(pack.session_id, pack.brief_markdown)
}
