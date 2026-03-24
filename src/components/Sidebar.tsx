/**
 * Sidebar — Left navigation panel.
 *
 * Shows navigation items and a dynamic project list from the work graph.
 * Includes archive/restore functionality for projects.
 */

import { useState, useCallback } from 'react'
import type { ProjectEntity, TaskEntity, DeliveryEntity, NoteEntity, DecisionEntity } from '@/types/entities'
import type { WorkGraph } from '@/types/graph'
import { ApiStatus } from './ApiStatus'

type SidebarProps = {
  projects: ProjectEntity[]
  activeView: string
  onNavigate: (view: string) => void
  inboxCount?: number
  graph?: WorkGraph | null
  onArchiveProject?: (slug: string) => void
  onRestoreProject?: (slug: string) => void
  archivedProjects?: string[]
}

type NavItem = {
  id: string
  label: string
  enabled: boolean
}

const navItems: NavItem[] = [
  { id: 'focus', label: "Today's focus", enabled: false },
  { id: 'graph', label: 'Work graph', enabled: true },
  { id: 'inbox', label: 'Inbox', enabled: true },
  { id: 'dispatch', label: 'Dispatch', enabled: true },
  { id: 'archive', label: 'Archive', enabled: true },
]

type ProjectSubItem = {
  id: string
  label: string
  count: number
}

function getProjectSubItems(slug: string, graph?: WorkGraph | null): ProjectSubItem[] {
  if (!graph) return []
  const tasks = graph.entities.filter((e): e is TaskEntity => e.kind === 'task' && e.project === slug)
  const deliveries = graph.entities.filter((e): e is DeliveryEntity => e.kind === 'delivery' && e.project === slug)
  const notes = graph.entities.filter((e): e is NoteEntity => e.kind === 'note' && e.project === slug)
  const decisions = graph.entities.filter((e): e is DecisionEntity => e.kind === 'decision' && e.project === slug)
  return [
    { id: 'tasks', label: 'Tasks', count: tasks.length },
    { id: 'deliveries', label: 'Deliveries', count: deliveries.length },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'decisions', label: 'Decisions', count: decisions.length },
    { id: 'graph', label: 'Graph', count: 0 },
  ]
}

export function Sidebar({
  projects,
  activeView,
  onNavigate,
  inboxCount,
  graph,
  onArchiveProject,
  onRestoreProject: _onRestoreProject,
  archivedProjects: _archivedProjects = [],
}: SidebarProps) {
  void _onRestoreProject
  void _archivedProjects
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null)
  const [contextMenuSlug, setContextMenuSlug] = useState<string | null>(null)

  const handleArchiveConfirm = useCallback((slug: string) => {
    onArchiveProject?.(slug)
    setConfirmArchive(null)
    setContextMenuSlug(null)
  }, [onArchiveProject])

  return (
    <aside className="flex flex-col w-64 h-screen bg-slate-900 text-slate-300 text-sm select-none">
      {/* Header */}
      <div className="px-4 py-5">
        <h1 className="text-lg font-semibold text-white tracking-tight">Twin</h1>
      </div>

      <div className="mx-4 border-t border-slate-700" />

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => item.enabled && onNavigate(item.id)}
              disabled={!item.enabled}
              className={`
                w-full text-left px-3 py-1.5 rounded-md transition-colors
                ${isActive ? 'bg-slate-700 text-white' : ''}
                ${item.enabled && !isActive ? 'hover:bg-slate-800 hover:text-white cursor-pointer' : ''}
                ${!item.enabled ? 'text-slate-600 cursor-default' : ''}
              `}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${isActive ? 'bg-blue-400' : 'bg-slate-600'}`} />
              {item.label}
              {item.id === 'inbox' && inboxCount != null && inboxCount > 0 && (
                <span className="ml-auto rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-medium text-white leading-none">
                  {inboxCount}
                </span>
              )}
            </button>
          )
        })}

        {/* Projects section */}
        <div className="pt-4 pb-1 px-3">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Projects
          </span>
        </div>
        {projects.map((project) => {
          const viewId = `project:${project.slug}`
          const isProjectActive = activeView.startsWith(viewId)
          const subItems = isProjectActive ? getProjectSubItems(project.slug, graph) : []
          const showContextMenu = contextMenuSlug === project.slug
          return (
            <div key={project.slug} className="relative">
              <button
                onClick={() => onNavigate(viewId)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenuSlug(showContextMenu ? null : project.slug)
                }}
                className={`
                  w-full text-left px-3 py-1.5 rounded-md transition-colors cursor-pointer group
                  ${isProjectActive ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 hover:text-white'}
                `}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${isProjectActive ? 'bg-blue-400' : 'bg-slate-600'}`} />
                <span className="truncate">{project.name}</span>
                {/* Archive button on hover */}
                {onArchiveProject && (
                  <span
                    className="float-right opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmArchive(project.slug)
                    }}
                    title="Archive project"
                  >
                    &times;
                  </span>
                )}
              </button>

              {/* Right-click context menu */}
              {showContextMenu && onArchiveProject && (
                <div className="absolute left-full top-0 ml-1 z-50 bg-slate-800 border border-slate-600 rounded-md shadow-lg py-1 min-w-[140px]">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
                    onClick={() => {
                      setConfirmArchive(project.slug)
                      setContextMenuSlug(null)
                    }}
                  >
                    Archive project
                  </button>
                </div>
              )}

              {isProjectActive && subItems.length > 0 && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {subItems.map((sub) => {
                    const subViewId = `project:${project.slug}:${sub.id}`
                    const isSubActive = activeView === subViewId
                    return (
                      <button
                        key={sub.id}
                        onClick={() => onNavigate(subViewId)}
                        className={`
                          w-full text-left px-3 py-1 rounded-md text-sm transition-colors cursor-pointer
                          ${isSubActive ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                        `}
                      >
                        {sub.label}
                        {sub.count > 0 && (
                          <span className="ml-1 text-xs text-slate-500">({sub.count})</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* New project placeholder */}
        <button
          disabled
          className="w-full text-left px-3 py-1.5 rounded-md text-slate-600 cursor-default"
        >
          + New project
        </button>
      </nav>

      {/* Footer */}
      <div className="mx-4 border-t border-slate-700" />
      <ApiStatus />

      {/* Archive confirmation dialog */}
      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-5 max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Archive project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Archive <span className="font-medium">{confirmArchive.replace(/-/g, ' ')}</span>?
              It will be moved to ~/twin/archive/.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                onClick={() => setConfirmArchive(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                onClick={() => handleArchiveConfirm(confirmArchive)}
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

/**
 * ArchiveView — Lists archived projects with restore capability.
 */
export function ArchiveView({
  archivedProjects,
  onRestore,
}: {
  archivedProjects: string[]
  onRestore: (slug: string) => void
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Archived Projects</h1>
      {archivedProjects.length === 0 ? (
        <p className="text-gray-500">No archived projects.</p>
      ) : (
        <ul className="space-y-2">
          {archivedProjects.map((slug) => (
            <li
              key={slug}
              className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <span className="text-gray-800 font-medium">
                {slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
              <button
                type="button"
                className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md"
                onClick={() => onRestore(slug)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
