import type { WorkGraph } from '@/types/graph'
import type { PlannerOutput } from '@/types/agents'
import type { ProjectEntity, TaskEntity, PersonEntity, DecisionEntity, OpenQuestionEntity, SessionEntity } from '@/types/entities'
import { getClient, addTokenUsage, addCallRecord } from '@/lib/anthropic-client'

const PLANNER_SYSTEM_PROMPT = `You are Twin Planner.

Given a user objective and their current work state, decide the best next action.
You may recommend dispatching to Chat, Code, or Cowork. You may propose state
deltas. You may ask one clarifying question. You may propose no action.

Rules:
- Recommend the minimum action that moves the objective forward.
- Do not dispatch if the state is unclear — ask one question instead.
- Reference entities by their IDs when proposing deltas.
- Never invent tasks or decisions not in the current graph.
- Return PlannerOutput JSON only. No prose.`

const SAFE_DEFAULT: PlannerOutput = {
  recommended_action: { type: 'no_action', reason: 'Could not parse response' },
  confidence: 'low',
  alternatives: [],
}

export function buildPlannerPrompt(
  objective: string,
  graph: WorkGraph,
  projectSlug?: string,
): { system: string; userMessage: string } {
  const projects = graph.entities.filter(
    (e): e is ProjectEntity => e.kind === 'project' && e.status === 'active',
  )
  const tasks = graph.entities.filter(
    (e): e is TaskEntity =>
      e.kind === 'task' &&
      (!projectSlug || e.project === projectSlug),
  )
  const people = graph.entities.filter(
    (e): e is PersonEntity => e.kind === 'person',
  )
  const decisions = graph.entities
    .filter(
      (e): e is DecisionEntity =>
        e.kind === 'decision' &&
        e.status === 'active' &&
        (!projectSlug || e.project === projectSlug),
    )
    .slice(-5)
  const openQuestions = graph.entities.filter(
    (e): e is OpenQuestionEntity =>
      e.kind === 'open_question' &&
      e.status === 'open' &&
      (!projectSlug || e.project === projectSlug),
  )
  const sessions = graph.entities
    .filter((e): e is SessionEntity => e.kind === 'session')
    .slice(-5)

  const lines: string[] = []

  lines.push('=== OBJECTIVE ===')
  lines.push(objective)
  lines.push('')

  lines.push('=== WORK GRAPH CONTEXT ===')
  lines.push('')

  if (projectSlug) {
    lines.push(`Active project: ${projectSlug}`)
    lines.push('')
  }

  lines.push('Projects:')
  for (const p of projects) {
    lines.push(`  - ${p.slug} (${p.name})`)
  }
  lines.push('')

  lines.push('Tasks:')
  for (const t of tasks) {
    let line = `  - [${t.id}] ${t.title} | status: ${t.status} | priority: ${t.priority}`
    if (t.blocked_by) line += ` | blocked_by: ${t.blocked_by}`
    if (t.waiting_on) line += ` | waiting_on: ${t.waiting_on}`
    lines.push(line)
  }
  lines.push('')

  lines.push('People:')
  for (const p of people) {
    lines.push(`  - [${p.id}] ${p.name}${p.role ? ` — ${p.role}` : ''}`)
  }
  lines.push('')

  lines.push('Active decisions (last 5):')
  for (const d of decisions) {
    lines.push(`  - [${d.id}] ${d.title}: ${d.decision}`)
  }
  lines.push('')

  lines.push('Open questions:')
  for (const q of openQuestions) {
    lines.push(`  - [${q.id}] ${q.question}`)
  }
  lines.push('')

  if (sessions.length > 0) {
    lines.push('Recent sessions (last 5):')
    for (const s of sessions) {
      lines.push(`  - [${s.id}] target: ${s.target} | objective: ${s.objective} | status: ${s.status}`)
    }
    lines.push('')
  }

  lines.push('=== AVAILABLE ENTITY REFS ===')
  for (const e of graph.entities) {
    if ('id' in e) {
      const label = 'title' in e ? (e as { title: string }).title
        : 'name' in e ? (e as { name: string }).name
        : 'question' in e ? (e as { question: string }).question
        : e.kind
      lines.push(`  - [${e.id}] ${e.kind}: ${label} (file: ${e.ref.file}${e.ref.line ? `, line: ${e.ref.line}` : ''})`)
    }
  }

  return {
    system: PLANNER_SYSTEM_PROMPT,
    userMessage: lines.join('\n'),
  }
}

export function parsePlannerResponse(text: string): PlannerOutput {
  let jsonStr = text.trim()

  // Extract from markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    // Validate recommended_action has a type
    if (!parsed.recommended_action || !parsed.recommended_action.type) {
      return { ...SAFE_DEFAULT }
    }

    return {
      recommended_action: parsed.recommended_action,
      confidence: parsed.confidence ?? 'low',
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    }
  } catch {
    return { ...SAFE_DEFAULT }
  }
}

export async function runPlanner(
  objective: string,
  graph: WorkGraph,
  projectSlug?: string,
): Promise<PlannerOutput> {
  const prompt = buildPlannerPrompt(objective, graph, projectSlug)
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

    const result = parsePlannerResponse(textContent)

    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
      cache_creation_tokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
    }

    addTokenUsage(usage, 'claude-haiku-4-5-20251001')
    addCallRecord({
      agent: 'planner',
      model: 'claude-haiku-4-5-20251001',
      timestamp: start,
      usage,
      duration_ms: duration,
      success: true,
    })

    return result
  } catch (error) {
    const duration = Date.now() - start
    console.error('Planner API error:', error)

    addCallRecord({
      agent: 'planner',
      model: 'claude-haiku-4-5-20251001',
      timestamp: start,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 },
      duration_ms: duration,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })

    return { ...SAFE_DEFAULT }
  }
}
