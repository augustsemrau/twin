import { useState } from 'react'
import { ulid } from 'ulid'
import type { WorkGraph } from '@/types/graph'
import type { ProjectEntity } from '@/types/entities'
import type { ProposedObservation, ResolverOutput } from '@/types/agents'
import { DeltaReview } from './DeltaReview'
import { runResolver } from '@/lib/resolver'
import { writeNote } from '@/lib/fs'
import { stringifyNote } from '@/lib/frontmatter'
import type { Note } from '@/types/entities'

interface ConversationImportProps {
  graph: WorkGraph
  projects: ProjectEntity[]
  onComplete: (noteId: string) => void
  onCancel: () => void
}

type Phase = 'input' | 'extracting' | 'review'

export function ConversationImport({
  graph,
  projects,
  onComplete,
  onCancel,
}: ConversationImportProps) {
  const [conversationText, setConversationText] = useState('')
  const [selectedProject, setSelectedProject] = useState(projects[0]?.slug ?? '')
  const [phase, setPhase] = useState<Phase>('input')
  const [resolverOutput, setResolverOutput] = useState<ResolverOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExtract = async () => {
    if (!conversationText.trim()) return

    setPhase('extracting')
    setError(null)
    try {
      const result = await runResolver(conversationText.trim(), graph, selectedProject || undefined)
      setResolverOutput(result)
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('input')
    }
  }

  const handleAccept = async (selected: ProposedObservation[]) => {
    const noteId = ulid()
    const now = new Date().toISOString()
    const projectSlug = selectedProject || resolverOutput?.candidate_project || projects[0]?.slug || ''

    // Build the note
    const note: Note = {
      id: noteId,
      filename: `${noteId}.md`,
      title: resolverOutput?.suggested_note_title || 'Chat conversation import',
      type: 'chat_learning',
      project: projectSlug,
      twin_synced: true,
      people: [],
      created: now,
      updated: now,
      body: conversationText.trim(),
    }

    try {
      await writeNote(projectSlug, note.filename, stringifyNote(note))
    } catch (err) {
      console.error('Failed to write conversation note:', err)
    }

    // The selected observations contain proposed_deltas that the parent should apply
    // We pass those through — for now we just complete with the note ID
    void selected
    onComplete(noteId)
  }

  const handleDiscard = () => {
    setPhase('input')
    setResolverOutput(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-auto rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'input' && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Import conversation
            </h2>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Paste conversation text
              </label>
              <textarea
                value={conversationText}
                onChange={(e) => setConversationText(e.target.value)}
                placeholder="Paste the full conversation here..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={12}
              />
            </div>

            {error && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleExtract}
                disabled={!conversationText.trim()}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Extract
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === 'extracting' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm text-gray-600">Extracting observations from conversation...</p>
          </div>
        )}

        {phase === 'review' && resolverOutput && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Review extracted observations
            </h2>
            {resolverOutput.proposed_observations.length === 0 ? (
              <div className="mb-4 rounded-md bg-gray-50 px-3 py-3 text-sm text-gray-600">
                No actionable observations found. The conversation will still be saved as a note.
              </div>
            ) : (
              <DeltaReview
                observations={resolverOutput.proposed_observations}
                confidence={resolverOutput.confidence}
                onAccept={handleAccept}
                onDiscard={handleDiscard}
              />
            )}
            {resolverOutput.proposed_observations.length === 0 && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleAccept([])}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Save as note
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
