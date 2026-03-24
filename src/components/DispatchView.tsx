/**
 * DispatchView — Full dispatch page with source selection and brief preview.
 *
 * Flow: objective -> Plan -> review sources -> Generate Brief -> preview/copy.
 */

import { useState, useCallback } from 'react'
import type { WorkGraph } from '@/types/graph'
import type { ContextPack } from '@/types/sessions'
import type { DispatchTarget, Confidence } from '@/types/common'
import type { PlannerOutput } from '@/types/agents'
import type { WorkGraphEntity } from '@/types/entities'
import { runPlanner } from '@/lib/planner'
import { buildContextPack, saveContextPack, getProjectEntities } from '@/lib/composer'
import { writeProjectCLAUDE } from '@/lib/fs'
import { SourceChecklist } from './SourceChecklist'
import { BriefPreview } from './BriefPreview'
import { StatusBadge } from './StatusBadge'

interface DispatchViewProps {
  graph: WorkGraph
  projectSlug?: string
  onDispatch: (pack: ContextPack) => void
}

type ViewState =
  | { step: 'objective' }
  | { step: 'planning' }
  | { step: 'configure'; plannerResult: PlannerOutput; recommendedTarget: DispatchTarget }
  | { step: 'generating' }
  | { step: 'preview'; pack: ContextPack }

function plannerTargetFromAction(action: PlannerOutput['recommended_action']): DispatchTarget {
  switch (action.type) {
    case 'dispatch_chat': return 'chat'
    case 'dispatch_code': return 'code'
    case 'dispatch_cowork': return 'cowork'
    default: return 'chat'
  }
}

function plannerSourceIds(action: PlannerOutput['recommended_action']): string[] {
  if ('context_sources' in action && Array.isArray(action.context_sources)) {
    return action.context_sources
      .map((s) => {
        // context_sources might be EntityRef or string-like
        if (typeof s === 'string') return s
        if ('file' in s) return s.file
        return ''
      })
      .filter(Boolean)
  }
  return []
}

function targetLabel(target: DispatchTarget): string {
  switch (target) {
    case 'chat': return 'Chat'
    case 'code': return 'Code'
    case 'cowork': return 'Cowork'
  }
}

function targetColor(target: DispatchTarget, active: boolean): string {
  if (!active) return 'bg-gray-100 text-gray-600 hover:bg-gray-200'
  switch (target) {
    case 'chat': return 'bg-purple-600 text-white'
    case 'code': return 'bg-blue-600 text-white'
    case 'cowork': return 'bg-teal-600 text-white'
  }
}

function confidenceColor(c: Confidence): string {
  switch (c) {
    case 'high': return 'text-green-600'
    case 'medium': return 'text-amber-600'
    case 'low': return 'text-red-600'
  }
}

export function DispatchView({ graph, projectSlug, onDispatch }: DispatchViewProps) {
  const [state, setState] = useState<ViewState>({ step: 'objective' })
  const [objective, setObjective] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<DispatchTarget>('chat')
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const projectEntities: WorkGraphEntity[] = projectSlug
    ? getProjectEntities(graph, projectSlug)
    : graph.entities

  const handlePlan = useCallback(async () => {
    if (!objective.trim()) return
    setError(null)
    setState({ step: 'planning' })

    try {
      const result = await runPlanner(objective, graph, projectSlug)
      const target = plannerTargetFromAction(result.recommended_action)
      setSelectedTarget(target)

      // Pre-select sources from Planner recommendation
      const sourceIds = plannerSourceIds(result.recommended_action)
      if (sourceIds.length > 0) {
        setSelectedSources(new Set(sourceIds))
      } else {
        // Default: select all entities with IDs
        const allIds = new Set<string>()
        for (const e of projectEntities) {
          if ('id' in e) allIds.add((e as { id: string }).id)
        }
        setSelectedSources(allIds)
      }

      setState({ step: 'configure', plannerResult: result, recommendedTarget: target })
    } catch (err) {
      // Fallback: allow manual configuration
      const allIds = new Set<string>()
      for (const e of projectEntities) {
        if ('id' in e) allIds.add((e as { id: string }).id)
      }
      setSelectedSources(allIds)
      setError(err instanceof Error ? err.message : 'Planner failed')
      setState({
        step: 'configure',
        plannerResult: {
          recommended_action: { type: 'no_action', reason: 'Planner unavailable' },
          confidence: 'low',
          alternatives: [],
        },
        recommendedTarget: 'chat',
      })
    }
  }, [objective, graph, projectSlug, projectEntities])

  const handleGenerate = useCallback(async () => {
    if (!objective.trim()) return
    setState({ step: 'generating' })

    try {
      const sources = projectEntities
        .filter((e) => 'id' in e && selectedSources.has((e as { id: string }).id))
        .map((e) => e.ref)

      const pack = buildContextPack({
        target: selectedTarget,
        objective,
        selectedSources: sources,
        graph,
        globalContext: '',
        projectSlug: projectSlug ?? '',
      })

      await saveContextPack(pack)
      setState({ step: 'preview', pack })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate brief')
      setState({ step: 'configure', plannerResult: { recommended_action: { type: 'no_action', reason: '' }, confidence: 'low', alternatives: [] }, recommendedTarget: selectedTarget })
    }
  }, [objective, selectedTarget, selectedSources, graph, projectSlug, projectEntities])

  function handleToggleSource(id: string) {
    setSelectedSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCopy() {
    if (state.step !== 'preview') return
    try {
      await navigator.clipboard.writeText(state.pack.brief_markdown)
    } catch {
      // Clipboard unavailable
    }
  }

  async function handleWriteToProject() {
    if (state.step !== 'preview' || !projectSlug) return
    try {
      await writeProjectCLAUDE(projectSlug, state.pack.brief_markdown)
    } catch (err) {
      console.error('Failed to write CLAUDE.md:', err)
    }
  }

  function handleDispatch() {
    if (state.step !== 'preview') return
    onDispatch(state.pack)
  }

  function handleReset() {
    setState({ step: 'objective' })
    setObjective('')
    setSelectedSources(new Set())
    setError(null)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dispatch</h1>
        {state.step !== 'objective' && (
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Start over
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Objective */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Objective
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && state.step === 'objective') handlePlan()
            }}
            placeholder="What do you want to accomplish?"
            disabled={state.step !== 'objective'}
            className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
          />
          {state.step === 'objective' && (
            <button
              type="button"
              onClick={handlePlan}
              disabled={!objective.trim()}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Plan
            </button>
          )}
        </div>
      </div>

      {/* Planning spinner */}
      {state.step === 'planning' && (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-600">Running Planner...</p>
        </div>
      )}

      {/* Step 2: Configure */}
      {(state.step === 'configure' || state.step === 'generating') && (
        <div className="space-y-6">
          {/* Planner recommendation */}
          {state.step === 'configure' && state.plannerResult.recommended_action.type !== 'no_action' && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-700">
                Recommended: {targetLabel(state.recommendedTarget)}
                <span className={`ml-2 text-xs ${confidenceColor(state.plannerResult.confidence)}`}>
                  Confidence: {state.plannerResult.confidence}
                </span>
              </p>
              {state.plannerResult.alternatives.length > 0 && (
                <div className="mt-2 space-y-1">
                  {state.plannerResult.alternatives.map((alt, i) => (
                    <p key={i} className="text-xs text-gray-500">
                      Alternative: {alt.action} — {alt.rationale}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Target override */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              Dispatch target
            </label>
            <div className="flex gap-2">
              {(['chat', 'code', 'cowork'] as DispatchTarget[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTarget(t)}
                  disabled={state.step === 'generating'}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${targetColor(t, selectedTarget === t)}`}
                >
                  {targetLabel(t)}
                </button>
              ))}
            </div>
          </div>

          {/* Source checklist */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              Context sources ({selectedSources.size} selected)
            </label>
            <div className="max-h-64 overflow-auto border border-gray-200 rounded-lg p-3">
              <SourceChecklist
                entities={projectEntities}
                selected={selectedSources}
                onToggle={handleToggleSource}
              />
            </div>
          </div>

          {/* Generate button */}
          {state.step === 'configure' && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={selectedSources.size === 0}
              className="w-full px-4 py-3 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Generate Brief
            </button>
          )}

          {state.step === 'generating' && (
            <div className="text-center py-4">
              <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-sm text-gray-600">Generating brief...</p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Preview */}
      {state.step === 'preview' && (
        <div className="space-y-4">
          {/* Session info */}
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <StatusBadge value={state.pack.target} />
            <code className="text-xs font-mono text-gray-400">
              {state.pack.session_id}
            </code>
          </div>

          {/* Brief preview */}
          <div className="border border-gray-200 rounded-lg p-4 max-h-[60vh] overflow-auto">
            <BriefPreview
              markdown={state.pack.brief_markdown}
              onCopy={handleCopy}
              onWriteToProject={
                (selectedTarget === 'code' || selectedTarget === 'cowork') && projectSlug
                  ? handleWriteToProject
                  : undefined
              }
            />
          </div>

          {/* Dispatch confirmation */}
          <button
            type="button"
            onClick={handleDispatch}
            className="w-full px-4 py-3 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Confirm Dispatch
          </button>
        </div>
      )}
    </div>
  )
}
