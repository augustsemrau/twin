/**
 * Sidebar — Left navigation panel.
 *
 * Shows navigation items and a dynamic project list from the work graph.
 */

import type { ProjectEntity, TaskEntity, DeliveryEntity, NoteEntity } from '@/types/entities'
import type { WorkGraph } from '@/types/graph'

type SidebarProps = {
  projects: ProjectEntity[]
  activeView: string
  onNavigate: (view: string) => void
  inboxCount?: number
  graph?: WorkGraph | null
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
  return [
    { id: 'tasks', label: 'Tasks', count: tasks.length },
    { id: 'deliveries', label: 'Deliveries', count: deliveries.length },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'graph', label: 'Graph', count: 0 },
  ]
}

export function Sidebar({ projects, activeView, onNavigate, inboxCount, graph }: SidebarProps) {
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
          return (
            <div key={project.slug}>
              <button
                onClick={() => onNavigate(viewId)}
                className={`
                  w-full text-left px-3 py-1.5 rounded-md transition-colors cursor-pointer
                  ${isProjectActive ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 hover:text-white'}
                `}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${isProjectActive ? 'bg-blue-400' : 'bg-slate-600'}`} />
                <span className="truncate">{project.name}</span>
              </button>
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
      <div className="px-4 py-3 flex items-center">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2" />
        <span className="text-xs text-slate-400">Twin active</span>
      </div>
    </aside>
  )
}
