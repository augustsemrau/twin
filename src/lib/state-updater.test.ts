import { describe, it, expect } from 'vitest'
import {
  applyCreateTask,
  applyUpdateTaskStatus,
  applyMarkBlocked,
  applyMarkUnblocked,
  applyAppendDecision,
  applySupersede,
  applyCreateDelivery,
  applyUpdateDeliveryStatus,
  applyCreateNote,
  applyUpsertPerson,
  applyAddOpenQuestion,
  applyResolveQuestion,
} from './state-updater'
import { parseTasks, parseDeliveries, parseDecisions, parsePeople } from './fs'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

describe('state-updater', () => {
  describe('tasks', () => {
    it('creates a new task with generated ULID', () => {
      const tasks = parseTasks(fixture('tasks.yaml'), 'p')
      const result = applyCreateTask(tasks, {
        op: 'create_task',
        payload: {
          id: '',
          title: 'New task',
          status: 'todo',
          priority: 'medium',
          due_date: null as unknown as string,
          blocked_by: null as unknown as string,
          waiting_on: null as unknown as string,
          project: 'p',
          delivery: null as unknown as string,
        },
      })
      expect(result).toHaveLength(tasks.length + 1)
      const newTask = result[result.length - 1]
      expect(newTask.id).toBeTruthy()
      expect(newTask.id).not.toBe('')
      expect(newTask.title).toBe('New task')
      expect(newTask.kind).toBe('task')
    })

    it('preserves existing id if provided', () => {
      const tasks = parseTasks(fixture('tasks.yaml'), 'p')
      const result = applyCreateTask(tasks, {
        op: 'create_task',
        payload: {
          id: 'CUSTOM_ID',
          title: 'T',
          status: 'todo',
          priority: 'low',
          due_date: null as unknown as string,
          blocked_by: null as unknown as string,
          waiting_on: null as unknown as string,
          project: 'p',
          delivery: null as unknown as string,
        },
      })
      expect(result[result.length - 1].id).toBe('CUSTOM_ID')
    })

    it('updates task status by id', () => {
      const tasks = parseTasks(fixture('tasks.yaml'), 'p')
      const result = applyUpdateTaskStatus(tasks, {
        op: 'update_task_status',
        task_id: '01JBQF3A1K',
        project: 'p',
        status: 'done',
      })
      const updated = result.find((t) => t.id === '01JBQF3A1K')
      expect(updated!.status).toBe('done')
      // Other tasks unchanged
      expect(result.find((t) => t.id === '01JBQF3B2M')!.status).toBe('blocked')
    })

    it('does not mutate original array', () => {
      const tasks = parseTasks(fixture('tasks.yaml'), 'p')
      const original = tasks[0].status
      applyUpdateTaskStatus(tasks, {
        op: 'update_task_status',
        task_id: '01JBQF3A1K',
        project: 'p',
        status: 'done',
      })
      expect(tasks[0].status).toBe(original)
    })

    it('marks task as blocked', () => {
      const tasks = parseTasks(fixture('tasks.yaml'), 'p')
      const result = applyMarkBlocked(tasks, {
        op: 'mark_blocked',
        task_id: '01JBQF3A1K',
        project: 'p',
        blocked_by: 'Something',
        waiting_on: 'Someone',
      })
      const updated = result.find((t) => t.id === '01JBQF3A1K')
      expect(updated!.status).toBe('blocked')
      expect(updated!.blocked_by).toBe('Something')
      expect(updated!.waiting_on).toBe('Someone')
    })

    it('unblocks a task', () => {
      const tasks = parseTasks(fixture('tasks.yaml'), 'p')
      const result = applyMarkUnblocked(tasks, {
        op: 'mark_unblocked',
        task_id: '01JBQF3B2M',
        project: 'p',
      })
      const updated = result.find((t) => t.id === '01JBQF3B2M')
      expect(updated!.status).toBe('todo')
      expect(updated!.blocked_by).toBeNull()
      expect(updated!.waiting_on).toBeNull()
    })
  })

  describe('decisions', () => {
    it('appends a new decision', () => {
      const decisions = parseDecisions(fixture('decisions.yaml'), 'p')
      const result = applyAppendDecision(decisions, {
        op: 'append_decision',
        payload: {
          id: '',
          title: 'New Decision',
          decision: 'We decided X',
          rationale: 'Because Y',
          unblocks: [],
          date: '2026-03-20',
          decided_by: 'August',
          project: 'p',
          status: 'active',
          superseded_by: null as unknown as string,
        },
      })
      expect(result).toHaveLength(decisions.length + 1)
      expect(result[result.length - 1].id).toBeTruthy()
    })

    it('supersedes a decision atomically', () => {
      const decisions = parseDecisions(fixture('decisions.yaml'), 'p')
      const result = applySupersede(decisions, {
        op: 'supersede_decision',
        old_id: '01JBQFA1K2',
        new_id: '01JBQFA2M3',
        project: 'p',
      })
      const old = result.find((d) => d.id === '01JBQFA1K2')
      expect(old!.status).toBe('superseded')
      expect(old!.superseded_by).toBe('01JBQFA2M3')
    })
  })

  describe('deliveries', () => {
    it('creates a new delivery', () => {
      const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'p')
      const result = applyCreateDelivery(deliveries, {
        op: 'create_delivery',
        payload: {
          id: '',
          slug: 'new-delivery',
          title: 'New',
          type: 'doc',
          status: 'draft',
          due_date: null as unknown as string,
          brief: null as unknown as string,
          project: 'p',
        },
      })
      expect(result).toHaveLength(deliveries.length + 1)
    })

    it('updates delivery status', () => {
      const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'p')
      const result = applyUpdateDeliveryStatus(deliveries, {
        op: 'update_delivery_status',
        delivery_id: '01JBQF9M3P',
        project: 'p',
        status: 'delivered',
      })
      expect(result.find((d) => d.id === '01JBQF9M3P')!.status).toBe('delivered')
    })
  })

  describe('people', () => {
    it('adds a new person', () => {
      const people = parsePeople(fixture('people.yaml'))
      const result = applyUpsertPerson(people, {
        op: 'upsert_person',
        payload: { id: '', name: 'New Person', role: 'Dev', projects: ['p'] },
      })
      expect(result).toHaveLength(people.length + 1)
      expect(result[result.length - 1].name).toBe('New Person')
    })

    it('updates existing person by id', () => {
      const people = parsePeople(fixture('people.yaml'))
      const result = applyUpsertPerson(people, {
        op: 'upsert_person',
        payload: {
          id: '01JBQFB1A1',
          name: 'Thomas Updated',
          role: 'Senior Lead',
          projects: ['municipality-platform'],
        },
      })
      expect(result).toHaveLength(people.length) // no new entry
      expect(result.find((p) => p.id === '01JBQFB1A1')!.name).toBe('Thomas Updated')
    })
  })

  describe('notes and questions', () => {
    it('creates a note entity with content', () => {
      const result = applyCreateNote({
        op: 'create_note',
        payload: {
          id: '',
          filename: 'test.md',
          title: 'Test',
          type: 'thought',
          project: 'p',
          twin_synced: true,
          people: [],
        },
        body: 'Note content here',
      })
      expect(result.entity.kind).toBe('note')
      expect(result.entity.id).toBeTruthy()
      expect(result.content).toContain('Note content here')
      expect(result.content).toContain('title: Test')
    })

    it('creates an open question', () => {
      const result = applyAddOpenQuestion({
        op: 'add_open_question',
        payload: {
          id: '',
          question: 'Why is the sky blue?',
          project: 'p',
          source_note: '01ABC',
          status: 'open',
        },
      })
      expect(result.kind).toBe('open_question')
      expect(result.id).toBeTruthy()
      expect(result.question).toBe('Why is the sky blue?')
    })

    it('resolves an open question', () => {
      const questions = [
        {
          kind: 'open_question' as const,
          id: '01Q',
          question: 'Q?',
          project: 'p',
          source_note: null as unknown as string,
          status: 'open' as const,
          ref: { file: '' },
        },
      ]
      const result = applyResolveQuestion(questions, {
        op: 'resolve_question',
        question_id: '01Q',
        project: 'p',
      })
      expect(result[0].status).toBe('resolved')
    })
  })
})
