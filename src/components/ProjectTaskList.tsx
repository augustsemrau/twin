/**
 * ProjectTaskList — Task list view for a project with inline status editing.
 *
 * Displays tasks in a table with filtering, sorting, and inline status
 * dropdown that creates validated delta operations.
 */

import { useState } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import { validateDeltas } from '@/lib/validator'
import { applyUpdateTaskStatus } from '@/lib/state-updater'
import { readTasks, writeTasks } from '@/lib/fs'
import type { WorkGraph } from '@/types/graph'
import type { TaskEntity } from '@/types/entities'
import type { TaskStatus } from '@/types/common'
import type { DeltaOperation } from '@/types/deltas'

interface ProjectTaskListProps {
  projectSlug: string
  graph: WorkGraph
  onGraphChanged: () => void
}

const STATUS_OPTIONS: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']
const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  todo: 'Todo',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  return due < today
}

function sortTasks(tasks: TaskEntity[]): TaskEntity[] {
  return [...tasks].sort((a, b) => {
    // blocked first
    if (a.status === 'blocked' && b.status !== 'blocked') return -1
    if (b.status === 'blocked' && a.status !== 'blocked') return 1
    // overdue second
    const aOverdue = isOverdue(a.due_date)
    const bOverdue = isOverdue(b.due_date)
    if (aOverdue && !bOverdue) return -1
    if (bOverdue && !aOverdue) return 1
    // priority
    const aPrio = PRIORITY_ORDER[a.priority] ?? 3
    const bPrio = PRIORITY_ORDER[b.priority] ?? 3
    if (aPrio !== bPrio) return aPrio - bPrio
    // due date
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
}

export function ProjectTaskList({ projectSlug, graph, onGraphChanged }: ProjectTaskListProps) {
  const [filter, setFilter] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  const allTasks = graph.entities.filter(
    (e): e is TaskEntity => e.kind === 'task' && e.project === projectSlug,
  )

  const filteredTasks = filter === 'all' ? allTasks : allTasks.filter((t) => t.status === filter)
  const sortedTasks = sortTasks(filteredTasks)

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    const delta: DeltaOperation = {
      op: 'update_task_status',
      task_id: taskId,
      project: projectSlug,
      status: newStatus,
    }

    const result = validateDeltas([delta], graph)
    if (!result.valid) {
      console.error('[ProjectTaskList] Validation failed:', result.errors)
      return
    }

    setUpdating(taskId)
    try {
      const currentTasks = await readTasks(projectSlug)
      const updated = applyUpdateTaskStatus(currentTasks, delta as Extract<DeltaOperation, { op: 'update_task_status' }>)
      await writeTasks(projectSlug, updated)
      onGraphChanged()
    } catch (err) {
      console.error('[ProjectTaskList] Failed to update task status:', err)
    } finally {
      setUpdating(null)
    }
  }

  if (allTasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No tasks yet</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filter buttons */}
      <div className="flex gap-2 mb-4">
        {Object.entries(FILTER_LABELS).map(([key, label]) => {
          const count = key === 'all' ? allTasks.length : allTasks.filter((t) => t.status === key).length
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Task table */}
      <table className="table-auto w-full">
        <thead>
          <tr className="text-left text-sm text-gray-500 border-b">
            <th className="py-2 px-3">Title</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Priority</th>
            <th className="py-2 px-3">Due</th>
            <th className="py-2 px-3">Blocked By</th>
            <th className="py-2 px-3">Waiting On</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => (
            <tr key={task.id} className="border-b hover:bg-gray-50">
              <td className="py-2 px-3 font-medium text-gray-900">{task.title}</td>
              <td className="py-2 px-3">
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                  disabled={updating === task.id}
                  className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 px-3">
                <StatusBadge value={task.priority} />
              </td>
              <td className={`py-2 px-3 text-sm ${task.due_date && isOverdue(task.due_date) ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                {task.due_date ?? '-'}
              </td>
              <td className="py-2 px-3 text-sm text-gray-400">
                {task.blocked_by ?? '-'}
              </td>
              <td className="py-2 px-3 text-sm text-gray-400">
                {task.waiting_on ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sortedTasks.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No tasks match the current filter
        </div>
      )}
    </div>
  )
}
