import uFuzzy from '@leeoniya/ufuzzy'
import { ulid } from 'ulid'
import type { WorkGraph } from '@/types/graph'
import type { ReconcilerOutput } from '@/types/agents'
import type { TaskEntity, DecisionEntity, DeliveryEntity, ProjectEntity } from '@/types/entities'
import type { SessionManifest, ContextPack } from '@/types/sessions'
import type { DeltaOperation } from '@/types/deltas'
import type { Confidence } from '@/types/common'
import { getClient, addTokenUsage, addCallRecord } from '@/lib/anthropic-client'

// ---------------------------------------------------------------------------
// System prompt (from spec section 9, Agent 5)
// ---------------------------------------------------------------------------

const RECONCILER_SYSTEM_PROMPT = `You are Twin Reconciler.

Turn a session manifest into proposed state deltas for a knowledge worker's work graph.

You receive:
1. A session manifest (structured writeback from a Claude session)
2. The original context pack's entity ID map
3. The current work graph state (tasks, decisions, deliveries)

Your job:
- Identify follow-up actions implied by the session but not explicitly listed
- Assess overall confidence in the manifest's accuracy
- Propose any additional deltas beyond what was mechanically resolved
- Flag items that need user clarification

Rules:
- Reference entities by their ULIDs from the graph. Never invent IDs.
- Assess confidence: high (all references clear, outcomes unambiguous), medium (some interpretation needed), low (significant uncertainty).
- Follow-up proposals should be concrete and actionable.
- Return ReconcilerOutput JSON only. No prose outside the JSON.

Output schema:
{
  "session_id": "ULID",
  "follow_up_proposals": [
    {
      "proposal": "string",
      "trigger_reason": "string",
      "proposed_delta": null | DeltaOperation,
      "entity_refs": ["ULID"]
    }
  ],
  "confidence": "high | medium | low"
}`

const SAFE_DEFAULT: ReconcilerOutput = {
  session_id: '',
  proposed_deltas: [],
  follow_up_proposals: [],
  confidence: 'low',
  unresolved: [],
}

// ---------------------------------------------------------------------------
// fuzzyMatchTask
// ---------------------------------------------------------------------------

const uf = new uFuzzy({ intraMode: 1, intraIns: 3 })

export function fuzzyMatchTask(
  title: string,
  tasks: TaskEntity[],
): { match: TaskEntity | null; confidence: Confidence } {
  // 1. Exact match
  const exact = tasks.find((t) => t.title === title)
  if (exact) return { match: exact, confidence: 'high' }

  // 2. Fuzzy match
  const haystack = tasks.map((t) => t.title)
  const [idxs, info, order] = uf.search(haystack, title)

  if (!idxs || idxs.length === 0 || !order || order.length === 0) {
    return { match: null, confidence: 'low' }
  }

  if (order.length === 1) {
    const matchIdx = info ? info.idx[order[0]] : idxs[order[0]]
    return { match: tasks[matchIdx], confidence: 'medium' }
  }

  // Multiple matches — ambiguous
  return { match: null, confidence: 'low' }
}

// ---------------------------------------------------------------------------
// buildReconcilerPrompt
// ---------------------------------------------------------------------------

export function buildReconcilerPrompt(
  manifest: SessionManifest,
  contextPack: ContextPack,
  graph: WorkGraph,
): { system: string; userMessage: string } {
  const lines: string[] = []

  // Session manifest
  lines.push('=== SESSION MANIFEST ===')
  lines.push(`Session ID: ${manifest.session_id}`)
  lines.push(`Target: ${manifest.target}`)
  lines.push(`Summary: ${manifest.summary}`)
  lines.push(`Confidence: ${manifest.confidence}`)
  lines.push('')

  if (manifest.decisions.length > 0) {
    lines.push('Decisions:')
    for (const d of manifest.decisions) {
      lines.push(`  - ${d.title}: ${d.decision}${d.rationale ? ` (${d.rationale})` : ''}`)
    }
    lines.push('')
  }

  if (manifest.tasks_updated.length > 0) {
    lines.push('Tasks updated:')
    for (const t of manifest.tasks_updated) {
      const parts = []
      if (t.id) parts.push(`id: ${t.id}`)
      if (t.title) parts.push(`title: ${t.title}`)
      if (t.status) parts.push(`status: ${t.status}`)
      lines.push(`  - ${parts.join(', ')}`)
    }
    lines.push('')
  }

  if (manifest.tasks_created.length > 0) {
    lines.push('Tasks created:')
    for (const t of manifest.tasks_created) {
      lines.push(`  - ${t.title} (priority: ${t.priority ?? 'medium'})`)
    }
    lines.push('')
  }

  if (manifest.open_questions.length > 0) {
    lines.push('Open questions:')
    for (const q of manifest.open_questions) {
      lines.push(`  - ${q.question}`)
    }
    lines.push('')
  }

  if (manifest.blockers.length > 0) {
    lines.push('Blockers:')
    for (const b of manifest.blockers) {
      lines.push(`  - ${b.title}: blocked by ${b.blocked_by}`)
    }
    lines.push('')
  }

  // Entity ID map from original context pack
  lines.push('=== ENTITY ID MAP (from dispatched brief) ===')
  for (const [id, label] of Object.entries(contextPack.entity_id_map)) {
    lines.push(`  ${id} → ${label}`)
  }
  lines.push('')

  // Current graph state
  lines.push('=== CURRENT WORK GRAPH ===')
  lines.push('')

  const tasks = graph.entities.filter((e): e is TaskEntity => e.kind === 'task')
  const decisions = graph.entities.filter(
    (e): e is DecisionEntity => e.kind === 'decision' && e.status === 'active',
  )
  const deliveries = graph.entities.filter((e): e is DeliveryEntity => e.kind === 'delivery')

  lines.push('Tasks:')
  for (const t of tasks) {
    let line = `  - [${t.id}] ${t.title} | status: ${t.status} | priority: ${t.priority}`
    if (t.blocked_by) line += ` | blocked_by: ${t.blocked_by}`
    if (t.waiting_on) line += ` | waiting_on: ${t.waiting_on}`
    lines.push(line)
  }
  lines.push('')

  lines.push('Active decisions:')
  for (const d of decisions) {
    lines.push(`  - [${d.id}] ${d.title}: ${d.decision}`)
  }
  lines.push('')

  lines.push('Deliveries:')
  for (const d of deliveries) {
    lines.push(`  - [${d.id}] ${d.title} | status: ${d.status}`)
  }

  return {
    system: RECONCILER_SYSTEM_PROMPT,
    userMessage: lines.join('\n'),
  }
}

// ---------------------------------------------------------------------------
// parseReconcilerResponse
// ---------------------------------------------------------------------------

export function parseReconcilerResponse(text: string): ReconcilerOutput {
  let jsonStr = text.trim()

  // Extract from markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    return {
      session_id: parsed.session_id ?? '',
      proposed_deltas: Array.isArray(parsed.proposed_deltas) ? parsed.proposed_deltas : [],
      follow_up_proposals: Array.isArray(parsed.follow_up_proposals)
        ? parsed.follow_up_proposals
        : [],
      confidence: parsed.confidence ?? 'low',
      unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
    }
  } catch {
    return { ...SAFE_DEFAULT }
  }
}

// ---------------------------------------------------------------------------
// resolveManifestReferences
// ---------------------------------------------------------------------------

export function resolveManifestReferences(
  manifest: SessionManifest,
  graph: WorkGraph,
): {
  resolvedDeltas: DeltaOperation[]
  unresolved: Array<{ item: string; reason: string; needs_user_input: boolean }>
} {
  const resolvedDeltas: DeltaOperation[] = []
  const unresolved: Array<{ item: string; reason: string; needs_user_input: boolean }> = []

  const tasks = graph.entities.filter((e): e is TaskEntity => e.kind === 'task')

  // Determine the project slug from the first task, or from the graph
  const projectSlug =
    tasks[0]?.project ??
    graph.entities.find((e): e is ProjectEntity => e.kind === 'project')?.slug ??
    'unknown'

  // --- tasks_updated ---
  for (const entry of manifest.tasks_updated) {
    if (entry.id) {
      // Validate the ID exists
      const existing = tasks.find((t) => t.id === entry.id)
      if (existing && entry.status) {
        resolvedDeltas.push({
          op: 'update_task_status',
          task_id: entry.id,
          project: existing.project,
          status: entry.status,
        })
      } else if (!existing) {
        unresolved.push({
          item: `Task update: ${entry.id}`,
          reason: `Task ID ${entry.id} not found in graph`,
          needs_user_input: true,
        })
      }
    } else if (entry.title) {
      // Fuzzy match by title
      const match = fuzzyMatchTask(entry.title, tasks)
      if (match.match && entry.status) {
        resolvedDeltas.push({
          op: 'update_task_status',
          task_id: match.match.id,
          project: match.match.project,
          status: entry.status,
        })
      } else {
        unresolved.push({
          item: `Task update: "${entry.title}"`,
          reason: match.match
            ? 'No status provided'
            : `No matching task found for "${entry.title}"`,
          needs_user_input: true,
        })
      }
    }
  }

  // --- tasks_created ---
  for (const entry of manifest.tasks_created) {
    const newId = ulid()
    resolvedDeltas.push({
      op: 'create_task',
      payload: {
        id: newId,
        title: entry.title,
        status: 'todo',
        priority: entry.priority ?? 'medium',
        due_date: entry.due_date,
        waiting_on: entry.waiting_on,
        project: projectSlug,
      },
    })
  }

  // --- decisions ---
  for (const entry of manifest.decisions) {
    const newId = ulid()
    resolvedDeltas.push({
      op: 'append_decision',
      payload: {
        id: newId,
        title: entry.title,
        decision: entry.decision,
        rationale: entry.rationale,
        unblocks: entry.unblocks ? [entry.unblocks] : [],
        date: new Date().toISOString().slice(0, 10),
        project: projectSlug,
        status: 'active',
      },
    })
  }

  return { resolvedDeltas, unresolved }
}

// ---------------------------------------------------------------------------
// runReconciler (async — calls LLM)
// ---------------------------------------------------------------------------

export async function runReconciler(
  manifest: SessionManifest,
  contextPack: ContextPack,
  graph: WorkGraph,
): Promise<ReconcilerOutput> {
  // 1. Mechanical resolution (no LLM)
  const { resolvedDeltas, unresolved } = resolveManifestReferences(manifest, graph)

  // 2. Build prompt for LLM follow-up analysis
  const prompt = buildReconcilerPrompt(manifest, contextPack, graph)
  const start = Date.now()

  try {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.userMessage }],
    })

    const duration = Date.now() - start
    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const llmResult = parseReconcilerResponse(textContent)

    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens:
        (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
      cache_creation_tokens:
        (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
    }

    addTokenUsage(usage, 'claude-haiku-4-5-20251001')
    addCallRecord({
      agent: 'reconciler',
      model: 'claude-haiku-4-5-20251001',
      timestamp: start,
      usage,
      duration_ms: duration,
      success: true,
    })

    // Combine mechanical deltas + LLM proposals
    return {
      session_id: manifest.session_id,
      proposed_deltas: [...resolvedDeltas, ...llmResult.proposed_deltas],
      follow_up_proposals: llmResult.follow_up_proposals,
      confidence: llmResult.confidence,
      unresolved: [...unresolved, ...llmResult.unresolved],
    }
  } catch (error) {
    const duration = Date.now() - start
    console.error('Reconciler API error:', error)

    addCallRecord({
      agent: 'reconciler',
      model: 'claude-haiku-4-5-20251001',
      timestamp: start,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 },
      duration_ms: duration,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })

    // Return mechanical results even if LLM fails (graceful degradation)
    return {
      session_id: manifest.session_id,
      proposed_deltas: resolvedDeltas,
      follow_up_proposals: [],
      confidence: 'low',
      unresolved,
    }
  }
}
