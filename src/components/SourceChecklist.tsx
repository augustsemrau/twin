/**
 * SourceChecklist — Entity source selection with checkboxes.
 *
 * Groups entities by kind with select all/deselect all per group.
 */

import type { WorkGraphEntity } from '@/types/entities'
import { StatusBadge } from './StatusBadge'

interface SourceChecklistProps {
  entities: WorkGraphEntity[]
  selected: Set<string>
  onToggle: (id: string) => void
}

type EntityKindGroup = {
  kind: string
  label: string
  entities: Array<WorkGraphEntity & { id: string }>
}

const KIND_ORDER: Record<string, { order: number; label: string }> = {
  task: { order: 0, label: 'Tasks' },
  delivery: { order: 1, label: 'Deliveries' },
  decision: { order: 2, label: 'Decisions' },
  note: { order: 3, label: 'Notes' },
  person: { order: 4, label: 'People' },
  open_question: { order: 5, label: 'Open Questions' },
}

function getEntityId(e: WorkGraphEntity): string | null {
  return 'id' in e ? (e as { id: string }).id : null
}

function getEntityTitle(e: WorkGraphEntity): string {
  if ('title' in e) return (e as { title: string }).title
  if ('name' in e) return (e as { name: string }).name
  if ('question' in e) return (e as { question: string }).question
  return e.kind
}

function getStatusValue(e: WorkGraphEntity): string | null {
  if ('status' in e) return (e as { status: string }).status
  return null
}

function groupByKind(entities: WorkGraphEntity[]): EntityKindGroup[] {
  const groups = new Map<string, Array<WorkGraphEntity & { id: string }>>()

  for (const entity of entities) {
    const id = getEntityId(entity)
    if (!id) continue
    if (!KIND_ORDER[entity.kind]) continue

    const list = groups.get(entity.kind) ?? []
    list.push(entity as WorkGraphEntity & { id: string })
    groups.set(entity.kind, list)
  }

  return Array.from(groups.entries())
    .map(([kind, items]) => ({
      kind,
      label: KIND_ORDER[kind]?.label ?? kind,
      entities: items,
    }))
    .sort((a, b) => (KIND_ORDER[a.kind]?.order ?? 99) - (KIND_ORDER[b.kind]?.order ?? 99))
}

export function SourceChecklist({ entities, selected, onToggle }: SourceChecklistProps) {
  const groups = groupByKind(entities)

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const allIds = group.entities.map((e) => e.id)
        const allSelected = allIds.every((id) => selected.has(id))
        const noneSelected = allIds.every((id) => !selected.has(id))

        return (
          <div key={group.kind}>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {group.label}
                <span className="ml-1 text-gray-400">({group.entities.length})</span>
              </h4>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    for (const id of allIds) {
                      if (!selected.has(id)) onToggle(id)
                    }
                  }}
                  className={`text-blue-600 hover:text-blue-800 ${allSelected ? 'opacity-50' : ''}`}
                  disabled={allSelected}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    for (const id of allIds) {
                      if (selected.has(id)) onToggle(id)
                    }
                  }}
                  className={`text-blue-600 hover:text-blue-800 ${noneSelected ? 'opacity-50' : ''}`}
                  disabled={noneSelected}
                >
                  Deselect all
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {group.entities.map((entity) => {
                const id = entity.id
                const title = getEntityTitle(entity)
                const status = getStatusValue(entity)
                const isSelected = selected.has(id)

                return (
                  <label
                    key={id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-sm text-gray-800 truncate">{title}</span>
                    {status && <StatusBadge value={status} size="sm" />}
                    <code className="text-[10px] text-gray-400 font-mono shrink-0">
                      {id.slice(0, 10)}
                    </code>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
      {groups.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No entities available</p>
      )}
    </div>
  )
}
