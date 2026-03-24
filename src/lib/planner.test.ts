import { describe, it, expect } from 'vitest'
import { buildPlannerPrompt, parsePlannerResponse } from './planner'
import type { WorkGraph } from '@/types/graph'
import type { ProjectEntity, TaskEntity, PersonEntity, DecisionEntity, SessionEntity } from '@/types/entities'

const mockGraph: WorkGraph = {
  entities: [
    { kind: 'project', slug: 'municipality-platform', name: 'Municipality Platform', status: 'active', ref: { file: '' } } as ProjectEntity,
    { kind: 'task', id: '01TASK', title: 'Architecture diagram', status: 'blocked', priority: 'high', due_date: '2026-03-21', blocked_by: 'Cost estimate', waiting_on: 'Thomas', project: 'municipality-platform', ref: { file: '' } } as TaskEntity,
    { kind: 'task', id: '02TASK', title: 'TCO one-pager', status: 'todo', priority: 'high', due_date: '2026-03-18', project: 'municipality-platform', ref: { file: '' } } as TaskEntity,
    { kind: 'person', id: '01PERS', name: 'Thomas', role: 'Infrastructure lead', projects: ['municipality-platform'], ref: { file: '' } } as PersonEntity,
    { kind: 'decision', id: '01DEC', title: 'On-premise inference confirmed', decision: 'All inference on-prem', rationale: 'Data governance', unblocks: ['01TASK'], date: '2026-03-14', decided_by: 'August', project: 'municipality-platform', status: 'active', ref: { file: '' } } as DecisionEntity,
    { kind: 'session', id: '01SESS', target: 'chat', objective: 'Draft architecture overview', status: 'completed', ref: { file: '' } } as SessionEntity,
  ],
  relationships: [],
  built_at: Date.now(),
  file_mtimes: {},
}

describe('buildPlannerPrompt', () => {
  it('includes system prompt with key rules', () => {
    const { system } = buildPlannerPrompt('Draft the TCO one-pager', mockGraph)
    expect(system).toContain('Twin Planner')
    expect(system).toContain('minimum action')
    expect(system).toContain('Do not dispatch if the state is unclear')
    expect(system).toContain('Reference entities by their IDs')
    expect(system).toContain('PlannerOutput JSON')
  })

  it('includes user objective in message', () => {
    const { userMessage } = buildPlannerPrompt('Draft the TCO one-pager', mockGraph)
    expect(userMessage).toContain('Draft the TCO one-pager')
  })

  it('includes graph context with task IDs and statuses', () => {
    const { userMessage } = buildPlannerPrompt('Draft the TCO one-pager', mockGraph, 'municipality-platform')
    expect(userMessage).toContain('01TASK')
    expect(userMessage).toContain('Architecture diagram')
    expect(userMessage).toContain('blocked')
    expect(userMessage).toContain('02TASK')
    expect(userMessage).toContain('TCO one-pager')
    expect(userMessage).toContain('todo')
  })

  it('includes project slug when provided', () => {
    const { userMessage } = buildPlannerPrompt('Draft the TCO one-pager', mockGraph, 'municipality-platform')
    expect(userMessage).toContain('Active project: municipality-platform')
  })
})

describe('parsePlannerResponse', () => {
  it('parses valid dispatch_chat recommendation', () => {
    const json = JSON.stringify({
      recommended_action: {
        type: 'dispatch_chat',
        objective: 'Draft TCO analysis',
        context_sources: [{ file: 'tasks.yaml', line: 5 }],
      },
      confidence: 'high',
      alternatives: [{ action: 'dispatch_code', rationale: 'Could generate a template' }],
    })
    const result = parsePlannerResponse(json)
    expect(result.recommended_action.type).toBe('dispatch_chat')
    expect(result.confidence).toBe('high')
    expect(result.alternatives).toHaveLength(1)
    if (result.recommended_action.type === 'dispatch_chat') {
      expect(result.recommended_action.objective).toBe('Draft TCO analysis')
      expect(result.recommended_action.context_sources).toHaveLength(1)
    }
  })

  it('parses valid dispatch_code recommendation', () => {
    const json = JSON.stringify({
      recommended_action: {
        type: 'dispatch_code',
        objective: 'Implement API endpoint',
        context_sources: [{ file: 'tasks.yaml' }],
      },
      confidence: 'medium',
      alternatives: [],
    })
    const result = parsePlannerResponse(json)
    expect(result.recommended_action.type).toBe('dispatch_code')
    expect(result.confidence).toBe('medium')
  })

  it('parses ask_user response', () => {
    const json = JSON.stringify({
      recommended_action: {
        type: 'ask_user',
        question: 'Which delivery should this target?',
      },
      confidence: 'low',
      alternatives: [],
    })
    const result = parsePlannerResponse(json)
    expect(result.recommended_action.type).toBe('ask_user')
    if (result.recommended_action.type === 'ask_user') {
      expect(result.recommended_action.question).toBe('Which delivery should this target?')
    }
  })

  it('parses no_action response', () => {
    const json = JSON.stringify({
      recommended_action: {
        type: 'no_action',
        reason: 'All tasks are up to date',
      },
      confidence: 'high',
      alternatives: [],
    })
    const result = parsePlannerResponse(json)
    expect(result.recommended_action.type).toBe('no_action')
    if (result.recommended_action.type === 'no_action') {
      expect(result.recommended_action.reason).toBe('All tasks are up to date')
    }
  })

  it('extracts JSON from code fences', () => {
    const wrapped = '```json\n{"recommended_action":{"type":"no_action","reason":"Nothing to do"},"confidence":"low","alternatives":[]}\n```'
    const result = parsePlannerResponse(wrapped)
    expect(result.recommended_action.type).toBe('no_action')
    expect(result.confidence).toBe('low')
  })

  it('returns safe default for malformed JSON', () => {
    const result = parsePlannerResponse('not json at all')
    expect(result.recommended_action.type).toBe('no_action')
    expect(result.confidence).toBe('low')
    expect(result.alternatives).toHaveLength(0)
    if (result.recommended_action.type === 'no_action') {
      expect(result.recommended_action.reason).toBe('Could not parse response')
    }
  })

  it('handles missing alternatives gracefully', () => {
    const json = JSON.stringify({
      recommended_action: {
        type: 'no_action',
        reason: 'Nothing needed',
      },
      confidence: 'high',
    })
    const result = parsePlannerResponse(json)
    expect(result.alternatives).toEqual([])
    expect(result.confidence).toBe('high')
  })
})
