import { describe, it, expect } from 'vitest'
import {
  parseTasks, parseDeliveries, parseDecisions, parsePeople, parseNotes,
  serializeTasks, serializeDeliveries, serializeDecisions, serializePeople,
  parseInboxContent,
} from './fs'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const fixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

describe('fs parsing', () => {
  it('parses tasks.yaml into TaskEntity[]', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    expect(tasks).toHaveLength(5)
    expect(tasks[0].kind).toBe('task')
    expect(tasks[0].id).toBe('01JBQF3A1K')
    expect(tasks[0].title).toBe('Finalise Q2 pitch structure')
    expect(tasks[0].status).toBe('in_progress')
    expect(tasks[0].priority).toBe('high')
    expect(tasks[0].due_date).toBe('2026-03-21')
    expect(tasks[0].delivery).toBe('01JBQF9M3P')
    expect(tasks[0].project).toBe('test-project')
    expect(tasks[0].ref.file).toBe('projects/test-project/tasks.yaml')
  })

  it('parses blocked task with waiting_on', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    const blocked = tasks.find(t => t.status === 'blocked')
    expect(blocked).toBeDefined()
    expect(blocked!.blocked_by).toBe('Infra cost estimate')
    expect(blocked!.waiting_on).toBe('Thomas')
  })

  it('parses null fields correctly', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    const last = tasks[tasks.length - 1]
    expect(last.due_date).toBeNull()
    expect(last.blocked_by).toBeNull()
    expect(last.delivery).toBeNull()
  })

  it('parses deliveries.yaml into DeliveryEntity[]', () => {
    const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'test-project')
    expect(deliveries).toHaveLength(3)
    expect(deliveries[0].kind).toBe('delivery')
    expect(deliveries[0].id).toBe('01JBQF9M3P')
    expect(deliveries[0].slug).toBe('q2-pitch-deck')
    expect(deliveries[0].type).toBe('deck')
    expect(deliveries[0].status).toBe('in_progress')
  })

  it('parses decisions.yaml into DecisionEntity[]', () => {
    const decisions = parseDecisions(fixture('decisions.yaml'), 'test-project')
    expect(decisions).toHaveLength(3)
    expect(decisions[0].kind).toBe('decision')
    expect(decisions[0].status).toBe('active')
    expect(decisions[0].unblocks).toEqual(['01JBQF3B2M'])
    // Check superseded decision
    const superseded = decisions.find(d => d.status === 'superseded')
    expect(superseded).toBeDefined()
    expect(superseded!.superseded_by).toBe('01JBQFA2M3')
    expect(superseded!.unblocks).toEqual([])
  })

  it('parses people.yaml into PersonEntity[]', () => {
    const people = parsePeople(fixture('people.yaml'))
    expect(people).toHaveLength(3)
    expect(people[0].kind).toBe('person')
    expect(people[0].name).toBe('Thomas')
    expect(people[0].role).toBe('Infrastructure lead')
    expect(people[0].projects).toEqual(['municipality-platform'])
  })

  it('parses note files into NoteEntity[]', () => {
    const content = readFileSync(resolve(__dirname, '../fixtures/notes/2026-03-17-tech-stack-decision.md'), 'utf-8')
    const notes = parseNotes([{ filename: '2026-03-17-tech-stack-decision.md', content }], 'test-project')
    expect(notes).toHaveLength(1)
    expect(notes[0].kind).toBe('note')
    expect(notes[0].id).toBe('01JBQG0A1B')
    expect(notes[0].title).toBe('Tech stack decision')
    expect(notes[0].type).toBe('thought')
    expect(notes[0].twin_synced).toBe(true)
    expect(notes[0].ref.file).toBe('projects/test-project/notes/2026-03-17-tech-stack-decision.md')
  })
})

describe('parseInboxContent', () => {
  it('parses basic inbox file with no resolver output', () => {
    const content = `---\ncaptured: 2026-03-17T09:14:00\nraw: true\nsource: capture\n---\n\nThomas sent the cost estimate\n`
    const item = parseInboxContent(content, 'test-capture.md')
    expect(item.filename).toBe('test-capture.md')
    expect(item.captured).toContain('2026-03-17')
    expect(item.raw).toBe('Thomas sent the cost estimate')
    expect(item.resolver_output).toBeUndefined()
    expect(item.resolver_error).toBeUndefined()
  })

  it('parses inbox file with resolver_output in frontmatter', () => {
    const resolverOutput = {
      candidate_project: 'test-project',
      confidence: 'medium',
      proposed_observations: [],
      suggested_note_type: 'thought',
      suggested_note_title: 'Cost estimate received',
    }
    // The capture system double-JSON-stringifies: JSON.stringify(JSON.stringify(output))
    const content = `---\ncaptured: 2026-03-17T09:14:00\nraw: true\nsource: capture\nresolver_output: ${JSON.stringify(JSON.stringify(resolverOutput))}\n---\n\nThomas sent the cost estimate\n`
    const item = parseInboxContent(content, 'test-capture.md')
    expect(item.resolver_output).toBeDefined()
    expect(item.resolver_output!.candidate_project).toBe('test-project')
    expect(item.resolver_output!.confidence).toBe('medium')
    expect(item.resolver_output!.suggested_note_title).toBe('Cost estimate received')
  })

  it('parses inbox file with resolver_error in frontmatter', () => {
    const content = `---\ncaptured: 2026-03-17T09:14:00\nraw: true\nsource: capture\nresolver_error: "API rate limit exceeded"\n---\n\nSome capture text\n`
    const item = parseInboxContent(content, 'test-capture.md')
    expect(item.resolver_error).toBe('API rate limit exceeded')
    expect(item.resolver_output).toBeUndefined()
  })
})

describe('fs edge cases', () => {
  it('parseNotes returns empty array when given no files', () => {
    const notes = parseNotes([], 'test-project')
    expect(notes).toEqual([])
  })
})

describe('fs serialization', () => {
  it('round-trips tasks through parse -> serialize -> parse', () => {
    const original = parseTasks(fixture('tasks.yaml'), 'test-project')
    const serialized = serializeTasks(original)
    const reparsed = parseTasks(serialized, 'test-project')
    expect(reparsed).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(reparsed[i].id).toBe(original[i].id)
      expect(reparsed[i].title).toBe(original[i].title)
      expect(reparsed[i].status).toBe(original[i].status)
      expect(reparsed[i].delivery).toBe(original[i].delivery)
    }
  })

  it('round-trips deliveries', () => {
    const original = parseDeliveries(fixture('deliveries.yaml'), 'test-project')
    const serialized = serializeDeliveries(original)
    const reparsed = parseDeliveries(serialized, 'test-project')
    expect(reparsed).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(reparsed[i].id).toBe(original[i].id)
      expect(reparsed[i].slug).toBe(original[i].slug)
    }
  })

  it('round-trips decisions preserving unblocks array', () => {
    const original = parseDecisions(fixture('decisions.yaml'), 'test-project')
    const serialized = serializeDecisions(original)
    const reparsed = parseDecisions(serialized, 'test-project')
    expect(reparsed).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(reparsed[i].id).toBe(original[i].id)
      expect(reparsed[i].unblocks).toEqual(original[i].unblocks)
      expect(reparsed[i].status).toBe(original[i].status)
    }
  })

  it('round-trips people', () => {
    const original = parsePeople(fixture('people.yaml'))
    const serialized = serializePeople(original)
    const reparsed = parsePeople(serialized)
    expect(reparsed).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(reparsed[i].name).toBe(original[i].name)
      expect(reparsed[i].projects).toEqual(original[i].projects)
    }
  })
})
