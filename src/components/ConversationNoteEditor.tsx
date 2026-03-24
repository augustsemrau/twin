import { useState, useEffect } from 'react'
import { ulid } from 'ulid'
import type { WorkGraph } from '@/types/graph'
import type { PersonEntity, Note } from '@/types/entities'
import type { DeltaOperation } from '@/types/deltas'
import { PeoplePicker } from './PeoplePicker'
import { writeNote, readPeople, writePeople, readDecisions, writeDecisions } from '@/lib/fs'
import { stringifyNote } from '@/lib/frontmatter'
import { applyUpsertPerson, applyAppendDecision } from '@/lib/state-updater'
import { validateDeltas } from '@/lib/validator'

interface ConversationNoteEditorProps {
  projectSlug: string
  graph: WorkGraph
  existingNote?: Note  // for editing existing conversation notes
  onSave: () => void
  onCancel: () => void
}

export function ConversationNoteEditor({
  projectSlug,
  graph,
  existingNote,
  onSave,
  onCancel,
}: ConversationNoteEditorProps) {
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [selectedPeople, setSelectedPeople] = useState<string[]>(existingNote?.people ?? [])
  const [date, setDate] = useState(() => {
    if (existingNote?.date) return existingNote.date
    return new Date().toISOString().split('T')[0]
  })
  const [discussed, setDiscussed] = useState('')
  const [agreed, setAgreed] = useState('')
  const [openQuestions, setOpenQuestions] = useState('')
  const [appendDecisions, setAppendDecisions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load people from graph
  useEffect(() => {
    const graphPeople = graph.entities.filter(
      (e): e is PersonEntity => e.kind === 'person',
    )
    setPeople(graphPeople)
  }, [graph])

  // Populate from existing note body
  useEffect(() => {
    if (!existingNote) return
    const body = existingNote.body
    // Try to parse structured sections
    const discussedMatch = body.match(/## What was discussed\n([\s\S]*?)(?=\n## |$)/)
    const agreedMatch = body.match(/## What was agreed\n([\s\S]*?)(?=\n## |$)/)
    const questionsMatch = body.match(/## Open questions\n([\s\S]*?)(?=\n## |$)/)
    if (discussedMatch) setDiscussed(discussedMatch[1].trim())
    if (agreedMatch) setAgreed(agreedMatch[1].trim())
    if (questionsMatch) setOpenQuestions(questionsMatch[1].trim())
  }, [existingNote])

  const handleAddNewPerson = async (name: string) => {
    const newId = ulid()
    const delta: DeltaOperation = {
      op: 'upsert_person',
      payload: { id: newId, name, projects: [projectSlug] },
    }

    // Validate
    const validation = validateDeltas([delta], graph)
    if (!validation.valid) {
      setError(validation.errors.map((e) => e.reason).join(', '))
      return
    }

    try {
      const currentPeople = await readPeople()
      const updated = applyUpsertPerson(currentPeople, delta as Extract<DeltaOperation, { op: 'upsert_person' }>)
      await writePeople(updated)
      setPeople(updated)
    } catch (err) {
      console.error('Failed to add person:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const noteId = existingNote?.id ?? ulid()
      const now = new Date().toISOString()

      // Build note body with structured sections
      const bodyParts: string[] = []
      if (discussed.trim()) {
        bodyParts.push(`## What was discussed\n${discussed.trim()}`)
      }
      if (agreed.trim()) {
        bodyParts.push(`## What was agreed\n${agreed.trim()}`)
      }
      if (openQuestions.trim()) {
        bodyParts.push(`## Open questions\n${openQuestions.trim()}`)
      }
      const body = bodyParts.join('\n\n')

      const note: Note = {
        id: noteId,
        filename: existingNote?.filename ?? `${noteId}.md`,
        title: `Conversation ${date}${selectedPeople.length > 0 ? ` with ${selectedPeople.join(', ')}` : ''}`,
        type: 'conversation',
        project: projectSlug,
        twin_synced: true,
        people: selectedPeople,
        date,
        created: existingNote?.created ?? now,
        updated: now,
        body,
      }

      await writeNote(projectSlug, note.filename, stringifyNote(note))

      // Append agreed items as decisions if checked
      if (appendDecisions && agreed.trim()) {
        const lines = agreed.trim().split('\n').filter((l) => l.trim())
        const decisions = await readDecisions(projectSlug)
        let currentDecisions = decisions

        for (const line of lines) {
          const decisionText = line.replace(/^[-*]\s*/, '').trim()
          if (!decisionText) continue

          const decisionId = ulid()
          const delta: Extract<DeltaOperation, { op: 'append_decision' }> = {
            op: 'append_decision',
            payload: {
              id: decisionId,
              title: decisionText.length > 80 ? decisionText.slice(0, 80) + '...' : decisionText,
              decision: decisionText,
              rationale: `From conversation on ${date}`,
              unblocks: [],
              date,
              decided_by: selectedPeople.join(', ') || undefined,
              project: projectSlug,
              status: 'active',
            },
          }

          const validation = validateDeltas([delta], graph)
          if (validation.valid) {
            currentDecisions = applyAppendDecision(currentDecisions, delta)
          }
        }

        await writeDecisions(projectSlug, currentDecisions)
      }

      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        {existingNote ? 'Edit conversation note' : 'New conversation note'}
      </h1>

      <div className="space-y-5">
        {/* People picker */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">People</label>
          <PeoplePicker
            people={people}
            selected={selectedPeople}
            onChange={setSelectedPeople}
            onAddNew={handleAddNewPerson}
          />
        </div>

        {/* Date */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Discussed */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            What did you discuss?
          </label>
          <textarea
            value={discussed}
            onChange={(e) => setDiscussed(e.target.value)}
            placeholder="Key topics and context..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={4}
          />
        </div>

        {/* Agreed */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            What was agreed or decided?
          </label>
          <textarea
            value={agreed}
            onChange={(e) => setAgreed(e.target.value)}
            placeholder="One item per line..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={4}
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={appendDecisions}
              onChange={(e) => setAppendDecisions(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Append agreed items to decisions
          </label>
        </div>

        {/* Open questions */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Open questions?
          </label>
          <textarea
            value={openQuestions}
            onChange={(e) => setOpenQuestions(e.target.value)}
            placeholder="Questions that still need answers..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
