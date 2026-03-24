/**
 * NoteEditor — Split view note editor with chat assistant.
 *
 * Left pane: title, type, twin_synced, linked delivery, markdown body, save.
 * Right pane: NoteChat scoped to this note + project.
 */

import { useState, useEffect, useCallback } from 'react'
import { writeNote } from '@/lib/fs'
import { parseNote, stringifyNote } from '@/lib/frontmatter'
import { NoteChat } from '@/components/NoteChat'
import type { WorkGraph } from '@/types/graph'
import type { Note, DeliveryEntity } from '@/types/entities'
import type { NoteType } from '@/types/common'

interface NoteEditorProps {
  projectSlug: string
  noteFilename: string
  graph: WorkGraph
  onSave: () => void
  onBack: () => void
}

const NOTE_TYPES: NoteType[] = [
  'thought', 'meeting', 'decision', 'reference', 'chat_learning', 'conversation',
]

export function NoteEditor({ projectSlug, noteFilename, graph, onSave, onBack }: NoteEditorProps) {
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [title, setTitle] = useState('')
  const [type, setType] = useState<NoteType>('thought')
  const [twinSynced, setTwinSynced] = useState(true)
  const [linkedDelivery, setLinkedDelivery] = useState<string | undefined>(undefined)
  const [body, setBody] = useState('')

  // Project deliveries for the picker
  const deliveries = graph.entities.filter(
    (e): e is DeliveryEntity => e.kind === 'delivery' && e.project === projectSlug,
  )

  // Load note from file
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const { join } = await import('@tauri-apps/api/path')
        const paths = await import('@/lib/paths')
        const notesDir = await paths.projectNotesPath(projectSlug)
        const filePath = await join(notesDir, noteFilename)
        const content = await readTextFile(filePath)
        const parsed = parseNote(content, noteFilename)

        if (cancelled) return

        setNote(parsed)
        setTitle(parsed.title)
        setType(parsed.type)
        setTwinSynced(parsed.twin_synced)
        setLinkedDelivery(parsed.linked_delivery)
        setBody(parsed.body)
      } catch (err) {
        if (!cancelled) {
          console.error('[NoteEditor] Failed to load note:', err)
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectSlug, noteFilename])

  const handleSave = useCallback(async () => {
    if (!note) return
    setSaving(true)
    setError(null)
    try {
      const updated: Note = {
        ...note,
        title,
        type,
        twin_synced: twinSynced,
        linked_delivery: linkedDelivery || undefined,
        body,
        updated: new Date().toISOString(),
      }
      await writeNote(projectSlug, noteFilename, stringifyNote(updated))
      setNote(updated)
      onSave()
    } catch (err) {
      console.error('[NoteEditor] Failed to save:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [note, title, type, twinSynced, linkedDelivery, body, projectSlug, noteFilename, onSave])

  const handleSaveToNote = useCallback((text: string) => {
    setBody((prev) => {
      const separator = prev.trim() ? '\n\n' : ''
      return prev + separator + text
    })
  }, [])

  // Build a current Note object for the chat (reflects latest edits)
  const currentNote: Note | null = note
    ? { ...note, title, type, twin_synced: twinSynced, linked_delivery: linkedDelivery, body }
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading note...</p>
      </div>
    )
  }

  if (error && !note) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Back to notes
        </button>
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">Failed to load note: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Back to notes
        </button>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-red-600">{error}</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Split view */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left pane — Editor */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="w-full text-2xl font-bold text-gray-900 border-0 border-b border-gray-200 pb-2 mb-4 focus:outline-none focus:border-blue-400 bg-transparent"
          />

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {/* Type selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NoteType)}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Twin synced */}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={twinSynced}
                onChange={(e) => setTwinSynced(e.target.checked)}
                className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
              />
              Twin synced
            </label>

            {/* Linked delivery */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Delivery</label>
              <select
                value={linkedDelivery ?? ''}
                onChange={(e) => setLinkedDelivery(e.target.value || undefined)}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">None</option>
                {deliveries.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Markdown body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your note in markdown..."
            className="flex-1 w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-800 font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none min-h-[300px]"
          />
        </div>

        {/* Right pane — Chat */}
        <div className="w-96 flex-shrink-0 flex flex-col border-l border-gray-200 pl-6 min-h-0">
          {currentNote && (
            <NoteChat
              note={currentNote}
              projectSlug={projectSlug}
              graph={graph}
              onSaveToNote={handleSaveToNote}
            />
          )}
        </div>
      </div>
    </div>
  )
}
