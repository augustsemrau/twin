import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fuzzyMatchTask, buildReconcilerPrompt, parseReconcilerResponse, resolveManifestReferences } from './reconciler'
import { parseTasks, parseDeliveries, parseDecisions, parsePeople, parseNotes } from './fs'
import { buildGraphFromEntities } from './graph-builder'
import type { TaskEntity, ProjectEntity, OpenQuestionEntity } from '@/types/entities'
import type { WorkGraph } from '@/types/graph'
import type { SessionManifest, ContextPack } from '@/types/sessions'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

function buildTestGraph(): WorkGraph {
  const project: ProjectEntity = {
    kind: 'project',
    slug: 'municipality-platform',
    name: 'Municipality Platform',
    status: 'active',
    ref: { file: 'projects/municipality-platform' },
  }
  const tasks = parseTasks(fixture('tasks.yaml'), 'municipality-platform')
  const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'municipality-platform')
  const decisions = parseDecisions(fixture('decisions.yaml'), 'municipality-platform')
  const people = parsePeople(fixture('people.yaml'))
  const noteContent = readFileSync(
    resolve(__dirname, '../fixtures/notes/2026-03-17-tech-stack-decision.md'),
    'utf-8',
  )
  const notes = parseNotes(
    [{ filename: '2026-03-17-tech-stack-decision.md', content: noteContent }],
    'municipality-platform',
  )

  const openQuestion: OpenQuestionEntity = {
    kind: 'open_question',
    id: '01JBQOQ1A1',
    question: 'Which data framework to use?',
    project: 'municipality-platform',
    status: 'open',
    ref: { file: 'projects/municipality-platform/tasks.yaml' },
  }

  const all = [project, ...tasks, ...deliveries, ...decisions, ...people, ...notes, openQuestion]
  return buildGraphFromEntities(all)
}

const mockGraph = buildTestGraph()

// ---------------------------------------------------------------------------
// fuzzyMatchTask
// ---------------------------------------------------------------------------

describe('fuzzyMatchTask', () => {
  const tasks: TaskEntity[] = [
    { kind: 'task', id: '01A', title: 'Architecture diagram', status: 'blocked', priority: 'high', due_date: undefined, blocked_by: undefined, waiting_on: undefined, project: 'p', delivery: undefined, ref: { file: '' } },
    { kind: 'task', id: '01B', title: 'TCO one-pager for Jakob', status: 'todo', priority: 'high', due_date: undefined, blocked_by: undefined, waiting_on: undefined, project: 'p', delivery: undefined, ref: { file: '' } },
  ]

  it('exact match returns high confidence', () => {
    const result = fuzzyMatchTask('Architecture diagram', tasks)
    expect(result.match?.id).toBe('01A')
    expect(result.confidence).toBe('high')
  })

  it('close fuzzy match returns medium confidence', () => {
    const result = fuzzyMatchTask('Architecture diagrams', tasks)
    expect(result.match?.id).toBe('01A')
    expect(result.confidence).toBe('medium')
  })

  it('no match returns null with low confidence', () => {
    const result = fuzzyMatchTask('Something completely different', tasks)
    expect(result.match).toBeNull()
    expect(result.confidence).toBe('low')
  })
})

// ---------------------------------------------------------------------------
// buildReconcilerPrompt
// ---------------------------------------------------------------------------

describe('buildReconcilerPrompt', () => {
  const manifest: SessionManifest = {
    session_id: '01SES',
    summary: 'Decided on Polars as data framework',
    target: 'chat',
    decisions: [{ title: 'Use Polars', decision: 'We chose Polars for the data layer' }],
    tasks_created: [],
    tasks_updated: [{ id: '01JBQF3B2M', status: 'done' }],
    artifacts: [],
    open_questions: [],
    blockers: [],
    confidence: 'high',
  }

  const pack: ContextPack = {
    session_id: '01SES',
    target: 'chat',
    objective: 'Decide on data framework',
    brief_markdown: '...',
    selected_sources: [],
    entity_id_map: { '01JBQF3B2M': 'Architecture diagram' },
    writeback_contract: {
      session_id: '01SES',
      expected_outputs: ['decisions'],
      writeback_file: '~/twin/sessions/01SES-manifest.yaml',
      schema_version: '1.0',
    },
    created_at: '2026-03-24T10:00:00Z',
  }

  it('includes system prompt with Reconciler identity', () => {
    const { system } = buildReconcilerPrompt(manifest, pack, mockGraph)
    expect(system).toContain('Twin Reconciler')
  })

  it('includes manifest summary in user message', () => {
    const { userMessage } = buildReconcilerPrompt(manifest, pack, mockGraph)
    expect(userMessage).toContain('Decided on Polars as data framework')
  })

  it('includes entity ID map in user message', () => {
    const { userMessage } = buildReconcilerPrompt(manifest, pack, mockGraph)
    expect(userMessage).toContain('01JBQF3B2M')
    expect(userMessage).toContain('Architecture diagram')
  })

  it('includes current tasks from graph', () => {
    const { userMessage } = buildReconcilerPrompt(manifest, pack, mockGraph)
    expect(userMessage).toContain('Finalise Q2 pitch structure')
  })
})

// ---------------------------------------------------------------------------
// parseReconcilerResponse
// ---------------------------------------------------------------------------

describe('parseReconcilerResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      session_id: '01SES',
      follow_up_proposals: [],
      confidence: 'high',
    })
    const result = parseReconcilerResponse(json)
    expect(result.session_id).toBe('01SES')
    expect(result.confidence).toBe('high')
  })

  it('extracts JSON from code fences', () => {
    const text = '```json\n{"session_id":"01SES","follow_up_proposals":[],"confidence":"medium"}\n```'
    const result = parseReconcilerResponse(text)
    expect(result.session_id).toBe('01SES')
    expect(result.confidence).toBe('medium')
  })

  it('returns safe default on invalid JSON', () => {
    const result = parseReconcilerResponse('this is not json')
    expect(result.confidence).toBe('low')
    expect(result.proposed_deltas).toEqual([])
    expect(result.unresolved).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// resolveManifestReferences
// ---------------------------------------------------------------------------

describe('resolveManifestReferences', () => {
  it('resolves task update by ID', () => {
    const manifest: SessionManifest = {
      session_id: '01SES',
      summary: 'Test',
      target: 'code',
      tasks_updated: [{ id: '01JBQF3B2M', status: 'done' }],
      decisions: [],
      tasks_created: [],
      artifacts: [],
      open_questions: [],
      blockers: [],
      confidence: 'high',
    }
    const result = resolveManifestReferences(manifest, mockGraph)
    expect(result.resolvedDeltas).toHaveLength(1)
    expect(result.resolvedDeltas[0].op).toBe('update_task_status')
  })

  it('resolves task update by fuzzy title match', () => {
    const manifest: SessionManifest = {
      session_id: '01SES',
      summary: 'Test',
      target: 'code',
      tasks_updated: [{ title: 'Architecture diagram', status: 'done' }],
      decisions: [],
      tasks_created: [],
      artifacts: [],
      open_questions: [],
      blockers: [],
      confidence: 'medium',
    }
    const result = resolveManifestReferences(manifest, mockGraph)
    expect(result.resolvedDeltas).toHaveLength(1)
  })

  it('adds unresolvable tasks to unresolved', () => {
    const manifest: SessionManifest = {
      session_id: '01SES',
      summary: 'Test',
      target: 'code',
      tasks_updated: [{ title: 'Unknown task', status: 'done' }],
      decisions: [],
      tasks_created: [],
      artifacts: [],
      open_questions: [],
      blockers: [],
      confidence: 'low',
    }
    const result = resolveManifestReferences(manifest, mockGraph)
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].needs_user_input).toBe(true)
  })

  it('creates deltas for new tasks', () => {
    const manifest: SessionManifest = {
      session_id: '01SES',
      summary: 'Test',
      target: 'code',
      tasks_created: [{ title: 'New task', priority: 'medium' }],
      tasks_updated: [],
      decisions: [],
      artifacts: [],
      open_questions: [],
      blockers: [],
      confidence: 'high',
    }
    const result = resolveManifestReferences(manifest, mockGraph)
    expect(result.resolvedDeltas.some(d => d.op === 'create_task')).toBe(true)
  })

  it('creates deltas for decisions', () => {
    const manifest: SessionManifest = {
      session_id: '01SES',
      summary: 'Test',
      target: 'code',
      decisions: [{ title: 'New decision', decision: 'We decided X' }],
      tasks_created: [],
      tasks_updated: [],
      artifacts: [],
      open_questions: [],
      blockers: [],
      confidence: 'high',
    }
    const result = resolveManifestReferences(manifest, mockGraph)
    expect(result.resolvedDeltas.some(d => d.op === 'append_decision')).toBe(true)
  })
})
