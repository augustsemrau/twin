import type { WorkGraph } from '@/types/graph'
import type { ResolverOutput } from '@/types/agents'
import type { ProjectEntity, TaskEntity, PersonEntity, DecisionEntity, OpenQuestionEntity } from '@/types/entities'
import { getClient, addTokenUsage, addCallRecord } from '@/lib/anthropic-client'

const RESOLVER_SYSTEM_PROMPT = `You are Twin Resolver.

Convert a raw event into proposed observations about a user's work state.
Operate over the provided work graph. Do not invent entities not present in
the input text or graph.

Rules:
- Only extract what is clearly present. Do not infer beyond the evidence.
- Assess your confidence: high (obvious and unambiguous), medium (likely correct
  but some interpretation required), low (plausible but uncertain).
- Every proposed_observation must include an evidence quote from the input.
- proposed_delta may be null if you cannot confidently determine the right operation.
- When referencing existing entities in deltas, use their IDs from the graph.
- When creating new entities, omit the ID — Twin will generate one.
- Never write to files. Return ResolverOutput JSON only. No prose.`

const SAFE_DEFAULT: ResolverOutput = {
  candidate_project: null,
  confidence: 'low',
  proposed_observations: [],
  suggested_note_type: 'thought',
  suggested_note_title: 'Untitled capture',
}

export function buildResolverPrompt(
  rawText: string,
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

  const lines: string[] = []

  lines.push('=== CAPTURE TEXT ===')
  lines.push(rawText)
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

  return {
    system: RESOLVER_SYSTEM_PROMPT,
    userMessage: lines.join('\n'),
  }
}

export function parseResolverResponse(text: string): ResolverOutput {
  let jsonStr = text.trim()

  // Extract from markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    return {
      candidate_project: parsed.candidate_project ?? null,
      confidence: parsed.confidence ?? 'low',
      proposed_observations: Array.isArray(parsed.proposed_observations)
        ? parsed.proposed_observations
        : [],
      suggested_note_type: parsed.suggested_note_type ?? 'thought',
      suggested_note_title: parsed.suggested_note_title ?? 'Untitled capture',
    }
  } catch {
    return { ...SAFE_DEFAULT }
  }
}

export async function runResolver(
  rawText: string,
  graph: WorkGraph,
  projectSlug?: string,
): Promise<ResolverOutput> {
  const prompt = buildResolverPrompt(rawText, graph, projectSlug)
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

    const result = parseResolverResponse(textContent)

    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
      cache_creation_tokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
    }

    addTokenUsage(usage, 'claude-haiku-4-5-20251001')
    addCallRecord({
      agent: 'resolver',
      model: 'claude-haiku-4-5-20251001',
      timestamp: start,
      usage,
      duration_ms: duration,
      success: true,
    })

    return result
  } catch (error) {
    const duration = Date.now() - start
    console.error('Resolver API error:', error)

    addCallRecord({
      agent: 'resolver',
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
