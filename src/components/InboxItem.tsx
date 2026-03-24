import { useState } from 'react'
import type { InboxItem as InboxItemType } from '@/types/entities'
import type { ResolverOutput } from '@/types/agents'
import type { ProjectEntity } from '@/types/entities'
import type { DeltaOperation } from '@/types/deltas'
import type { NoteType } from '@/types/common'
import { DeltaReview } from './DeltaReview'
import { ManualClassify } from './ManualClassify'

interface InboxItemProps {
  item: InboxItemType
  resolverOutput?: ResolverOutput
  projects: ProjectEntity[]
  onAccept: (item: InboxItemType, deltas: DeltaOperation[]) => void
  onEdit: (item: InboxItemType, classification: { project: string; noteType: NoteType; title: string }) => void
  onDiscard: (item: InboxItemType) => void
}

export function InboxItem({
  item,
  resolverOutput,
  projects,
  onAccept,
  onEdit,
  onDiscard,
}: InboxItemProps) {
  const [editing, setEditing] = useState(false)

  const hasResolverOutput = resolverOutput != null && !item.resolver_error
  const showDeltaReview = hasResolverOutput && !editing

  // Format timestamp
  const timestamp = item.captured
    ? new Date(item.captured).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      {/* Raw capture text */}
      <div>
        <p className="text-base text-gray-900 leading-relaxed">{item.raw}</p>
        {timestamp && (
          <p className="text-xs text-gray-400 mt-1">{timestamp}</p>
        )}
      </div>

      {/* Resolver error notice */}
      {item.resolver_error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          Resolver failed: {item.resolver_error}
        </div>
      )}

      {/* DeltaReview or ManualClassify */}
      {showDeltaReview && resolverOutput && (
        <DeltaReview
          observations={resolverOutput.proposed_observations}
          confidence={resolverOutput.confidence}
          onAccept={(selected) => {
            const deltas = selected
              .map((obs) => obs.proposed_delta)
              .filter((d): d is DeltaOperation => d !== null)
            onAccept(item, deltas)
          }}
          onDiscard={() => onDiscard(item)}
        />
      )}

      {(!showDeltaReview) && (
        <ManualClassify
          projects={projects}
          defaultProject={resolverOutput?.candidate_project ?? undefined}
          defaultNoteType={resolverOutput?.suggested_note_type}
          defaultTitle={resolverOutput?.suggested_note_title}
          onConfirm={(classification) => onEdit(item, classification)}
          onCancel={() => {
            if (hasResolverOutput) {
              setEditing(false)
            }
          }}
        />
      )}

      {/* Action buttons below the review/classify area */}
      {showDeltaReview && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Edit
          </button>
          <button
            onClick={() => onDiscard(item)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
