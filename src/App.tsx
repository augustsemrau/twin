import { useEffect, useRef, useState } from 'react'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { listen } from '@tauri-apps/api/event'
import { useWorkGraph } from '@/hooks/useWorkGraph'
import { Sidebar } from '@/components/Sidebar'
import { GraphView } from '@/components/GraphView'
import { CaptureStrip } from '@/components/CaptureStrip'
import { InboxTriage } from '@/components/InboxTriage'
import { ProjectTaskList } from '@/components/ProjectTaskList'
import { ProjectDeliveryList } from '@/components/ProjectDeliveryList'
import { ProjectNoteList } from '@/components/ProjectNoteList'
import { FocusView } from '@/components/FocusView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { seedTwinFolder } from '@/lib/seed'
import { captureToInbox } from '@/lib/capture'
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

  // Keep refs to avoid re-registering the shortcut on every graph/view change
  const graphRef = useRef(graph)
  const activeViewRef = useRef(activeView)
  useEffect(() => { graphRef.current = graph }, [graph])
  useEffect(() => { activeViewRef.current = activeView }, [activeView])

  // Register global shortcut (Cmd+Shift+Space) and listen for capture events
  useEffect(() => {
    let unlisten: (() => void) | null = null

    async function setupShortcut() {
      try {
        await register('CommandOrControl+Shift+Space', async () => {
          const captureWin = await WebviewWindow.getByLabel('capture')
          if (captureWin) {
            await captureWin.show()
            await captureWin.setFocus()
          }
        })
      } catch (err) {
        console.warn('Failed to register global shortcut (Accessibility permission may be needed):', err)
      }

      unlisten = (await listen<{ text: string }>('capture-submitted', async (event) => {
        const currentGraph = graphRef.current
        if (currentGraph) {
          const view = activeViewRef.current
          const projectSlug = view.startsWith('project:') ? view.split(':')[1] : undefined
          await captureToInbox(event.payload.text, currentGraph, projectSlug)
          rebuild()
        }
      }))
    }

    setupShortcut()

    return () => {
      unlisten?.()
      unregister('CommandOrControl+Shift+Space').catch(() => {})
    }
  }, [rebuild])

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
    <ErrorBoundary>
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
            <ErrorBoundary>
              {activeView === 'graph' && graph && (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-gray-900">Work Graph</h1>
                    <p className="text-sm text-gray-500">
                      {graph.entities.length} entities, {graph.relationships.length} relationships
                    </p>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ErrorBoundary
                      fallback={
                        <div className="flex items-center justify-center h-full">
                          <p className="text-gray-500">Graph could not render. Try reloading the app.</p>
                        </div>
                      }
                    >
                      <GraphView graph={graph} />
                    </ErrorBoundary>
                  </div>
                </div>
              )}
              {activeView === 'focus' && graph && (
                <FocusView
                  graph={graph}
                  onGraphChanged={rebuild}
                  inboxCount={inboxCount}
                />
              )}
              {activeView === 'inbox' && graph && (
                <ErrorBoundary>
                  <InboxTriage
                    graph={graph}
                    onGraphChanged={rebuild}
                    onCountChanged={setInboxCount}
                  />
                </ErrorBoundary>
              )}
              {activeProjectSlug && activeSubView === 'tasks' && graph && (
                <ErrorBoundary>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Tasks</h1>
                    <ProjectTaskList projectSlug={activeProjectSlug} graph={graph} onGraphChanged={rebuild} />
                  </div>
                </ErrorBoundary>
              )}
              {activeProjectSlug && activeSubView === 'deliveries' && graph && (
                <ErrorBoundary>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Deliveries</h1>
                    <ProjectDeliveryList projectSlug={activeProjectSlug} graph={graph} onGraphChanged={rebuild} />
                  </div>
                </ErrorBoundary>
              )}
              {activeProjectSlug && activeSubView === 'notes' && graph && (
                <ErrorBoundary>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Notes</h1>
                    <ProjectNoteList projectSlug={activeProjectSlug} graph={graph} onGraphChanged={rebuild} />
                  </div>
                </ErrorBoundary>
              )}
              {activeProjectSlug && activeSubView === 'graph' && graph && (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-gray-900">Project Graph</h1>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ErrorBoundary
                      fallback={
                        <div className="flex items-center justify-center h-full">
                          <p className="text-gray-500">Graph could not render. Try reloading the app.</p>
                        </div>
                      }
                    >
                      <GraphView graph={graph} />
                    </ErrorBoundary>
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
            </ErrorBoundary>
          </div>
          <div className="p-4 border-t">
            <CaptureStrip graph={graph} activeProject={activeProjectSlug} onCaptured={rebuild} />
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}

export default App
