import { describe, it, expect } from 'vitest'
import { buildPrioritiserPrompt, parsePrioritiserResponse } from './prioritiser'
import type { WorkGraph } from '@/types/graph'
import type { ProjectEntity, TaskEntity, PersonEntity, DecisionEntity, DeliveryEntity, NoteEntity } from '@/types/entities'

// Helper: date N days ago in ISO format
function daysAgo(n: number): string {
  const d = new Date('2026-03-24')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const mockGraph: WorkGraph = {
  entities: [
    { kind: 'project', slug: 'municipality-platform', name: 'Municipality Platform', status: 'active', ref: { file: '' } } as ProjectEntity,
    { kind: 'project', slug: 'internal-tools', name: 'Internal Tools', status: 'active', ref: { file: '' } } as ProjectEntity,
    { kind: 'task', id: '01TASK', title: 'Architecture diagram', status: 'blocked', priority: 'high', due_date: '2026-03-21', blocked_by: 'Cost estimate', waiting_on: '01PERS', project: 'municipality-platform', ref: { file: '' } } as TaskEntity,
    { kind: 'task', id: '02TASK', title: 'TCO one-pager', status: 'todo', priority: 'high', due_date: '2026-03-18', project: 'municipality-platform', ref: { file: '' } } as TaskEntity,
    { kind: 'task', id: '03TASK', title: 'Setup CI pipeline', status: 'in_progress', priority: 'medium', project: 'internal-tools', ref: { file: '' } } as TaskEntity,
    // Task with waiting_on created > 2 days ago (simulated via due_date being old)
    { kind: 'task', id: '04TASK', title: 'Waiting task', status: 'blocked', priority: 'high', waiting_on: '01PERS', due_date: daysAgo(5), project: 'municipality-platform', ref: { file: '' } } as TaskEntity,
    { kind: 'delivery', id: '01DEL', slug: 'q2-pitch', title: 'Q2 Pitch Deck', type: 'deck', status: 'draft', due_date: '2026-03-25', project: 'municipality-platform', ref: { file: '' } } as DeliveryEntity,
    { kind: 'delivery', id: '02DEL', slug: 'tco-report', title: 'TCO Report', type: 'doc', status: 'delivered', due_date: '2026-03-15', project: 'municipality-platform', ref: { file: '' } } as DeliveryEntity,
    { kind: 'decision', id: '01DEC', title: 'On-premise inference confirmed', decision: 'All inference on-prem', rationale: 'Data governance', unblocks: ['01TASK'], date: daysAgo(3), decided_by: 'August', project: 'municipality-platform', status: 'active', ref: { file: '' } } as DecisionEntity,
    { kind: 'decision', id: '02DEC', title: 'Old stale decision', decision: 'Use Kubernetes', rationale: 'Scalability', unblocks: [], date: daysAgo(35), decided_by: 'August', project: 'internal-tools', status: 'active', ref: { file: '' } } as DecisionEntity,
    { kind: 'person', id: '01PERS', name: 'Thomas', role: 'Infrastructure lead', projects: ['municipality-platform'], ref: { file: '' } } as PersonEntity,
    { kind: 'note', id: '01NOTE', filename: 'arch-notes.md', title: 'Architecture Notes', type: 'thought', project: 'municipality-platform', twin_synced: true, people: [], ref: { file: '' } } as NoteEntity,
  ],
  relationships: [],
  built_at: Date.now(),
  file_mtimes: {},
}

describe('buildPrioritiserPrompt', () => {
  it('includes system prompt with key rules', () => {
    const { system } = buildPrioritiserPrompt(mockGraph, '2026-03-24')
    expect(system).toContain('Twin Prioritiser')
    expect(system).toContain('trigger_reason')
  })

  it('includes current date', () => {
    const { userMessage } = buildPrioritiserPrompt(mockGraph, '2026-03-24')
    expect(userMessage).toContain('2026-03-24')
  })

  it('includes tasks with IDs across projects', () => {
    const { userMessage } = buildPrioritiserPrompt(mockGraph, '2026-03-24')
    expect(userMessage).toContain('01TASK')
    expect(userMessage).toContain('Architecture diagram')
    expect(userMessage).toContain('02TASK')
    expect(userMessage).toContain('03TASK')
    expect(userMessage).toContain('municipality-platform')
    expect(userMessage).toContain('internal-tools')
  })

  it('includes deliveries', () => {
    const { userMessage } = buildPrioritiserPrompt(mockGraph, '2026-03-24')
    expect(userMessage).toContain('01DEL')
    expect(userMessage).toContain('Q2 Pitch Deck')
    expect(userMessage).toContain('02DEL')
  })

  it('detects tasks waiting > 2 days (flag in context)', () => {
    const { userMessage } = buildPrioritiserPrompt(mockGraph, '2026-03-24')
    expect(userMessage).toContain('PROACTIVE CONDITIONS')
    expect(userMessage).toMatch(/waiting.*01PERS/i)
  })

  it('detects deliveries due soon still in draft', () => {
    const { userMessage } = buildPrioritiserPrompt(mockGraph, '2026-03-24')
    expect(userMessage).toContain('PROACTIVE CONDITIONS')
    expect(userMessage).toMatch(/Q2 Pitch Deck.*draft/i)
  })
})

describe('parsePrioritiserResponse', () => {
  it('parses valid response with brief and items', () => {
    const json = JSON.stringify({
      brief: 'Focus on the TCO one-pager today.',
      priority_items: [
        {
          title: 'TCO one-pager',
          project: 'municipality-platform',
          reasoning: 'Overdue by 6 days',
          next_action: 'Draft in Claude Chat',
          entity_refs: ['02TASK'],
        },
      ],
      proactive_proposals: [],
    })
    const result = parsePrioritiserResponse(json)
    expect(result.brief).toBe('Focus on the TCO one-pager today.')
    expect(result.priority_items).toHaveLength(1)
    expect(result.priority_items[0].title).toBe('TCO one-pager')
    expect(result.proactive_proposals).toHaveLength(0)
  })

  it('parses response with proactive proposals', () => {
    const json = JSON.stringify({
      brief: 'Two items need attention.',
      priority_items: [],
      proactive_proposals: [
        {
          proposal: 'Follow up with Thomas on cost estimate',
          trigger_reason: 'Task waiting_on Thomas for 5 days',
          proposed_delta: null,
          entity_refs: ['01TASK', '01PERS'],
        },
      ],
    })
    const result = parsePrioritiserResponse(json)
    expect(result.proactive_proposals).toHaveLength(1)
    expect(result.proactive_proposals[0].proposal).toContain('Thomas')
    expect(result.proactive_proposals[0].trigger_reason).toContain('waiting_on')
  })

  it('returns safe default for malformed JSON', () => {
    const result = parsePrioritiserResponse('not json at all')
    expect(result.brief).toBe('Could not generate priority brief')
    expect(result.priority_items).toHaveLength(0)
    expect(result.proactive_proposals).toHaveLength(0)
  })

  it('extracts JSON from code fences', () => {
    const wrapped = '```json\n{"brief":"Today focus on X.","priority_items":[],"proactive_proposals":[]}\n```'
    const result = parsePrioritiserResponse(wrapped)
    expect(result.brief).toBe('Today focus on X.')
    expect(result.priority_items).toEqual([])
  })
})
