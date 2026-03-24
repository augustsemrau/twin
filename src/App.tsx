import { useEffect, useState } from 'react'
import { useWorkGraph } from '@/hooks/useWorkGraph'
import { Sidebar } from '@/components/Sidebar'
import { GraphView } from '@/components/GraphView'
import { CaptureStrip } from '@/components/CaptureStrip'
import { InboxTriage } from '@/components/InboxTriage'
import { ProjectTaskList } from '@/components/ProjectTaskList'
import { ProjectDeliveryList } from '@/components/ProjectDeliveryList'
import { ProjectNoteList } from '@/components/ProjectNoteList'
import { seedTwinFolder } from '@/lib/seed'
import type { ProjectEntity } from '@/types/entities'
import './App.css'

function App() {
  const [initialized, setInitialized] = useState(false)
  const [activeView, setActiveView] = useState('focus')
  const [inboxCount, setInboxCount] = useState(0)
  const { graph, loading, error, rebuild } = useWorkGraph()

  useEffect(() => {
    seedTwinFolder().then(() => setInitialized(true))
  }, [])

  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 font-medium">Failed to load work graph</p>
          <p className="text-gray-500 mt-1 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  const projects = (graph?.entities.filter((e): e is ProjectEntity => e.kind === 'project') ?? [])

  // Derive active project slug from view id (format: "project:<slug>" or "project:<slug>:<sub>")
  const activeProjectSlug = activeView.startsWith('project:')
    ? activeView.split(':')[1]
    : undefined
  const activeSubView = activeView.startsWith('project:')
    ? activeView.split(':')[2] ?? null
    : null

  return (
    <div className="flex h-screen">
      <Sidebar
        projects={projects}
        activeView={activeView}
        onNavigate={setActiveView}
        inboxCount={inboxCount}
        graph={graph}
      />
      <main className="flex-1 flex flex-col bg-white">
        <div className="flex-1 overflow-auto p-6">
          {activeView === 'graph' && graph && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-gray-900">Work Graph</h1>
                <p className="text-sm text-gray-500">
                  {graph.entities.length} entities, {graph.relationships.length} relationships
                </p>
              </div>
              <div className="flex-1 min-h-0">
                <GraphView graph={graph} />
              </div>
            </div>
          )}
          {activeView === 'focus' && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Today's Focus</h1>
              <p className="mt-2 text-gray-500">Coming in Phase 2...</p>
            </div>
          )}
          {activeView === 'inbox' && graph && (
            <InboxTriage
              graph={graph}
              onGraphChanged={rebuild}
              onCountChanged={setInboxCount}
            />
          )}
          {activeProjectSlug && activeSubView === 'tasks' && graph && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Tasks</h1>
              <ProjectTaskList projectSlug={activeProjectSlug} graph={graph} onGraphChanged={rebuild} />
            </div>
          )}
          {activeProjectSlug && activeSubView === 'deliveries' && graph && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Deliveries</h1>
              <ProjectDeliveryList projectSlug={activeProjectSlug} graph={graph} onGraphChanged={rebuild} />
            </div>
          )}
          {activeProjectSlug && activeSubView === 'notes' && graph && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Notes</h1>
              <ProjectNoteList projectSlug={activeProjectSlug} graph={graph} onGraphChanged={rebuild} />
            </div>
          )}
          {activeProjectSlug && activeSubView === 'graph' && graph && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-gray-900">Project Graph</h1>
              </div>
              <div className="flex-1 min-h-0">
                <GraphView graph={graph} />
              </div>
            </div>
          )}
          {activeProjectSlug && !activeSubView && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {activeProjectSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </h1>
              <p className="mt-2 text-gray-500">Select a view from the sidebar.</p>
            </div>
          )}
          {!activeProjectSlug && activeView !== 'graph' && activeView !== 'focus' && activeView !== 'inbox' && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{activeView}</h1>
              <p className="mt-2 text-gray-500">Coming soon...</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t">
          <CaptureStrip graph={graph} activeProject={activeProjectSlug} onCaptured={rebuild} />
        </div>
      </main>
    </div>
  )
}

export default App
