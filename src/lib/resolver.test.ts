import { describe, it, expect } from 'vitest'
import { buildResolverPrompt, parseResolverResponse } from './resolver'
import type { WorkGraph } from '@/types/graph'
import type { ProjectEntity, TaskEntity, PersonEntity, DecisionEntity } from '@/types/entities'

const mockGraph: WorkGraph = {
  entities: [
    { kind: 'project', slug: 'municipality-platform', name: 'Municipality Platform', status: 'active', ref: { file: '' } } as ProjectEntity,
    { kind: 'task', id: '01TASK', title: 'Architecture diagram', status: 'blocked', priority: 'high', due_date: '2026-03-21', blocked_by: 'Cost estimate', waiting_on: 'Thomas', project: 'municipality-platform', ref: { file: '' } } as TaskEntity,
    { kind: 'task', id: '02TASK', title: 'TCO one-pager', status: 'todo', priority: 'high', due_date: '2026-03-18', project: 'municipality-platform', ref: { file: '' } } as TaskEntity,
    { kind: 'person', id: '01PERS', name: 'Thomas', role: 'Infrastructure lead', projects: ['municipality-platform'], ref: { file: '' } } as PersonEntity,
    { kind: 'decision', id: '01DEC', title: 'On-premise inference confirmed', decision: 'All inference on-prem', rationale: 'Data governance', unblocks: ['01TASK'], date: '2026-03-14', decided_by: 'August', project: 'municipality-platform', status: 'active', ref: { file: '' } } as DecisionEntity,
  ],
  relationships: [],
  built_at: Date.now(),
  file_mtimes: {},
}

describe('buildResolverPrompt', () => {
  it('includes the system prompt with key rules', () => {
    const { system } = buildResolverPrompt('Test capture', mockGraph, 'municipality-platform')
    expect(system).toContain('Twin Resolver')
    expect(system).toContain('Do not invent entities')
    expect(system).toContain('evidence quote')
    expect(system).toContain('ResolverOutput JSON')
    expect(system).toContain('confidence')
  })

  it('includes raw text in user message', () => {
    const { userMessage } = buildResolverPrompt('Thomas sent the cost estimate', mockGraph)
    expect(userMessage).toContain('Thomas sent the cost estimate')
  })

  it('includes task IDs and titles from graph', () => {
    const { userMessage } = buildResolverPrompt('Test', mockGraph, 'municipality-platform')
    expect(userMessage).toContain('01TASK')
    expect(userMessage).toContain('Architecture diagram')
    expect(userMessage).toContain('blocked')
  })

  it('includes people from graph', () => {
    const { userMessage } = buildResolverPrompt('Test', mockGraph, 'municipality-platform')
    expect(userMessage).toContain('Thomas')
    expect(userMessage).toContain('Infrastructure lead')
  })

  it('includes active decisions', () => {
    const { userMessage } = buildResolverPrompt('Test', mockGraph, 'municipality-platform')
    expect(userMessage).toContain('On-premise inference confirmed')
  })

  it('includes active project slug when provided', () => {
    const { userMessage } = buildResolverPrompt('Test', mockGraph, 'municipality-platform')
    expect(userMessage).toContain('municipality-platform')
  })
})

describe('parseResolverResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      candidate_project: 'municipality-platform',
      confidence: 'high',
      proposed_observations: [{
        observation_type: 'task',
        summary: 'Cost estimate received',
        evidence: 'Thomas sent the cost estimate',
        proposed_delta: { op: 'mark_unblocked', task_id: '01TASK', project: 'municipality-platform' }
      }],
      suggested_note_type: 'thought',
      suggested_note_title: 'Cost estimate update'
    })
    const result = parseResolverResponse(json)
    expect(result.confidence).toBe('high')
    expect(result.proposed_observations).toHaveLength(1)
    expect(result.proposed_observations[0].observation_type).toBe('task')
    expect(result.proposed_observations[0].proposed_delta).not.toBeNull()
  })

  it('extracts JSON from markdown code fences', () => {
    const wrapped = '```json\n{"candidate_project":"test","confidence":"medium","proposed_observations":[],"suggested_note_type":"thought","suggested_note_title":"Test"}\n```'
    const result = parseResolverResponse(wrapped)
    expect(result.confidence).toBe('medium')
    expect(result.candidate_project).toBe('test')
  })

  it('returns safe default for malformed JSON', () => {
    const result = parseResolverResponse('not json at all')
    expect(result.confidence).toBe('low')
    expect(result.proposed_observations).toHaveLength(0)
    expect(result.suggested_note_type).toBe('thought')
    expect(result.suggested_note_title).toBe('Untitled capture')
  })

  it('returns safe default for incomplete JSON', () => {
    const result = parseResolverResponse('{"candidate_project": "test"')
    expect(result.confidence).toBe('low')
    expect(result.proposed_observations).toHaveLength(0)
  })

  it('handles response with missing fields gracefully', () => {
    const json = JSON.stringify({ candidate_project: 'test', confidence: 'high' })
    const result = parseResolverResponse(json)
    expect(result.confidence).toBe('high')
    expect(result.proposed_observations).toEqual([])
    expect(result.suggested_note_type).toBe('thought')
  })

  it('handles empty observations array', () => {
    const json = JSON.stringify({
      candidate_project: null,
      confidence: 'low',
      proposed_observations: [],
      suggested_note_type: 'reference',
      suggested_note_title: 'Quick note'
    })
    const result = parseResolverResponse(json)
    expect(result.proposed_observations).toHaveLength(0)
    expect(result.suggested_note_type).toBe('reference')
  })
})
