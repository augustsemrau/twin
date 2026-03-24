import { useState } from 'react'
import type { ProjectEntity } from '@/types/entities'
import type { NoteType } from '@/types/common'

export interface ManualClassifyProps {
  projects: ProjectEntity[]
  defaultProject?: string
  defaultNoteType?: NoteType
  defaultTitle?: string
  onConfirm: (classification: { project: string; noteType: NoteType; title: string }) => void
  onCancel: () => void
}

const NOTE_TYPES: NoteType[] = ['thought', 'meeting', 'decision', 'reference']

export function ManualClassify({
  projects,
  defaultProject,
  defaultNoteType,
  defaultTitle,
  onConfirm,
  onCancel,
}: ManualClassifyProps) {
  const [project, setProject] = useState(defaultProject ?? projects[0]?.slug ?? '')
  const [noteType, setNoteType] = useState<NoteType>(defaultNoteType ?? 'thought')
  const [title, setTitle] = useState(defaultTitle ?? '')

  const canConfirm = project !== '' && title.trim() !== ''

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({ project, noteType, title: title.trim() })
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Project picker */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Note type selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Title input */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
