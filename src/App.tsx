import { useEffect, useRef, useState, useCallback } from 'react'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { listen } from '@tauri-apps/api/event'
import { useWorkGraph } from '@/hooks/useWorkGraph'
import { Sidebar, ArchiveView } from '@/components/Sidebar'
import { GraphView } from '@/components/GraphView'
import { CaptureStrip } from '@/components/CaptureStrip'
import { InboxTriage } from '@/components/InboxTriage'
import { ProjectTaskList } from '@/components/ProjectTaskList'
import { ProjectDeliveryList } from '@/components/ProjectDeliveryList'
import { ProjectNoteList } from '@/components/ProjectNoteList'
import { FocusView } from '@/components/FocusView'
import { DispatchBar } from '@/components/DispatchBar'
import { DispatchView } from '@/components/DispatchView'
import { BriefPreview } from '@/components/BriefPreview'
import { SessionBanner } from '@/components/SessionBanner'
import { SessionEndModal } from '@/components/SessionEndModal'
import { ConversationImport } from '@/components/ConversationImport'
import { ConversationNoteEditor } from '@/components/ConversationNoteEditor'
import { NoteEditor } from '@/components/NoteEditor'
import { DecisionList } from '@/components/DecisionList'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useSessionTracker } from '@/hooks/useSessionTracker'
import { seedTwinFolder } from '@/lib/seed'
import { captureToInbox } from '@/lib/capture'
import type { ProjectEntity } from '@/types/entities'
import type { ContextPack } from '@/types/sessions'
import './App.css'

function App() {
  const [initialized, setInitialized] = useState(false)
  const [activeView, setActiveView] = useState('focus')
  const [inboxCount, setInboxCount] = useState(0)
  const [showDispatchBar, setShowDispatchBar] = useState(false)
  const [lastDispatchedPack, setLastDispatchedPack] = useState<ContextPack | null>(null)
  const [archivedProjects, setArchivedProjects] = useState<string[]>([])
  const { graph, loading, error, warnings, rebuild } = useWorkGraph()
  const {
    activeSessions,
    reconcilerResult,
    startSession,
    markSessionDone,
    updateWritebackPath,
    clearReconcilerResult,
  } = useSessionTracker()

  // Overlay state for session end modal and conversation import
  const [sessionEndModalId, setSessionEndModalId] = useState<string | null>(null)
  const [conversationImportSessionId, setConversationImportSessionId] = useState<string | null>(null)
  const [showConversationEditor, setShowConversationEditor] = useState(false)

  useEffect(() => {
    seedTwinFolder().then(() => setInitialized(true))
  }, [])

  // Load archived projects list
  const loadArchivedProjects = useCallback(async () => {
    try {
      const { listArchivedProjects } = await import('@/lib/fs')
      const archived = await listArchivedProjects()
      setArchivedProjects(archived)
    } catch {
      // Archive dir may not exist yet
    }
  }, [])

  useEffect(() => {
    if (initialized) {
      loadArchivedProjects()
    }
  }, [initialized, loadArchivedProjects])

  // Auto-archive old sessions on graph build (non-blocking, silent)
  useEffect(() => {
    if (!graph) return
    import('@/lib/fs').then(({ archiveOldSessions }) => {
      archiveOldSessions(30).catch(() => {})
    })
  }, [graph])

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

  // Cmd+D shortcut to toggle DispatchBar (in-app, not global)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === 'd') {
        e.preventDefault()
        setShowDispatchBar((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleDispatch = useCallback((pack: ContextPack) => {
    setLastDispatchedPack(pack)
    setShowDispatchBar(false)
    startSession(pack)
  }, [startSession])

  const handleDismissBriefPreview = useCallback(() => {
    setLastDispatchedPack(null)
  }, [])

  // Archive/restore handlers
  const handleArchiveProject = useCallback(async (slug: string) => {
    try {
      const { archiveProject } = await import('@/lib/fs')
      await archiveProject(slug)
      await rebuild()
      await loadArchivedProjects()
    } catch (err) {
      console.error('Failed to archive project:', err)
    }
  }, [rebuild, loadArchivedProjects])

  const handleRestoreProject = useCallback(async (slug: string) => {
    try {
      const { restoreProject } = await import('@/lib/fs')
      await restoreProject(slug)
      await rebuild()
      await loadArchivedProjects()
    } catch (err) {
      console.error('Failed to restore project:', err)
    }
  }, [rebuild, loadArchivedProjects])

  // GraphView dispatch/open handlers
  const handleDispatchFromEntity = useCallback((objective: string) => {
    setActiveView('dispatch')
    // The dispatch view will pick up the objective
    // For now, open dispatch bar with pre-filled text
    setShowDispatchBar(true)
    // Store the objective so DispatchBar can use it
    // We'll use a simple approach: navigate to dispatch view
    setTimeout(() => {
      setShowDispatchBar(false)
      setActiveView('dispatch')
    }, 0)
    console.log('[GraphView] Dispatch from entity:', objective)
  }, [])

  const handleOpenEntity = useCallback((entityKind: string, entityId: string) => {
    if (!graph) return
    // Find the entity to determine its project
    const entity = graph.entities.find((e) => {
      if (e.kind === 'project') return e.slug === entityId
      return 'id' in e && (e as { id: string }).id === entityId
    })
    if (!entity) return

    const project = 'project' in entity ? (entity as { project: string }).project : undefined

    if (!project) return

    switch (entityKind) {
      case 'task':
        setActiveView(`project:${project}:tasks`)
        break
      case 'delivery':
        setActiveView(`project:${project}:deliveries`)
        break
      case 'decision':
        setActiveView(`project:${project}:decisions`)
        break
      case 'note': {
        const noteEntity = entity as { filename?: string }
        if (noteEntity.filename) {
          setActiveView(`note:${project}:${noteEntity.filename}`)
        } else {
          setActiveView(`project:${project}:notes`)
        }
        break
      }
      default:
        if (project) setActiveView(`project:${project}`)
        break
    }
  }, [graph])

  // Session end modal handlers
  const handleSessionEndSave = useCallback((sessionId: string) => {
    return (_summary: string, _flags: { decisions: boolean; tasks: boolean; nothing: boolean }) => {
      markSessionDone(sessionId, 'session_end')
      updateWritebackPath(sessionId, 'session_end')
      setSessionEndModalId(null)
      rebuild()
    }
  }, [markSessionDone, updateWritebackPath, rebuild])

  const handleQuickSummary = useCallback((sessionId: string) => {
    return (_summary: string) => {
      markSessionDone(sessionId, 'quick_summary')
      updateWritebackPath(sessionId, 'quick_summary')
      rebuild()
    }
  }, [markSessionDone, updateWritebackPath, rebuild])

  const handleClipboardImport = useCallback((sessionId: string) => {
    return (_text: string) => {
      // Open conversation import flow with clipboard text pre-filled
      setConversationImportSessionId(sessionId)
      updateWritebackPath(sessionId, 'clipboard')
    }
  }, [updateWritebackPath])

  const handleConversationImportComplete = useCallback((sessionId: string) => {
    return (_noteId: string) => {
      markSessionDone(sessionId, 'full_import')
      updateWritebackPath(sessionId, 'full_import')
      setConversationImportSessionId(null)
      rebuild()
    }
  }, [markSessionDone, updateWritebackPath, rebuild])

  const handleConversationEditorSave = useCallback(() => {
    setShowConversationEditor(false)
    rebuild()
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
  // Also handle "note:<slug>:<filename>" for the note editor
  const activeProjectSlug = activeView.startsWith('project:')
    ? activeView.split(':')[1]
    : activeView.startsWith('note:')
      ? activeView.split(':')[1]
      : undefined
  const activeSubView = activeView.startsWith('project:')
    ? activeView.split(':')[2] ?? null
    : null
  const activeNoteFilename = activeView.startsWith('note:')
    ? activeView.split(':').slice(2).join(':') ?? null
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
          onArchiveProject={handleArchiveProject}
          onRestoreProject={handleRestoreProject}
          archivedProjects={archivedProjects}
          projectWarnings={warnings}
        />
        <main className="flex-1 flex flex-col bg-white">
          {/* Active session banners */}
          {activeSessions.filter(s => !s.writeback_received || reconcilerResult).length > 0 && (
            <div className="border-b border-gray-200 px-6 py-3 space-y-2">
              {activeSessions
                .filter(s => !s.writeback_received || reconcilerResult)
                .map(session => (
                  <SessionBanner
                    key={session.session_id}
                    session={session}
                    reconcilerResult={
                      reconcilerResult?.session_id === session.session_id
                        ? reconcilerResult
                        : null
                    }
                    onMarkDone={() => setSessionEndModalId(session.session_id)}
                    onImportConversation={() => setConversationImportSessionId(session.session_id)}
                    onReviewDeltas={() => {
                      clearReconcilerResult()
                    }}
                    onQuickSummary={handleQuickSummary(session.session_id)}
                    onClipboardImport={handleClipboardImport(session.session_id)}
                  />
                ))}
            </div>
          )}
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
                      <GraphView
                        graph={graph}
                        onDispatchFromEntity={handleDispatchFromEntity}
                        onOpenEntity={handleOpenEntity}
                      />
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
              {activeView === 'archive' && (
                <ArchiveView
                  archivedProjects={archivedProjects}
                  onRestore={handleRestoreProject}
                />
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
                    <div className="flex items-center justify-between mb-4">
                      <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
                      <button
                        type="button"
                        onClick={() => setShowConversationEditor(true)}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        New conversation note
                      </button>
                    </div>
                    {showConversationEditor && graph ? (
                      <ConversationNoteEditor
                        projectSlug={activeProjectSlug}
                        graph={graph}
                        onSave={handleConversationEditorSave}
                        onCancel={() => setShowConversationEditor(false)}
                      />
                    ) : (
                      <ProjectNoteList
                        projectSlug={activeProjectSlug}
                        graph={graph}
                        onGraphChanged={rebuild}
                        onOpenNote={(filename) => setActiveView(`note:${activeProjectSlug}:${filename}`)}
                      />
                    )}
                  </div>
                </ErrorBoundary>
              )}
              {activeProjectSlug && activeSubView === 'decisions' && graph && (
                <ErrorBoundary>
                  <DecisionList
                    projectSlug={activeProjectSlug}
                    graph={graph}
                    onGraphChanged={rebuild}
                  />
                </ErrorBoundary>
              )}
              {activeNoteFilename && activeProjectSlug && graph && (
                <ErrorBoundary>
                  <NoteEditor
                    projectSlug={activeProjectSlug}
                    noteFilename={activeNoteFilename}
                    graph={graph}
                    onSave={rebuild}
                    onBack={() => setActiveView(`project:${activeProjectSlug}:notes`)}
                  />
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
                      <GraphView
                        graph={graph}
                        onDispatchFromEntity={handleDispatchFromEntity}
                        onOpenEntity={handleOpenEntity}
                      />
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
              {activeView === 'dispatch' && graph && (
                <ErrorBoundary>
                  <DispatchView
                    graph={graph}
                    projectSlug={activeProjectSlug}
                    onDispatch={handleDispatch}
                  />
                </ErrorBoundary>
              )}
              {!activeProjectSlug && activeView !== 'graph' && activeView !== 'focus' && activeView !== 'inbox' && activeView !== 'dispatch' && activeView !== 'archive' && (
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

      {/* Quick Dispatch overlay (Cmd+D) */}
      {showDispatchBar && graph && (
        <DispatchBar
          graph={graph}
          projectSlug={activeProjectSlug}
          onDispatch={handleDispatch}
          onClose={() => setShowDispatchBar(false)}
        />
      )}

      {/* Brief preview overlay after dispatch */}
      {lastDispatchedPack && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={handleDismissBriefPreview}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-2xl max-h-[80vh] bg-white rounded-xl shadow-2xl p-6 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                Dispatched to <span className="font-medium text-gray-700">{lastDispatchedPack.target}</span>
                {' '}— brief copied to clipboard
              </p>
              <button
                type="button"
                onClick={handleDismissBriefPreview}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                Dismiss
              </button>
            </div>
            <BriefPreview
              markdown={lastDispatchedPack.brief_markdown}
              onCopy={async () => {
                try {
                  await navigator.clipboard.writeText(lastDispatchedPack.brief_markdown)
                } catch { /* clipboard unavailable */ }
              }}
              onWriteToProject={
                (lastDispatchedPack.target === 'code' || lastDispatchedPack.target === 'cowork') && activeProjectSlug
                  ? async () => {
                      try {
                        const { writeProjectCLAUDE } = await import('@/lib/fs')
                        await writeProjectCLAUDE(activeProjectSlug!, lastDispatchedPack.brief_markdown)
                      } catch (err) {
                        console.error('Failed to write CLAUDE.md:', err)
                      }
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Session End Modal overlay */}
      {sessionEndModalId && graph && (
        <SessionEndModal
          sessionId={sessionEndModalId}
          projectSlug={activeProjectSlug}
          graph={graph}
          onSave={handleSessionEndSave(sessionEndModalId)}
          onImportFull={() => {
            setSessionEndModalId(null)
            setConversationImportSessionId(sessionEndModalId)
          }}
          onCancel={() => setSessionEndModalId(null)}
        />
      )}

      {/* Conversation Import overlay */}
      {conversationImportSessionId && graph && (
        <ConversationImport
          graph={graph}
          projects={projects}
          onComplete={handleConversationImportComplete(conversationImportSessionId)}
          onCancel={() => setConversationImportSessionId(null)}
        />
      )}
    </ErrorBoundary>
  )
}

export default App
