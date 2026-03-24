import type { DeltaOperation } from './deltas'
import type { NoteType, Confidence } from './common'

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
