import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildContextPack, getProjectEntities, formatEntityList, buildWritebackSection } from './composer'
import { parseTasks, parseDeliveries, parseDecisions, parsePeople, parseNotes } from './fs'
import { buildGraphFromEntities } from './graph-builder'
import type { ProjectEntity, OpenQuestionEntity } from '@/types/entities'
import type { WorkGraph } from '@/types/graph'

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

const globalContext =
  'I am August, a senior consultant at Trustworks. I work on AI and data platform projects for public sector clients. My preferred tools are Claude, Polars, and TypeScript.'
const projectSlug = 'municipality-platform'

describe('buildContextPack', () => {
  const graph = buildTestGraph()

  it('generates a valid session ULID', () => {
    const pack = buildContextPack({
      target: 'chat',
      objective: 'Test objective',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.session_id).toBeTruthy()
    expect(pack.session_id.length).toBeGreaterThan(10)
  })

  it('builds Chat brief with correct sections', () => {
    const pack = buildContextPack({
      target: 'chat',
      objective: 'Evaluate data framework options',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.brief_markdown).toContain('Context for this thinking session')
    expect(pack.brief_markdown).toContain('Objective:')
    expect(pack.brief_markdown).toContain('Evaluate data framework options')
    expect(pack.brief_markdown).toContain('Decisions already made')
    expect(pack.brief_markdown).toContain('Session writeback instructions')
  })

  it('builds Code brief with correct sections', () => {
    const pack = buildContextPack({
      target: 'code',
      objective: 'Implement pipeline layer',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.brief_markdown).toContain('Role & expertise')
    expect(pack.brief_markdown).toContain('Current focus')
    expect(pack.brief_markdown).toContain('Pick up here')
    expect(pack.brief_markdown).toContain('tasks.yaml')
  })

  it('builds Cowork brief with delivery details', () => {
    const pack = buildContextPack({
      target: 'cowork',
      objective: 'Draft Q2 pitch deck',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.brief_markdown).toContain('Delivery brief')
    expect(pack.brief_markdown).toContain('What to produce')
  })

  it('includes entity ID mapping in writeback section', () => {
    const pack = buildContextPack({
      target: 'code',
      objective: 'Test',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.brief_markdown).toContain('01JBQF3A1K')
    expect(pack.brief_markdown).toContain('Finalise Q2 pitch structure')
    expect(pack.entity_id_map['01JBQF3A1K']).toBe('Finalise Q2 pitch structure')
  })

  it('includes writeback contract with correct session ID', () => {
    const pack = buildContextPack({
      target: 'chat',
      objective: 'Test',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.writeback_contract.session_id).toBe(pack.session_id)
    expect(pack.writeback_contract.writeback_file).toContain(pack.session_id)
    expect(pack.writeback_contract.schema_version).toBe('1.0')
  })

  it('only includes active decisions (not superseded)', () => {
    const pack = buildContextPack({
      target: 'chat',
      objective: 'Test',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.brief_markdown).toContain('On-premise inference confirmed')
    expect(pack.brief_markdown).not.toContain('Cloud inference considered')
  })

  it('includes tasks ordered by priority in Code brief', () => {
    const pack = buildContextPack({
      target: 'code',
      objective: 'Test',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    // High priority tasks should appear before low priority tasks
    const highIdx = pack.brief_markdown.indexOf('Finalise Q2 pitch structure')
    const lowIdx = pack.brief_markdown.indexOf('Set up Polars dev environment')
    expect(highIdx).toBeGreaterThan(-1)
    expect(lowIdx).toBeGreaterThan(-1)
    expect(highIdx).toBeLessThan(lowIdx)
  })

  it('includes open questions in Chat brief', () => {
    const pack = buildContextPack({
      target: 'chat',
      objective: 'Test',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.brief_markdown).toContain('Which data framework to use?')
  })

  it('includes blocked items in Code brief', () => {
    const pack = buildContextPack({
      target: 'code',
      objective: 'Test',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.brief_markdown).toContain('Blocked items')
    expect(pack.brief_markdown).toContain('Architecture diagram')
  })

  it('sets created_at timestamp', () => {
    const pack = buildContextPack({
      target: 'chat',
      objective: 'Test',
      selectedSources: [],
      graph,
      globalContext,
      projectSlug,
    })
    expect(pack.created_at).toBeTruthy()
    expect(new Date(pack.created_at).getTime()).toBeGreaterThan(0)
  })
})

describe('getProjectEntities', () => {
  const graph = buildTestGraph()

  it('filters entities for a specific project', () => {
    const entities = getProjectEntities(graph, 'municipality-platform')
    // Should include tasks, deliveries, decisions, notes, open_questions for this project
    expect(entities.length).toBeGreaterThan(0)
    entities.forEach((e) => {
      if ('project' in e && e.project) {
        expect(e.project).toBe('municipality-platform')
      }
    })
  })
})

describe('formatEntityList', () => {
  it('formats tasks as markdown list with IDs', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'municipality-platform')
    const result = formatEntityList(tasks, 'task')
    expect(result).toContain('01JBQF3A1K')
    expect(result).toContain('Finalise Q2 pitch structure')
    expect(result).toContain('- ')
  })

  it('formats decisions as markdown list with IDs', () => {
    const decisions = parseDecisions(fixture('decisions.yaml'), 'municipality-platform')
    const active = decisions.filter((d) => d.status === 'active')
    const result = formatEntityList(active, 'decision')
    expect(result).toContain('01JBQFA2M3')
    expect(result).toContain('On-premise inference confirmed')
  })

  it('returns "None" for empty list', () => {
    const result = formatEntityList([], 'task')
    expect(result).toBe('None')
  })
})

describe('buildWritebackSection', () => {
  it('includes session ID and file path', () => {
    const section = buildWritebackSection('01TEST123', {
      '01JBQF3A1K': 'Finalise Q2 pitch structure',
    })
    expect(section).toContain('01TEST123')
    expect(section).toContain('~/twin/sessions/01TEST123-manifest.yaml')
    expect(section).toContain('writeback-schema.yaml')
  })

  it('includes entity ID mapping', () => {
    const section = buildWritebackSection('01TEST123', {
      '01JBQF3A1K': 'Finalise Q2 pitch structure',
      '01JBQF9M3P': 'Q2 pitch deck',
    })
    expect(section).toContain('01JBQF3A1K')
    expect(section).toContain('Finalise Q2 pitch structure')
    expect(section).toContain('01JBQF9M3P')
    expect(section).toContain('Q2 pitch deck')
  })
})
