import { useEffect, useState } from 'react'
import { useWorkGraph } from '@/hooks/useWorkGraph'
import { Sidebar } from '@/components/Sidebar'
import { seedTwinFolder } from '@/lib/seed'
import type { ProjectEntity } from '@/types/entities'
import './App.css'

function App() {
  const [initialized, setInitialized] = useState(false)
  const [activeView, setActiveView] = useState('focus')
  const { graph, loading, error } = useWorkGraph()

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

  return (
    <div className="flex h-screen">
      <Sidebar
        projects={projects}
        activeView={activeView}
        onNavigate={setActiveView}
      />
      <main className="flex-1 p-6 bg-white overflow-auto">
        {activeView === 'graph' && graph && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Work Graph</h1>
            <p className="mt-2 text-gray-500">
              {graph.entities.length} entities, {graph.relationships.length} relationships
            </p>
            {/* GraphView component will go here in Task 10 */}
          </div>
        )}
        {activeView === 'focus' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Today's Focus</h1>
            <p className="mt-2 text-gray-500">Coming in Phase 2...</p>
          </div>
        )}
        {activeView !== 'graph' && activeView !== 'focus' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{activeView}</h1>
            <p className="mt-2 text-gray-500">Coming soon...</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
