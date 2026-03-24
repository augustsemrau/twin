import type { ULID, ISOTimestamp, DispatchTarget, Confidence } from './common'
import type { EntityRef } from './entities'

export type ContextPack = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string
  selected_sources: EntityRef[]
  entity_id_map: Record<ULID, string>
  writeback_contract: WritebackContract
  created_at: ISOTimestamp
}

export type WritebackContract = {
  session_id: ULID
  expected_outputs: string[]
  writeback_file: string
  schema_version: '1.0'
}

export type SessionManifest = {
  session_id: ULID
  summary: string
  target: DispatchTarget
  decisions: Array<{
    title: string
    decision: string
    rationale?: string
    unblocks?: ULID
    supersedes?: ULID
  }>
  tasks_created: Array<{
    id?: ULID
    title: string
    priority?: 'high' | 'medium' | 'low'
    due_date?: string
    waiting_on?: string
  }>
  tasks_updated: Array<{
    id?: ULID
    title?: string
    status?: 'todo' | 'in_progress' | 'blocked' | 'done'
    blocked_by?: string
    waiting_on?: string
  }>
  artifacts: Array<{
    path: string
    delivery_id?: ULID
    description: string
  }>
  open_questions: Array<{
    id?: ULID
    question: string
  }>
  blockers: Array<{
    title: string
    blocked_by: string
    waiting_on?: string
  }>
  confidence: Confidence
}

export type ActiveSession = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  dispatched_at: ISOTimestamp
  writeback_received: boolean
  writeback_path: string | null
}
