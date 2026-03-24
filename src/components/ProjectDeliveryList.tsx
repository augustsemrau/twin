/**
 * ProjectDeliveryList — Delivery list view with inline status editing.
 *
 * Displays deliveries in a table with inline status dropdown
 * that creates validated delta operations.
 */

import { useState } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import { validateDeltas } from '@/lib/validator'
import { applyUpdateDeliveryStatus } from '@/lib/state-updater'
import { writeDeliveries } from '@/lib/fs'
import type { WorkGraph } from '@/types/graph'
import type { DeliveryEntity } from '@/types/entities'
import type { DeliveryStatus } from '@/types/common'
import type { DeltaOperation } from '@/types/deltas'

interface ProjectDeliveryListProps {
  projectSlug: string
  graph: WorkGraph
  onGraphChanged: () => void
}

const STATUS_OPTIONS: DeliveryStatus[] = ['draft', 'in_review', 'delivered', 'archived']

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

export function ProjectDeliveryList({ projectSlug, graph, onGraphChanged }: ProjectDeliveryListProps) {
  const [updating, setUpdating] = useState<string | null>(null)

  const deliveries = graph.entities.filter(
    (e): e is DeliveryEntity => e.kind === 'delivery' && e.project === projectSlug,
  )

  async function handleStatusChange(deliveryId: string, newStatus: DeliveryStatus) {
    const delta: DeltaOperation = {
      op: 'update_delivery_status',
      delivery_id: deliveryId,
      project: projectSlug,
      status: newStatus,
    }

    const result = validateDeltas([delta], graph)
    if (!result.valid) {
      console.error('[ProjectDeliveryList] Validation failed:', result.errors)
      return
    }

    setUpdating(deliveryId)
    try {
      const updated = applyUpdateDeliveryStatus(
        deliveries,
        delta as Extract<DeltaOperation, { op: 'update_delivery_status' }>,
      )
      await writeDeliveries(projectSlug, updated)
      onGraphChanged()
    } catch (err) {
      console.error('[ProjectDeliveryList] Failed to update delivery status:', err)
    } finally {
      setUpdating(null)
    }
  }

  if (deliveries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No deliveries yet</p>
      </div>
    )
  }

  return (
    <div>
      <table className="table-auto w-full">
        <thead>
          <tr className="text-left text-sm text-gray-500 border-b">
            <th className="py-2 px-3">Title</th>
            <th className="py-2 px-3">Type</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Due</th>
            <th className="py-2 px-3">Brief</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id} className="border-b hover:bg-gray-50">
              <td className="py-2 px-3 font-medium text-gray-900">{delivery.title}</td>
              <td className="py-2 px-3">
                <StatusBadge value={delivery.type} />
              </td>
              <td className="py-2 px-3">
                <select
                  value={delivery.status}
                  onChange={(e) => handleStatusChange(delivery.id, e.target.value as DeliveryStatus)}
                  disabled={updating === delivery.id}
                  className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 px-3 text-sm text-gray-600">
                {delivery.due_date ?? '-'}
              </td>
              <td className="py-2 px-3 text-sm text-gray-500">
                {delivery.brief ? truncate(delivery.brief, 60) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
