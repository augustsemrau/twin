import type { WorkGraph } from '@/types/graph'
import type { PrioritiserOutput } from '@/types/agents'
import type {
  ProjectEntity,
  TaskEntity,
  PersonEntity,
  DecisionEntity,
  DeliveryEntity,
  NoteEntity,
} from '@/types/entities'
import { getClient, addTokenUsage, addCallRecord } from '@/lib/anthropic-client'

const PRIORITISER_SYSTEM_PROMPT = `You are Twin Prioritiser.

Given the user's full work state across all active projects, generate a daily focus brief and proactive proposals.

Rules:
- Be direct and specific. No filler.
- Prioritise ruthlessly — the user can only do 3–5 things today.
- Every proactive_proposal must cite a trigger_reason explaining why it surfaced.
- Reference entities by their IDs.
- Never invent tasks or decisions not in the current graph.
- Return PrioritiserOutput JSON only. No prose.

PrioritiserOutput schema:
{
  "brief": "string — 2-4 sentence prose summary of today's priorities",
  "priority_items": [
    {
      "title": "string",
      "project": "string (slug)",
      "reasoning": "string — why this is a priority today",
      "next_action": "string — concrete next step",
      "entity_refs": ["ULID[]"]
    }
  ],
  "proactive_proposals": [
    {
      "proposal": "string — what to do",
      "trigger_reason": "string — why this surfaced now",
      "proposed_delta": "DeltaOperation | null",
      "entity_refs": ["ULID[]"]
    }
  ]
}`

const SAFE_DEFAULT: PrioritiserOutput = {
  brief: 'Could not generate priority brief',
  priority_items: [],
  proactive_proposals: [],
}

/**
 * Detect proactive conditions from the graph before the API call.
 * Returns human-readable condition strings to inject into the prompt.
 */
function detectProactiveConditions(
  graph: WorkGraph,
  currentDate: string,
): string[] {
  const now = new Date(currentDate)
  const conditions: string[] = []

  const tasks = graph.entities.filter(
    (e): e is TaskEntity => e.kind === 'task',
  )
  const deliveries = graph.entities.filter(
    (e): e is DeliveryEntity => e.kind === 'delivery',
  )
  const decisions = graph.entities.filter(
    (e): e is DecisionEntity => e.kind === 'decision',
  )
  const people = graph.entities.filter(
    (e): e is PersonEntity => e.kind === 'person',
  )

  // Tasks with waiting_on where the task was created/updated > 2 days ago
  for (const task of tasks) {
    if (!task.waiting_on) continue
    // Use due_date as a proxy for last activity; if no due_date, flag it anyway
    const refDate = task.due_date ? new Date(task.due_date) : null
    const daysSince = refDate
      ? Math.floor((now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24))
      : 3 // assume stale if no date
    if (daysSince >= 2) {
      const person = people.find((p) => p.id === task.waiting_on)
      const personLabel = person ? person.name : task.waiting_on
      conditions.push(
        `Task "${task.title}" [${task.id}] has been waiting on ${personLabel} [${task.waiting_on}] for ~${daysSince} days`,
      )
    }
  }

  // Deliveries due within 2 days that are still draft
  for (const del of deliveries) {
    if (del.status !== 'draft' || !del.due_date) continue
    const dueDate = new Date(del.due_date)
    const daysUntilDue = Math.floor(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysUntilDue <= 2) {
      conditions.push(
        `Delivery "${del.title}" [${del.id}] is due in ${daysUntilDue} day(s) and still in draft status`,
      )
    }
  }

  // Decisions with status 'active' that are > 30 days old
  for (const dec of decisions) {
    if (dec.status !== 'active' || !dec.date) continue
    const decDate = new Date(dec.date)
    const daysSince = Math.floor(
      (now.getTime() - decDate.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSince > 30) {
      conditions.push(
        `Decision "${dec.title}" [${dec.id}] has been active for ${daysSince} days — may need review`,
      )
    }
  }

  return conditions
}

export function buildPrioritiserPrompt(
  graph: WorkGraph,
  currentDate: string,
): { system: string; userMessage: string } {
  const projects = graph.entities.filter(
    (e): e is ProjectEntity => e.kind === 'project' && e.status === 'active',
  )
  const tasks = graph.entities.filter(
    (e): e is TaskEntity => e.kind === 'task',
  )
  const deliveries = graph.entities.filter(
    (e): e is DeliveryEntity => e.kind === 'delivery',
  )
  const people = graph.entities.filter(
    (e): e is PersonEntity => e.kind === 'person',
  )

  // Recent decisions: last 7 days
  const sevenDaysAgo = new Date(currentDate)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentDecisions = graph.entities.filter(
    (e): e is DecisionEntity =>
      e.kind === 'decision' && new Date(e.date) >= sevenDaysAgo,
  )

  // Twin-synced notes
  const notes = graph.entities.filter(
    (e): e is NoteEntity => e.kind === 'note' && e.twin_synced,
  )

  // Format weekday
  const dateObj = new Date(currentDate)
  const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' })

  const lines: string[] = []

  lines.push(`=== CURRENT DATE ===`)
  lines.push(`${weekday}, ${currentDate}`)
  lines.push('')

  lines.push('=== ACTIVE PROJECTS ===')
  for (const p of projects) {
    lines.push(`  - ${p.slug} (${p.name})`)
  }
  lines.push('')

  lines.push('=== TASKS (all active projects) ===')
  for (const t of tasks) {
    let line = `  - [${t.id}] ${t.title} | status: ${t.status} | priority: ${t.priority}`
    if (t.due_date) line += ` | due: ${t.due_date}`
    if (t.blocked_by) line += ` | blocked_by: ${t.blocked_by}`
    if (t.waiting_on) line += ` | waiting_on: ${t.waiting_on}`
    line += ` | project: ${t.project}`
    lines.push(line)
  }
  lines.push('')

  lines.push('=== DELIVERIES (all active projects) ===')
  for (const d of deliveries) {
    let line = `  - [${d.id}] ${d.title} | type: ${d.type} | status: ${d.status}`
    if (d.due_date) line += ` | due: ${d.due_date}`
    line += ` | project: ${d.project}`
    lines.push(line)
  }
  lines.push('')

  lines.push('=== RECENT DECISIONS (last 7 days) ===')
  for (const d of recentDecisions) {
    lines.push(
      `  - [${d.id}] ${d.title} | status: ${d.status} | date: ${d.date} | project: ${d.project}`,
    )
  }
  lines.push('')

  lines.push('=== PEOPLE ===')
  for (const p of people) {
    lines.push(`  - [${p.id}] ${p.name}${p.role ? ` — ${p.role}` : ''}`)
  }
  lines.push('')

  lines.push('=== TWIN-SYNCED NOTES ===')
  for (const n of notes) {
    lines.push(
      `  - [${n.id}] ${n.title} | type: ${n.type}${n.project ? ` | project: ${n.project}` : ''}`,
    )
  }
  lines.push('')

  // Proactive conditions detected before the API call
  const conditions = detectProactiveConditions(graph, currentDate)
  if (conditions.length > 0) {
    lines.push('=== PROACTIVE CONDITIONS DETECTED ===')
    for (const c of conditions) {
      lines.push(`  ! ${c}`)
    }
    lines.push('')
  }

  return {
    system: PRIORITISER_SYSTEM_PROMPT,
    userMessage: lines.join('\n'),
  }
}

export function parsePrioritiserResponse(text: string): PrioritiserOutput {
  let jsonStr = text.trim()

  // Extract from markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    return {
      brief: typeof parsed.brief === 'string' ? parsed.brief : SAFE_DEFAULT.brief,
      priority_items: Array.isArray(parsed.priority_items)
        ? parsed.priority_items
        : [],
      proactive_proposals: Array.isArray(parsed.proactive_proposals)
        ? parsed.proactive_proposals
        : [],
    }
  } catch {
    return { ...SAFE_DEFAULT }
  }
}

export async function runPrioritiser(
  graph: WorkGraph,
  currentDate?: string,
): Promise<PrioritiserOutput> {
  const date =
    currentDate ?? new Date().toISOString().slice(0, 10)
  const prompt = buildPrioritiserPrompt(graph, date)
  const start = Date.now()

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2048,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.userMessage }],
    })

    const duration = Date.now() - start
    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const result = parsePrioritiserResponse(textContent)

    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens:
        (response.usage as unknown as Record<string, number>)
          .cache_read_input_tokens ?? 0,
      cache_creation_tokens:
        (response.usage as unknown as Record<string, number>)
          .cache_creation_input_tokens ?? 0,
    }

    addTokenUsage(usage, 'claude-sonnet-4-5-20250514')
    addCallRecord({
      agent: 'prioritiser',
      model: 'claude-sonnet-4-5-20250514',
      timestamp: start,
      usage,
      duration_ms: duration,
      success: true,
    })

    return result
  } catch (error) {
    const duration = Date.now() - start
    console.error('Prioritiser API error:', error)

    addCallRecord({
      agent: 'prioritiser',
      model: 'claude-sonnet-4-5-20250514',
      timestamp: start,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      },
      duration_ms: duration,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })

    return { ...SAFE_DEFAULT }
  }
}
