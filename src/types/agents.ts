import type { DeltaOperation } from './deltas'
import type { NoteType, Confidence } from './common'
import type { EntityRef } from './entities'

export type ObservationType =
  | 'task' | 'decision' | 'blocker' | 'open_question'
  | 'note' | 'person_mentioned' | 'artifact_referenced'

export type ProposedObservation = {
  observation_type: ObservationType
  summary: string
  evidence: string
  proposed_delta: DeltaOperation | null
}

export type ResolverOutput = {
  candidate_project: string | null
  confidence: Confidence
  proposed_observations: ProposedObservation[]
  suggested_note_type: NoteType
  suggested_note_title: string
}

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
}

export type ApiCallRecord = {
  agent: string
  model: string
  timestamp: number
  usage: TokenUsage
  duration_ms: number
  success: boolean
  error?: string
}

export type PlannerOutput = {
  recommended_action:
    | { type: 'dispatch_chat'; objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_code'; objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_cowork'; delivery_id: string; context_sources: EntityRef[] }
    | { type: 'ask_user'; question: string }
    | { type: 'propose_deltas'; deltas: DeltaOperation[]; rationale: string }
    | { type: 'no_action'; reason: string }
  confidence: Confidence
  alternatives: Array<{ action: string; rationale: string }>
}

export type PrioritiserOutput = {
  brief: string
  priority_items: Array<{
    title: string
    project: string
    reasoning: string
    next_action: string
    entity_refs: string[]
  }>
  proactive_proposals: Array<{
    proposal: string
    trigger_reason: string
    proposed_delta: DeltaOperation | null
    entity_refs: string[]
  }>
}

export type ReconcilerOutput = {
  session_id: string
  proposed_deltas: DeltaOperation[]
  follow_up_proposals: PrioritiserOutput['proactive_proposals']
  confidence: Confidence
  unresolved: Array<{
    item: string
    reason: string
    needs_user_input: boolean
  }>
}
