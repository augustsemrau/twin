interface StatusBadgeProps {
  value: string
  size?: 'sm' | 'md'
}

const COLOR_MAP: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
  done: 'bg-green-100 text-green-700',
  active: 'bg-teal-100 text-teal-700',
  superseded: 'bg-gray-100 text-gray-500',
  draft: 'bg-gray-100 text-gray-600',
  in_review: 'bg-amber-100 text-amber-700',
  delivered: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
  open: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-gray-100 text-gray-500',
  task: 'bg-blue-100 text-blue-700',
  decision: 'bg-teal-100 text-teal-700',
  blocker: 'bg-red-100 text-red-700',
  open_question: 'bg-yellow-100 text-yellow-700',
  note: 'bg-gray-100 text-gray-700',
  person_mentioned: 'bg-orange-100 text-orange-700',
}

const DEFAULT_COLOR = 'bg-gray-100 text-gray-600'

export function StatusBadge({ value, size = 'sm' }: StatusBadgeProps) {
  const colorClass = COLOR_MAP[value] ?? DEFAULT_COLOR
  const sizeClass =
    size === 'sm' ? 'px-2 py-0.5 text-xs font-medium' : 'px-2.5 py-1 text-sm font-medium'
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <span className={`rounded-full ${sizeClass} ${colorClass}`}>
      {label}
    </span>
  )
}
