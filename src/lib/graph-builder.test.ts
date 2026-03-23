import { describe, it, expect } from 'vitest'
import { buildGraphFromEntities, deriveRelationships } from './graph-builder'
import { parseTasks, parseDeliveries, parseDecisions, parsePeople, parseNotes } from './fs'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { ProjectEntity, OpenQuestionEntity, NoteEntity, TaskEntity } from '@/types/entities'

const fixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

function loadAllEntities() {
  const project: ProjectEntity = { kind: 'project', slug: 'municipality-platform', name: 'Municipality Platform', status: 'active', ref: { file: 'projects/municipality-platform' } }
  const tasks = parseTasks(fixture('tasks.yaml'), 'municipality-platform')
  const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'municipality-platform')
  const decisions = parseDecisions(fixture('decisions.yaml'), 'municipality-platform')
  const people = parsePeople(fixture('people.yaml'))
  const noteContent = readFileSync(resolve(__dirname, '../fixtures/notes/2026-03-17-tech-stack-decision.md'), 'utf-8')
  const notes = parseNotes([{ filename: '2026-03-17-tech-stack-decision.md', content: noteContent }], 'municipality-platform')
  return { project, tasks, deliveries, decisions, people, notes }
}

describe('buildGraphFromEntities', () => {
  it('builds a graph with all entity kinds', () => {
    const { project, tasks, deliveries, decisions, people, notes } = loadAllEntities()
    const all = [project, ...tasks, ...deliveries, ...decisions, ...people, ...notes]
    const graph = buildGraphFromEntities(all)
    expect(graph.entities.length).toBe(all.length)
    expect(graph.built_at).toBeGreaterThan(0)
    expect(graph.relationships.length).toBeGreaterThan(0)
  })

  it('excludes archived projects and their entities', () => {
    const active: ProjectEntity = { kind: 'project', slug: 'active', name: 'Active', status: 'active', ref: { file: '' } }
    const archived: ProjectEntity = { kind: 'project', slug: 'archived', name: 'Archived', status: 'archived', ref: { file: '' } }
    const taskInActive: TaskEntity = { kind: 'task', id: '01A', title: 'T1', status: 'todo', priority: undefined, due_date: undefined, blocked_by: undefined, waiting_on: undefined, project: 'active', delivery: undefined, ref: { file: '' } } as unknown as TaskEntity
    const taskInArchived: TaskEntity = { kind: 'task', id: '01B', title: 'T2', status: 'todo', priority: undefined, due_date: undefined, blocked_by: undefined, waiting_on: undefined, project: 'archived', delivery: undefined, ref: { file: '' } } as unknown as TaskEntity

    const graph = buildGraphFromEntities([active, archived, taskInActive, taskInArchived])
    expect(graph.entities).toHaveLength(2) // active project + its task
    expect(graph.entities.find(e => e.kind === 'project' && e.slug === 'archived')).toBeUndefined()
    expect(graph.entities.find(e => e.kind === 'task' && (e as TaskEntity).id === '01B')).toBeUndefined()
  })
})

describe('deriveRelationships', () => {
  it('derives belongs_to relationships', () => {
    const { project, tasks } = loadAllEntities()
    const graph = buildGraphFromEntities([project, ...tasks])
    const belongsTo = graph.relationships.filter(r => r.type === 'belongs_to')
    expect(belongsTo.length).toBe(tasks.length)
    belongsTo.forEach(r => {
      expect(r.to.kind).toBe('project')
      expect(r.to.id).toBe('municipality-platform')
    })
  })

  it('derives delivers relationships from task.delivery', () => {
    const { project, tasks, deliveries } = loadAllEntities()
    const graph = buildGraphFromEntities([project, ...tasks, ...deliveries])
    const delivers = graph.relationships.filter(r => r.type === 'delivers')
    const tasksWithDelivery = tasks.filter(t => (t as Record<string, unknown>).delivery != null)
    expect(delivers.length).toBe(tasksWithDelivery.length)
  })

  it('derives involves relationships from waiting_on', () => {
    const { tasks, people } = loadAllEntities()
    const graph = buildGraphFromEntities([...tasks, ...people])
    const involves = graph.relationships.filter(r => r.type === 'involves')
    // At least the "Architecture diagram" task waiting on Thomas
    expect(involves.length).toBeGreaterThanOrEqual(1)
    const thomasInvolved = involves.find(r => r.to.id === '01JBQFB1A1') // Thomas's ID
    expect(thomasInvolved).toBeDefined()
  })

  it('derives involves relationships from decision.decided_by', () => {
    const { decisions, people } = loadAllEntities()
    const graph = buildGraphFromEntities([...decisions, ...people])
    const involves = graph.relationships.filter(r => r.type === 'involves')
    // "August" matches no person in fixtures, but "August + client IT team" should still not match Thomas/Jakob/Rasmus
    // The decision "Data framework decision deferred" decided_by "August" — no person match
    // The decision "On-premise inference confirmed" decided_by "August + client IT team" — no person match
    // The superseded decision decided_by "August" — no person match
    // So we expect 0 involves from decisions in fixture data (no "August" person entity)
    expect(involves.length).toBe(0)
  })

  it('derives unblocks relationships from decision.unblocks array', () => {
    const { tasks, decisions } = loadAllEntities()
    const graph = buildGraphFromEntities([...tasks, ...decisions])
    const unblocks = graph.relationships.filter(r => r.type === 'unblocks')
    // Two active decisions each unblock one task, superseded decision has empty unblocks
    expect(unblocks.length).toBe(2)
  })

  it('derives supersedes relationships', () => {
    const { decisions } = loadAllEntities()
    const graph = buildGraphFromEntities(decisions)
    const supersedes = graph.relationships.filter(r => r.type === 'supersedes')
    expect(supersedes.length).toBe(1)
    // The superseding decision (01JBQFA2M3) supersedes the old one (01JBQFA0J1)
    expect(supersedes[0].from.id).toBe('01JBQFA2M3')
    expect(supersedes[0].to.id).toBe('01JBQFA0J1')
  })

  it('derives raises relationships from open questions', () => {
    const note: NoteEntity = { kind: 'note', id: '01N', filename: 'test.md', title: 'Test', type: 'thought', project: 'p', twin_synced: true, people: [], ref: { file: '' } }
    const question: OpenQuestionEntity = { kind: 'open_question', id: '01Q', question: 'Why?', project: 'p', source_note: '01N', status: 'open', ref: { file: '' } }
    const rels = deriveRelationships([note, question])
    const raises = rels.filter(r => r.type === 'raises')
    expect(raises.length).toBe(1)
    expect(raises[0].from.id).toBe('01N')
    expect(raises[0].to.id).toBe('01Q')
  })

  it('does not create delivers relationship when delivery target is missing', () => {
    const task = { kind: 'task' as const, id: '01X', title: 'Orphan', status: 'todo' as const, project: 'p', delivery: '01NONEXISTENT', ref: { file: '' } } as unknown as TaskEntity
    const rels = deriveRelationships([task])
    const delivers = rels.filter(r => r.type === 'delivers')
    expect(delivers.length).toBe(0)
  })
})
