import { useState, useEffect, useRef } from 'react'
import type { ProposedObservation } from '@/types/agents'
import type { Confidence } from '@/types/common'
import type { DeltaOperation } from '@/types/deltas'
import { StatusBadge } from './StatusBadge'

// ---------------------------------------------------------------------------
// describeDelta helper
// ---------------------------------------------------------------------------

export function describeDelta(delta: DeltaOperation | null): string {
  if (delta === null) return 'No action'

  switch (delta.op) {
    case 'create_task':
      return `Create task: ${delta.payload.title}`
    case 'update_task_status':
      return `Set ${delta.task_id} → ${delta.status}`
    case 'mark_blocked':
      return `Block task ${delta.task_id}`
    case 'mark_unblocked':
      return `Unblock task ${delta.task_id}`
    case 'append_decision':
      return `Add decision: ${delta.payload.title}`
    case 'supersede_decision':
      return `Supersede decision ${delta.old_id} with ${delta.new_id}`
    case 'create_delivery':
      return `Create delivery: ${delta.payload.title}`
    case 'update_delivery_status':
      return `Set delivery ${delta.delivery_id} → ${delta.status}`
    case 'create_note':
      return `Create note: ${delta.payload.title}`
    case 'add_open_question':
      return `Add question: ${delta.payload.question}`
    case 'resolve_question':
      return `Resolve question ${delta.question_id}`
    case 'link_note_delivery':
      return `Link note ${delta.note_id} → delivery ${delta.delivery_id}`
    case 'upsert_person':
      return `Upsert person: ${delta.payload.name}`
    case 'archive_project':
      return `Archive project: ${delta.project_slug}`
    default: {
      ;((_: never) => {})(delta)
      return 'Unknown operation'
    }
  }
}

// ---------------------------------------------------------------------------
// ObservationCard
// ---------------------------------------------------------------------------

interface ObservationCardProps {
  observation: ProposedObservation
  checked: boolean
  onChange: (checked: boolean) => void
  highlightEvidence: boolean
}

function ObservationCard({ observation, checked, onChange, highlightEvidence }: ObservationCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-blue-600"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <StatusBadge value={observation.observation_type} size="sm" />
          <span className="text-sm font-semibold text-gray-800">{observation.summary}</span>
        </div>
        {observation.evidence && (
          <p
            className={`text-xs italic text-gray-500 ${
              highlightEvidence ? 'rounded bg-yellow-50 px-1 py-0.5' : ''
            }`}
          >
            &ldquo;{observation.evidence}&rdquo;
          </p>
        )}
        <p className="font-mono text-xs text-gray-400">
          {describeDelta(observation.proposed_delta)}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DeltaReview
// ---------------------------------------------------------------------------

interface DeltaReviewProps {
  observations: ProposedObservation[]
  confidence: Confidence
  onAccept: (selected: ProposedObservation[]) => void
  onDiscard: () => void
  onEdit?: (index: number, edited: ProposedObservation) => void
}

const AUTO_APPLY_DELAY_MS = 10_000

export function DeltaReview({
  observations,
  confidence,
  onAccept,
  onDiscard,
}: DeltaReviewProps) {
  // --- high confidence state ---
  const [undone, setUndone] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_APPLY_DELAY_MS / 1000)
  const autoApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // --- medium/low confidence state ---
  const [checked, setChecked] = useState<boolean[]>(() =>
    observations.map(() => confidence !== 'low')
  )

  // Start auto-apply timer for high confidence
  useEffect(() => {
    if (confidence !== 'high' || undone) return

    setCountdown(AUTO_APPLY_DELAY_MS / 1000)

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    autoApplyTimerRef.current = setTimeout(() => {
      onAccept(observations)
    }, AUTO_APPLY_DELAY_MS)

    return () => {
      if (autoApplyTimerRef.current) clearTimeout(autoApplyTimerRef.current)
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }
  }, [confidence, undone, observations, onAccept])

  const handleUndo = () => {
    if (autoApplyTimerRef.current) clearTimeout(autoApplyTimerRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    setUndone(true)
  }

  const handleToggle = (index: number, value: boolean) => {
    setChecked((prev) => prev.map((c, i) => (i === index ? value : c)))
  }

  const selectedObservations = observations.filter((_, i) => checked[i])

  // --- high confidence: auto-apply banner (not yet undone) ---
  if (confidence === 'high' && !undone) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Applied {observations.length} observation{observations.length !== 1 ? 's' : ''}</span>
            {' '}— auto-confirming in {countdown}s
          </p>
          <button
            onClick={handleUndo}
            className="rounded-md border border-blue-400 bg-white px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            Undo
          </button>
        </div>
      </div>
    )
  }

  // --- medium / low / undone high confidence: card list ---
  const isLow = confidence === 'low'

  return (
    <div className="flex flex-col gap-3">
      {isLow && (
        <div className="rounded-md bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-800">
          Review carefully — low confidence
        </div>
      )}

      <div className="space-y-2">
        {observations.map((obs, i) => (
          <ObservationCard
            key={i}
            observation={obs}
            checked={checked[i]}
            onChange={(val) => handleToggle(i, val)}
            highlightEvidence={isLow}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
        <button
          onClick={() => onAccept(selectedObservations)}
          disabled={selectedObservations.length === 0}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Accept selected ({selectedObservations.length})
        </button>
        <button
          onClick={onDiscard}
          className="rounded-md border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Discard all
        </button>
      </div>
    </div>
  )
}
