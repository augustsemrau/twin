import { describe, it, expect } from 'vitest'
import { workGraphToG6 } from './graph-to-g6'
import type { WorkGraph } from '@/types/graph'

describe('workGraphToG6', () => {
  it('transforms projects into combos', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'project', slug: 'test', name: 'Test Project', status: 'active', ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.combos).toHaveLength(1)
    expect(result.combos[0].id).toBe('test')
    expect(result.combos[0].data.label).toBe('Test Project')
    expect(result.nodes).toHaveLength(0) // projects are combos, not nodes
  })

  it('maps task status to correct fill colour', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'task', id: '01A', title: 'Todo', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
        { kind: 'task', id: '01B', title: 'In Progress', status: 'in_progress', priority: 'high', project: 'p', ref: { file: '' } },
        { kind: 'task', id: '01C', title: 'Blocked', status: 'blocked', priority: 'high', blocked_by: 'X', project: 'p', ref: { file: '' } },
        { kind: 'task', id: '01D', title: 'Done', status: 'done', priority: 'high', project: 'p', ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    const todo = result.nodes.find(n => n.id === '01A')
    const inProgress = result.nodes.find(n => n.id === '01B')
    const blocked = result.nodes.find(n => n.id === '01C')
    const done = result.nodes.find(n => n.id === '01D')
    expect(todo?.style?.fill).toBe('#3b82f6')     // blue
    expect(inProgress?.style?.fill).toBe('#f59e0b') // amber
    expect(blocked?.style?.fill).toBe('#ef4444')    // red
    expect(done?.style?.fill).toBe('#22c55e')       // green
  })

  it('maps decision status to correct fill colour', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'decision', id: '01A', title: 'Active', decision: 'yes', unblocks: [], date: '2024-01-01', project: 'p', status: 'active', ref: { file: '' } },
        { kind: 'decision', id: '01B', title: 'Superseded', decision: 'no', unblocks: [], date: '2024-01-01', project: 'p', status: 'superseded', ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    const active = result.nodes.find(n => n.id === '01A')
    const superseded = result.nodes.find(n => n.id === '01B')
    expect(active?.style?.fill).toBe('#14b8a6')    // teal
    expect(superseded?.style?.fill).toBe('#9ca3af') // grey
  })

  it('maps open_question status to correct fill colour', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'open_question', id: '01A', question: 'Why?', project: 'p', status: 'open', ref: { file: '' } },
        { kind: 'open_question', id: '01B', question: 'How?', project: 'p', status: 'resolved', ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    const open = result.nodes.find(n => n.id === '01A')
    const resolved = result.nodes.find(n => n.id === '01B')
    expect(open?.style?.fill).toBe('#eab308')      // yellow
    expect(resolved?.style?.fill).toBe('#9ca3af')   // grey
  })

  it('assigns nodes to project combos', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'project', slug: 'proj', name: 'P', status: 'active', ref: { file: '' } },
        { kind: 'task', id: '01A', title: 'T', status: 'todo', priority: 'high', project: 'proj', ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.nodes[0].combo).toBe('proj')
  })

  it('maps edge types to correct styles', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'task', id: 'a', title: 'A', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
        { kind: 'task', id: 'b', title: 'B', status: 'blocked', priority: 'high', blocked_by: 'a', project: 'p', ref: { file: '' } },
      ],
      relationships: [
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'blocks' },
      ],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].id).toBe('a-blocks-b')
    expect(result.edges[0].source).toBe('a')
    expect(result.edges[0].target).toBe('b')
    expect(result.edges[0].style?.stroke).toBe('#ef4444')
    expect(result.edges[0].style?.lineWidth).toBe(2)
  })

  it('maps dashed edge styles correctly', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'task', id: 'a', title: 'A', status: 'done', priority: 'high', project: 'p', ref: { file: '' } },
        { kind: 'task', id: 'b', title: 'B', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
      ],
      relationships: [
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'unblocks' },
      ],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.edges[0].style?.stroke).toBe('#22c55e')
    expect(result.edges[0].style?.lineDash).toEqual([5, 5])
  })

  it('excludes belongs_to from edges (handled by combos)', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'project', slug: 'p', name: 'P', status: 'active', ref: { file: '' } },
        { kind: 'task', id: '01A', title: 'T', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
      ],
      relationships: [
        { from: { kind: 'task', id: '01A' }, to: { kind: 'project', id: 'p' }, type: 'belongs_to' },
      ],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.edges).toHaveLength(0)
  })

  it('extracts correct labels from different entity kinds', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'task', id: 't1', title: 'My Task', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
        { kind: 'person', id: 'p1', name: 'Alice', projects: [], ref: { file: '' } },
        { kind: 'note', id: 'n1', filename: 'note.md', title: 'My Note', type: 'thought', twin_synced: false, people: [], ref: { file: '' } },
        { kind: 'delivery', id: 'd1', slug: 'del', title: 'My Delivery', type: 'doc', status: 'draft', project: 'p', ref: { file: '' } },
        { kind: 'session', id: 's1', target: 'chat', objective: 'Test session', status: 'active', ref: { file: '' } },
        { kind: 'open_question', id: 'q1', question: 'Why this?', project: 'p', status: 'open', ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.nodes.find(n => n.id === 't1')?.data.label).toBe('My Task')
    expect(result.nodes.find(n => n.id === 'p1')?.data.label).toBe('Alice')
    expect(result.nodes.find(n => n.id === 'n1')?.data.label).toBe('My Note')
    expect(result.nodes.find(n => n.id === 'd1')?.data.label).toBe('My Delivery')
    expect(result.nodes.find(n => n.id === 's1')?.data.label).toBe('Test session')
    expect(result.nodes.find(n => n.id === 'q1')?.data.label).toBe('Why this?')
  })

  it('sets correct node types for entity kinds', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'task', id: 't1', title: 'T', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
        { kind: 'delivery', id: 'd1', slug: 'del', title: 'D', type: 'doc', status: 'draft', project: 'p', ref: { file: '' } },
        { kind: 'decision', id: 'dc1', title: 'Dec', decision: 'yes', unblocks: [], date: '2024-01-01', project: 'p', status: 'active', ref: { file: '' } },
        { kind: 'note', id: 'n1', filename: 'n.md', title: 'N', type: 'thought', twin_synced: false, people: [], ref: { file: '' } },
        { kind: 'person', id: 'p1', name: 'Bob', projects: [], ref: { file: '' } },
        { kind: 'open_question', id: 'q1', question: 'Q', project: 'p', status: 'open', ref: { file: '' } },
        { kind: 'session', id: 's1', target: 'chat', objective: 'S', status: 'active', ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.nodes.find(n => n.id === 't1')?.type).toBe('circle')
    expect(result.nodes.find(n => n.id === 'd1')?.type).toBe('diamond')
    expect(result.nodes.find(n => n.id === 'dc1')?.type).toBe('hexagon')
    expect(result.nodes.find(n => n.id === 'n1')?.type).toBe('rect')
    expect(result.nodes.find(n => n.id === 'p1')?.type).toBe('circle')
    expect(result.nodes.find(n => n.id === 'q1')?.type).toBe('triangle')
    expect(result.nodes.find(n => n.id === 's1')?.type).toBe('rect')
  })

  it('handles empty graph', () => {
    const graph: WorkGraph = {
      entities: [],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    expect(result.combos).toHaveLength(0)
  })

  it('maps all edge relationship types', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'task', id: 'a', title: 'A', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
        { kind: 'task', id: 'b', title: 'B', status: 'todo', priority: 'high', project: 'p', ref: { file: '' } },
      ],
      relationships: [
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'informs' },
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'delivers' },
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'involves' },
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'supersedes' },
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'raises' },
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'produces' },
      ],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const result = workGraphToG6(graph)
    expect(result.edges).toHaveLength(6)

    const informs = result.edges.find(e => e.data.relType === 'informs')
    expect(informs?.style?.stroke).toBe('#9ca3af')
    expect(informs?.style?.lineWidth).toBe(1)

    const delivers = result.edges.find(e => e.data.relType === 'delivers')
    expect(delivers?.style?.stroke).toBe('#a855f7')
    expect(delivers?.style?.lineWidth).toBe(1.5)

    const involves = result.edges.find(e => e.data.relType === 'involves')
    expect(involves?.style?.stroke).toBe('#f97316')
    expect(involves?.style?.lineDash).toEqual([2, 2])

    const supersedes = result.edges.find(e => e.data.relType === 'supersedes')
    expect(supersedes?.style?.stroke).toBe('#9ca3af')
    expect(supersedes?.style?.lineDash).toEqual([5, 5])

    const raises = result.edges.find(e => e.data.relType === 'raises')
    expect(raises?.style?.stroke).toBe('#eab308')
    expect(raises?.style?.lineWidth).toBe(1)

    const produces = result.edges.find(e => e.data.relType === 'produces')
    expect(produces?.style?.stroke).toBe('#ec4899')
    expect(produces?.style?.lineWidth).toBe(1)
  })
})
