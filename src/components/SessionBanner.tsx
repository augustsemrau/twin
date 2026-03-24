import type { ActiveSession } from '@/types/sessions'
import type { ReconcilerOutput } from '@/types/agents'

interface SessionBannerProps {
  session: ActiveSession
  reconcilerResult: ReconcilerOutput | null
  onMarkDone: () => void
  onImportConversation: () => void
  onReviewDeltas: () => void
}

export function SessionBanner({
  session,
  reconcilerResult,
  onMarkDone,
  onImportConversation,
  onReviewDeltas,
}: SessionBannerProps) {
  const shortId = session.session_id.slice(0, 10) + '...'

  // After manifest received and reconciled
  if (session.writeback_received && reconcilerResult) {
    const deltaCount = reconcilerResult.proposed_deltas.length
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2">
        <p className="text-sm text-green-800">
          <span className="font-semibold">Session reconciled</span>
          {' '}&mdash; {deltaCount} delta{deltaCount !== 1 ? 's' : ''} proposed
          {reconcilerResult.unresolved.length > 0 && (
            <span className="ml-1 text-amber-700">
              ({reconcilerResult.unresolved.length} unresolved)
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onReviewDeltas}
          className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          Review
        </button>
      </div>
    )
  }

  // Chat session — user needs to provide writeback
  if (session.target === 'chat') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
        <p className="text-sm text-blue-800">
          <span className="font-medium">Session {shortId}</span> active (Chat) &mdash;{' '}
          &ldquo;{session.objective}&rdquo;
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onImportConversation}
            className="rounded-md border border-blue-300 bg-white px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            Import conversation
          </button>
          <button
            type="button"
            onClick={onMarkDone}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Mark done
          </button>
        </div>
      </div>
    )
  }

  // Code / Cowork — waiting for manifest
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
      <p className="text-sm text-amber-800">
        <span className="font-medium">Session {shortId}</span> active (
        {session.target === 'code' ? 'Code' : 'Cowork'}) &mdash;{' '}
        &ldquo;{session.objective}&rdquo;
        <span className="ml-2 text-amber-600">Waiting for manifest...</span>
      </p>
      <button
        type="button"
        onClick={onMarkDone}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        Mark done
      </button>
    </div>
  )
}
