/**
 * ProjectNoteList — Note list view with twin_synced toggle.
 *
 * Shows note cards sorted by updated date. Each card has a
 * twin_synced toggle that reads/writes the note file directly.
 */

import { useState } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import { writeNote } from '@/lib/fs'
import { parseNote, stringifyNote } from '@/lib/frontmatter'
import type { WorkGraph } from '@/types/graph'
import type { NoteEntity } from '@/types/entities'

interface ProjectNoteListProps {
  projectSlug: string
  graph: WorkGraph
  onGraphChanged: () => void
  onOpenNote?: (filename: string) => void
}

export function ProjectNoteList({ projectSlug, graph, onGraphChanged, onOpenNote }: ProjectNoteListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const notes = graph.entities
    .filter((e): e is NoteEntity => e.kind === 'note' && e.project === projectSlug)
    .sort((a, b) => {
      // Sort by filename descending as a proxy for updated date
      // (NoteEntity doesn't have updated, but ref.file ordering works)
      return b.filename.localeCompare(a.filename)
    })

  async function handleToggleSynced(note: NoteEntity) {
    setToggling(note.id)
    try {
      // Read the note file, toggle twin_synced, write back
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const { join } = await import('@tauri-apps/api/path')
      const paths = await import('@/lib/paths')
      const notesDir = await paths.projectNotesPath(projectSlug)
      const filePath = await join(notesDir, note.filename)
      const content = await readTextFile(filePath)

      const parsed = parseNote(content, note.filename)
      parsed.twin_synced = !parsed.twin_synced
      const updated = stringifyNote(parsed)

      await writeNote(projectSlug, note.filename, updated)
      onGraphChanged()
    } catch (err) {
      console.error('[ProjectNoteList] Failed to toggle twin_synced:', err)
    } finally {
      setToggling(null)
    }
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No notes yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div
          key={note.id}
          onClick={() => {
            if (onOpenNote) {
              onOpenNote(note.filename)
            } else {
              setSelectedId(note.id === selectedId ? null : note.id)
            }
          }}
          className={`border rounded-lg p-4 cursor-pointer transition-colors ${
            note.id === selectedId
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">{note.title}</h3>
              <StatusBadge value={note.type} />
            </div>
            <div className="flex items-center gap-4 flex-shrink-0 ml-4">
              <span className="text-xs text-gray-400">{note.filename}</span>
              <label
                className="flex items-center gap-2 text-sm text-gray-600"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={note.twin_synced}
                  onChange={() => handleToggleSynced(note)}
                  disabled={toggling === note.id}
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                />
                Synced
              </label>
            </div>
          </div>
          {note.people.length > 0 && (
            <div className="mt-2 text-xs text-gray-400">
              People: {note.people.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
