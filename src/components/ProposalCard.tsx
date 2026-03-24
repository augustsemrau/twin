import type { DeltaOperation } from '@/types/deltas'

interface ProposalCardProps {
  proposal: string
  triggerReason: string
  entityRefs: string[]
  proposedDelta: DeltaOperation | null
  onAccept: () => void
  onDismiss: () => void
}

export function ProposalCard({
  proposal,
  triggerReason,
  onAccept,
  onDismiss,
}: ProposalCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-amber-500">&#9679;</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{proposal}</p>
          <p className="mt-1 text-xs text-gray-500">{triggerReason}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onAccept}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Accept
            </button>
            <button
              onClick={onDismiss}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
