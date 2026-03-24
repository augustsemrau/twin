import { describe, it, expect } from 'vitest'
import { validateDeltas } from './validator'
import { buildGraphFromEntities } from './graph-builder'
import { parseTasks, parseDeliveries, parseDecisions, parsePeople } from './fs'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { DeltaOperation } from '@/types/deltas'
import type { WorkGraph } from '@/types/graph'
import type { ProjectEntity } from '@/types/entities'

const fixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

function buildTestGraph(): WorkGraph {
  const project: ProjectEntity = { kind: 'project', slug: 'municipality-platform', name: 'Municipality Platform', status: 'active', ref: { file: '' } }
  const tasks = parseTasks(fixture('tasks.yaml'), 'municipality-platform')
  const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'municipality-platform')
  const decisions = parseDecisions(fixture('decisions.yaml'), 'municipality-platform')
  const people = parsePeople(fixture('people.yaml'))
  return buildGraphFromEntities([project, ...tasks, ...deliveries, ...decisions, ...people])
}

describe('validator', () => {
  const graph = buildTestGraph()

  // --- Valid operations ---
  it('accepts valid update_task_status', () => {
    const delta: DeltaOperation = { op: 'update_task_status', task_id: '01JBQF3A1K', project: 'municipality-platform', status: 'done' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts valid mark_blocked', () => {
    const delta: DeltaOperation = { op: 'mark_blocked', task_id: '01JBQF3A1K', project: 'municipality-platform', blocked_by: 'Something', waiting_on: 'Someone' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(true)
  })

  it('accepts valid mark_unblocked on a blocked task', () => {
    const delta: DeltaOperation = { op: 'mark_unblocked', task_id: '01JBQF3B2M', project: 'municipality-platform' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(true)
  })

  it('accepts valid create_task', () => {
    const delta = { op: 'create_task', payload: { id: '01NEW', title: 'New task', status: 'todo', priority: 'medium', due_date: null, blocked_by: null, waiting_on: null, project: 'municipality-platform', delivery: null } } as unknown as DeltaOperation
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(true)
  })

  it('accepts valid upsert_person', () => {
    const delta: DeltaOperation = { op: 'upsert_person', payload: { id: '01NEW', name: 'New Person', role: 'Dev', projects: ['municipality-platform'] } }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(true)
  })

  // --- Invalid operations ---
  it('rejects update_task_status with non-existent task_id', () => {
    const delta: DeltaOperation = { op: 'update_task_status', task_id: 'NONEXISTENT', project: 'municipality-platform', status: 'done' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(false)
    expect(result.errors[0].reason).toContain('not found')
  })

  it('rejects mark_unblocked on a non-blocked task', () => {
    const delta: DeltaOperation = { op: 'mark_unblocked', task_id: '01JBQF3A1K', project: 'municipality-platform' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(false)
    expect(result.errors[0].reason).toContain('not blocked')
  })

  it('rejects supersede_decision when target is not active', () => {
    const delta: DeltaOperation = { op: 'supersede_decision', old_id: '01JBQFA0J1', new_id: '01JBQFA2M3', project: 'municipality-platform' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(false)
    expect(result.errors[0].reason).toContain('not active')
  })

  it('rejects update_delivery_status with non-existent delivery', () => {
    const delta: DeltaOperation = { op: 'update_delivery_status', delivery_id: 'NONEXISTENT', project: 'municipality-platform', status: 'delivered' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(false)
  })

  it('rejects upsert_person with empty name', () => {
    const delta = { op: 'upsert_person', payload: { id: '01X', name: '', role: null, projects: [] } } as unknown as DeltaOperation
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(false)
    expect(result.errors[0].reason).toContain('name')
  })

  it('rejects create_task for non-existent project', () => {
    const delta = { op: 'create_task', payload: { id: '01X', title: 'T', status: 'todo', priority: 'low', due_date: null, blocked_by: null, waiting_on: null, project: 'nonexistent', delivery: null } } as unknown as DeltaOperation
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(false)
  })

  it('rejects archive_project for non-existent project', () => {
    const delta: DeltaOperation = { op: 'archive_project', project_slug: 'nonexistent' }
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(false)
  })

  // --- Warnings ---
  it('warns on duplicate decision title', () => {
    const delta = { op: 'append_decision', payload: { id: '01NEW', title: 'Data framework decision deferred', decision: 'Same title', rationale: null, unblocks: [], date: '2026-03-17', decided_by: 'August', project: 'municipality-platform', status: 'active', superseded_by: null } } as unknown as DeltaOperation
    const result = validateDeltas([delta], graph)
    expect(result.valid).toBe(true) // warnings don't fail
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  // --- Batch-aware validation ---
  it('accepts supersede_decision when new_id is in same batch append_decision', () => {
    const deltas: DeltaOperation[] = [
      {
        op: 'append_decision',
        payload: {
          id: '01NEWDEC',
          title: 'New decision',
          decision: 'We decided X',
          rationale: 'Because Y',
          date: '2026-03-20',
          decided_by: 'August',
          unblocks: [],
          status: 'active',
          superseded_by: null,
          project: 'municipality-platform',
        },
      } as unknown as DeltaOperation,
      {
        op: 'supersede_decision',
        old_id: '01JBQFA1K2', // active decision in fixture
        new_id: '01NEWDEC',   // created in the same batch
        project: 'municipality-platform',
      },
    ]
    const result = validateDeltas(deltas, graph)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects supersede_decision when new_id is not in graph or batch', () => {
    const deltas: DeltaOperation[] = [
      {
        op: 'supersede_decision',
        old_id: '01JBQFA1K2',
        new_id: 'TOTALLY_MISSING',
        project: 'municipality-platform',
      },
    ]
    const result = validateDeltas(deltas, graph)
    expect(result.valid).toBe(false)
    expect(result.errors[0].reason).toContain('not found')
  })

  // --- Multiple deltas ---
  it('validates multiple deltas and reports all errors', () => {
    const deltas: DeltaOperation[] = [
      { op: 'update_task_status', task_id: 'BAD1', project: 'municipality-platform', status: 'done' },
      { op: 'update_task_status', task_id: 'BAD2', project: 'municipality-platform', status: 'done' },
    ]
    const result = validateDeltas(deltas, graph)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
  })
})
