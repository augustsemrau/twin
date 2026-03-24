/**
 * GraphControls — Toolbar for filtering and searching the work graph.
 *
 * Sits above the graph view. Provides entity kind toggles, status/relationship
 * dropdowns, and a search input.
 */

import type { RelationshipType } from '@/types/graph'

export type EntityKind = 'task' | 'delivery' | 'decision' | 'note' | 'person' | 'open_question' | 'session'

export interface GraphControlsProps {
  onFilterKinds: (kinds: Set<EntityKind>) => void
  onFilterStatus: (status: string | null) => void
  onFilterRelationship: (relType: string | null) => void
  onSearch: (query: string) => void
  activeKinds: Set<EntityKind>
  activeStatus: string | null
  activeRelType: string | null
  searchQuery: string
}

const ALL_KINDS: { kind: EntityKind; label: string }[] = [
  { kind: 'task', label: 'Tasks' },
  { kind: 'delivery', label: 'Deliveries' },
  { kind: 'decision', label: 'Decisions' },
  { kind: 'note', label: 'Notes' },
  { kind: 'person', label: 'People' },
  { kind: 'open_question', label: 'Questions' },
]

const ALL_STATUSES = [
  'todo', 'in_progress', 'blocked', 'done',
  'active', 'superseded',
  'draft', 'in_review', 'delivered', 'archived',
  'open', 'resolved',
]

const ALL_RELATIONSHIPS: RelationshipType[] = [
  'blocks', 'unblocks', 'delivers', 'involves',
  'supersedes', 'informs', 'raises', 'produces',
]

export function GraphControls({
  onFilterKinds,
  onFilterStatus,
  onFilterRelationship,
  onSearch,
  activeKinds,
  activeStatus,
  activeRelType,
  searchQuery,
}: GraphControlsProps) {
  function toggleKind(kind: EntityKind) {
    const next = new Set(activeKinds)
    if (next.has(kind)) {
      next.delete(kind)
    } else {
      next.add(kind)
    }
    onFilterKinds(next)
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg flex-wrap">
      {/* Entity kind toggles */}
      <div className="flex items-center gap-1">
        {ALL_KINDS.map(({ kind, label }) => {
          const isActive = activeKinds.has(kind)
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              className={`
                px-2 py-0.5 rounded text-xs font-medium transition-colors
                ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}
              `}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-300" />

      {/* Status filter */}
      <select
        value={activeStatus ?? ''}
        onChange={(e) => onFilterStatus(e.target.value || null)}
        className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-700"
      >
        <option value="">All statuses</option>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
        ))}
      </select>

      {/* Relationship filter */}
      <select
        value={activeRelType ?? ''}
        onChange={(e) => onFilterRelationship(e.target.value || null)}
        className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-700"
      >
        <option value="">All relationships</option>
        {ALL_RELATIONSHIPS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-300" />

      {/* Search */}
      <input
        type="text"
        placeholder="Search entities..."
        value={searchQuery}
        onChange={(e) => onSearch(e.target.value)}
        className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-700 w-44 placeholder:text-gray-400"
      />
    </div>
  )
}
