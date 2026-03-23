import { describe, it, expect } from 'vitest'
import { parseNote, stringifyNote } from './frontmatter'

const sampleNote = `---
id: 01ABC
title: Test Note
type: thought
project: test-project
twin_synced: true
created: 2026-03-17
updated: 2026-03-17
---

This is the body.`

const noteWithOptionals = `---
id: 01DEF
title: Conversation with Thomas
type: conversation
project: test-project
twin_synced: true
linked_delivery: 01XYZ
people:
  - Thomas
  - Jakob
date: 2026-03-17
created: 2026-03-17
updated: 2026-03-17
---

We discussed the infrastructure.`

describe('frontmatter', () => {
  it('parses a note with YAML frontmatter', () => {
    const note = parseNote(sampleNote, 'test-note.md')
    expect(note.id).toBe('01ABC')
    expect(note.title).toBe('Test Note')
    expect(note.type).toBe('thought')
    expect(note.project).toBe('test-project')
    expect(note.twin_synced).toBe(true)
    expect(note.body).toBe('This is the body.')
  })

  it('parses optional fields when present', () => {
    const note = parseNote(noteWithOptionals, 'conv-note.md')
    expect(note.linked_delivery).toBe('01XYZ')
    expect(note.people).toEqual(['Thomas', 'Jakob'])
    expect(note.date).toBe('2026-03-17')
  })

  it('handles missing optional fields', () => {
    const note = parseNote(sampleNote, 'test-note.md')
    expect(note.linked_delivery).toBeUndefined()
    expect(note.people).toBeUndefined()
    expect(note.date).toBeUndefined()
  })

  it('round-trips a note without data loss', () => {
    const note = parseNote(sampleNote, 'test-note.md')
    const output = stringifyNote(note)
    const reparsed = parseNote(output, 'test-note.md')
    expect(reparsed.id).toBe(note.id)
    expect(reparsed.title).toBe(note.title)
    expect(reparsed.type).toBe(note.type)
    expect(reparsed.body).toBe(note.body)
  })

  it('preserves the filename through parse', () => {
    const note = parseNote(sampleNote, 'my-note.md')
    expect(note.filename).toBe('my-note.md')
  })
})
