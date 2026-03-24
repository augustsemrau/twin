import { describe, it, expect } from 'vitest'
import {
  buildGenerationPrompt,
  markCLAUDEStale,
  markCLAUDEFresh,
  isProjectCLAUDEStale,
} from './claude-generator'
import type { WorkGraph } from '@/types/graph'
import type {
  ProjectEntity,
  TaskEntity,
  DeliveryEntity,
  DecisionEntity,
  NoteEntity,
} from '@/types/entities'

const mockGraph: WorkGraph = {
  entities: [
    {
      kind: 'project',
      slug: 'municipality-platform',
      name: 'Municipality Platform',
      status: 'active',
      ref: { file: 'projects/municipality-platform' },
    } as ProjectEntity,
    {
      kind: 'task',
      id: '01TASK_A',
      title: 'Finalise Q2 pitch structure',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-03-21',
      project: 'municipality-platform',
      delivery: '01DEL_A',
      ref: { file: 'projects/municipality-platform/tasks.yaml' },
    } as TaskEntity,
    {
      kind: 'task',
      id: '01TASK_B',
      title: 'Architecture diagram',
      status: 'blocked',
      priority: 'high',
      due_date: '2026-03-21',
      blocked_by: 'Infra cost estimate',
      waiting_on: 'Thomas',
      project: 'municipality-platform',
      ref: { file: 'projects/municipality-platform/tasks.yaml' },
    } as TaskEntity,
    {
      kind: 'delivery',
      id: '01DEL_A',
      slug: 'q2-pitch-deck',
      title: 'Q2 pitch deck',
      type: 'deck',
      status: 'in_review',
      due_date: '2026-03-21',
      brief: 'Architecture proposal, 3 options, risk section',
      project: 'municipality-platform',
      ref: { file: 'projects/municipality-platform/deliveries.yaml' },
    } as DeliveryEntity,
    {
      kind: 'decision',
      id: '01DEC_A',
      title: 'On-premise inference confirmed',
      decision: 'All LLM inference will run on-prem on the client H100 cluster.',
      rationale: 'Client data governance policy prohibits cloud inference.',
      unblocks: ['01TASK_B'],
      date: '2026-03-14',
      decided_by: 'August',
      project: 'municipality-platform',
      status: 'active',
      ref: { file: 'projects/municipality-platform/decisions.yaml' },
    } as DecisionEntity,
    {
      kind: 'decision',
      id: '01DEC_B',
      title: 'Cloud inference considered',
      decision: 'Evaluate both cloud and on-prem inference.',
      rationale: 'Initial assumption before data governance constraints.',
      unblocks: [],
      date: '2026-03-10',
      decided_by: 'August',
      project: 'municipality-platform',
      status: 'superseded',
      superseded_by: '01DEC_A',
      ref: { file: 'projects/municipality-platform/decisions.yaml' },
    } as DecisionEntity,
    {
      kind: 'note',
      id: '01NOTE_A',
      filename: '2026-03-17-tech-stack-decision.md',
      title: 'Tech stack decision',
      type: 'thought',
      project: 'municipality-platform',
      twin_synced: true,
      people: [],
      ref: { file: 'projects/municipality-platform/notes/2026-03-17-tech-stack-decision.md' },
    } as NoteEntity,
    {
      kind: 'note',
      id: '01NOTE_B',
      filename: '2026-03-18-private-note.md',
      title: 'Private note',
      type: 'thought',
      project: 'municipality-platform',
      twin_synced: false,
      people: [],
      ref: { file: 'projects/municipality-platform/notes/2026-03-18-private-note.md' },
    } as NoteEntity,
  ],
  relationships: [],
  built_at: Date.now(),
  file_mtimes: {},
}

const contextMd = `# Municipality Data Platform

## Client
Danish municipality — public sector data platform modernisation.

## Goal
Replace fragmented data infrastructure with a unified pipeline and inference layer.

## Key constraints
- All LLM inference on-prem (data governance)
- Stakeholder Jakob is risk-averse
- Friday EOD hard deadline for Q2 pitch`

const notesSummaries = [
  { title: 'Tech stack decision', body: 'We are choosing between Polars + DuckDB vs Spark for the pipeline layer. The client has on-prem H100s.' },
]

describe('claude-generator', () => {
  it('builds generation prompt with project context', () => {
    const prompt = buildGenerationPrompt('municipality-platform', mockGraph, contextMd, notesSummaries)

    expect(prompt.system).toContain('CLAUDE.md')
    expect(prompt.userMessage).toContain('Municipality Data Platform')
    expect(prompt.userMessage).toContain('municipality-platform')
    expect(prompt.userMessage).toContain('context.md')
  })

  it('builds prompt with active decisions only (excludes superseded)', () => {
    const prompt = buildGenerationPrompt('municipality-platform', mockGraph, contextMd, notesSummaries)

    // Active decision should be included
    expect(prompt.userMessage).toContain('On-premise inference confirmed')
    expect(prompt.userMessage).toContain('01DEC_A')

    // Superseded decision should NOT be included
    expect(prompt.userMessage).not.toContain('Cloud inference considered')
    expect(prompt.userMessage).not.toContain('01DEC_B')
  })

  it('includes tasks with IDs', () => {
    const prompt = buildGenerationPrompt('municipality-platform', mockGraph, contextMd, notesSummaries)

    expect(prompt.userMessage).toContain('01TASK_A')
    expect(prompt.userMessage).toContain('Finalise Q2 pitch structure')
    expect(prompt.userMessage).toContain('01TASK_B')
    expect(prompt.userMessage).toContain('Architecture diagram')
    expect(prompt.userMessage).toContain('blocked')
  })

  it('includes twin-synced notes (title + first 200 chars)', () => {
    const prompt = buildGenerationPrompt('municipality-platform', mockGraph, contextMd, notesSummaries)

    // Twin-synced note should appear
    expect(prompt.userMessage).toContain('Tech stack decision')
    expect(prompt.userMessage).toContain('Polars + DuckDB')

    // Non-synced note should not appear
    expect(prompt.userMessage).not.toContain('Private note')
  })

  it('includes deliveries', () => {
    const prompt = buildGenerationPrompt('municipality-platform', mockGraph, contextMd, notesSummaries)

    expect(prompt.userMessage).toContain('Q2 pitch deck')
    expect(prompt.userMessage).toContain('01DEL_A')
    expect(prompt.userMessage).toContain('in_review')
  })

  it('stale flag tracks per project', () => {
    markCLAUDEFresh('project-a')
    markCLAUDEFresh('project-b')

    markCLAUDEStale('project-a')

    expect(isProjectCLAUDEStale('project-a')).toBe(true)
    expect(isProjectCLAUDEStale('project-b')).toBe(false)
  })

  it('markCLAUDEStale sets flag, markCLAUDEFresh clears it', () => {
    markCLAUDEFresh('test-project')
    expect(isProjectCLAUDEStale('test-project')).toBe(false)

    markCLAUDEStale('test-project')
    expect(isProjectCLAUDEStale('test-project')).toBe(true)

    markCLAUDEFresh('test-project')
    expect(isProjectCLAUDEStale('test-project')).toBe(false)
  })

  it('unknown project is considered stale by default', () => {
    expect(isProjectCLAUDEStale('never-seen-before')).toBe(true)
  })
})
