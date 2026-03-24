/**
 * DispatchBar — Spotlight-style quick dispatch overlay (Cmd+D).
 *
 * Flow: objective input -> Planner -> Composer -> clipboard -> done.
 * Fallback: if Planner fails, user can manually select target.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkGraph } from '@/types/graph'
import type { ContextPack } from '@/types/sessions'
import type { DispatchTarget } from '@/types/common'
import type { TaskEntity, DeliveryEntity } from '@/types/entities'
import { runPlanner } from '@/lib/planner'
import { buildContextPack, saveContextPack } from '@/lib/composer'
import { globalClaudePath } from '@/lib/paths'

interface DispatchBarProps {
  graph: WorkGraph
  projectSlug?: string
  onDispatch: (pack: ContextPack) => void
  onClose: () => void
}

type Suggestion = {
  label: string
  objective: string
  target: DispatchTarget
}

type DispatchState =
  | { phase: 'input' }
  | { phase: 'planning'; objective: string }
  | { phase: 'error'; objective: string; message: string }

function deriveSuggestions(graph: WorkGraph, projectSlug?: string): Suggestion[] {
  const suggestions: Suggestion[] = []

  const tasks = graph.entities.filter(
    (e): e is TaskEntity =>
      e.kind === 'task' &&
      (!projectSlug || e.project === projectSlug),
  )
  const deliveries = graph.entities.filter(
    (e): e is DeliveryEntity =>
      e.kind === 'delivery' &&
      (!projectSlug || e.project === projectSlug),
  )

  // Blocked tasks -> "Unblock [task]"
  const blocked = tasks.filter((t) => t.status === 'blocked' || t.blocked_by)
  for (const t of blocked.slice(0, 2)) {
    suggestions.push({
      label: `Unblock: ${t.title}`,
      objective: `Unblock the task "${t.title}" [${t.id}]`,
      target: 'chat',
    })
  }

  // Draft deliveries -> "Draft [delivery]"
  const drafts = deliveries.filter((d) => d.status === 'draft')
  for (const d of drafts.slice(0, 2)) {
    suggestions.push({
      label: `Draft: ${d.title}`,
      objective: `Draft the delivery "${d.title}" [${d.id}]`,
      target: 'cowork',
    })
  }

  // In-progress tasks -> "Work on [task]"
  const inProgress = tasks.filter((t) => t.status === 'in_progress')
  for (const t of inProgress.slice(0, 2)) {
    suggestions.push({
      label: `Work on: ${t.title}`,
      objective: `Continue working on "${t.title}" [${t.id}]`,
      target: 'code',
    })
  }

  return suggestions.slice(0, 5)
}

function targetLabel(target: DispatchTarget): string {
  switch (target) {
    case 'chat': return 'Chat'
    case 'code': return 'Code'
    case 'cowork': return 'Cowork'
  }
}

function targetColor(target: DispatchTarget): string {
  switch (target) {
    case 'chat': return 'bg-purple-100 text-purple-700'
    case 'code': return 'bg-blue-100 text-blue-700'
    case 'cowork': return 'bg-teal-100 text-teal-700'
  }
}

export function DispatchBar({ graph, projectSlug, onDispatch, onClose }: DispatchBarProps) {
  const [state, setState] = useState<DispatchState>({ phase: 'input' })
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestions = deriveSuggestions(graph, projectSlug)

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const executeDispatch = useCallback(async (
    objective: string,
    targetOverride?: DispatchTarget,
  ) => {
    if (!objective.trim()) return

    setState({ phase: 'planning', objective })

    try {
      const plannerResult = await runPlanner(objective, graph, projectSlug)

      let target: DispatchTarget = targetOverride ?? 'chat'
      let sources = graph.entities
        .filter((e) => 'id' in e)
        .map((e) => (e as { ref: { file: string; line?: number } }).ref)

      if (!targetOverride) {
        const action = plannerResult.recommended_action
        if (action.type === 'dispatch_chat') {
          target = 'chat'
          if (action.context_sources.length > 0) sources = action.context_sources
        } else if (action.type === 'dispatch_code') {
          target = 'code'
          if (action.context_sources.length > 0) sources = action.context_sources
        } else if (action.type === 'dispatch_cowork') {
          target = 'cowork'
          if (action.context_sources.length > 0) sources = action.context_sources
        }
      }

      let globalContext = ''
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        globalContext = await readTextFile(await globalClaudePath())
      } catch {
        // CLAUDE.md may not exist yet — proceed with empty context
      }

      const pack = buildContextPack({
        target,
        objective,
        selectedSources: sources,
        graph,
        globalContext,
        projectSlug: projectSlug ?? '',
      })

      await saveContextPack(pack)

      try {
        await navigator.clipboard.writeText(pack.brief_markdown)
      } catch {
        // Clipboard may not be available
      }

      onDispatch(pack)
      onClose()
    } catch (err) {
      // Planner failed — show error with manual target selection
      setState({
        phase: 'error',
        objective,
        message: err instanceof Error ? err.message : 'Planning failed',
      })
    }
  }, [graph, projectSlug, onDispatch, onClose])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    executeDispatch(inputValue)
  }

  function handleSuggestionClick(suggestion: Suggestion) {
    executeDispatch(suggestion.objective, suggestion.target)
  }

  function handleManualTarget(target: DispatchTarget) {
    const objective = state.phase === 'error' ? state.objective : inputValue
    if (!objective.trim()) return
    executeDispatch(objective, target)
  }

  // Number keys for suggestions (only in input phase)
  function handleKeyDown(e: React.KeyboardEvent) {
    if (state.phase !== 'input') return
    const num = parseInt(e.key)
    if (num >= 1 && num <= suggestions.length) {
      e.preventDefault()
      handleSuggestionClick(suggestions[num - 1])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {state.phase === 'planning' ? (
          <div className="p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-600">Planning...</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{state.objective}</p>
          </div>
        ) : state.phase === 'error' ? (
          <div className="p-6">
            <p className="text-sm text-red-600 mb-3">
              Planner unavailable. Select a target manually:
            </p>
            <p className="text-xs text-gray-500 mb-4 truncate">
              Objective: {state.objective}
            </p>
            <div className="flex gap-2 justify-center">
              {(['chat', 'code', 'cowork'] as DispatchTarget[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleManualTarget(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80 ${targetColor(t)}`}
                >
                  {targetLabel(t)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600 w-full text-center"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            {/* Input */}
            <form onSubmit={handleSubmit}>
              <div className="px-5 pt-5 pb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  What do you want to accomplish?
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., Decide the data framework..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </form>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="px-5 pb-2">
                <p className="text-xs font-medium text-gray-400 mb-1.5">Suggested:</p>
                <div className="space-y-1">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSuggestionClick(s)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <span className="text-xs text-gray-400 font-mono w-4 shrink-0">{i + 1}</span>
                      <span className="text-sm text-gray-700 flex-1 truncate group-hover:text-gray-900">
                        {s.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${targetColor(s.target)}`}>
                        {targetLabel(s.target)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual target buttons */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-400 mr-auto">Or dispatch directly to:</span>
              {(['chat', 'code', 'cowork'] as DispatchTarget[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleManualTarget(t)}
                  disabled={!inputValue.trim()}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    inputValue.trim()
                      ? `${targetColor(t)} hover:opacity-80`
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {targetLabel(t)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
