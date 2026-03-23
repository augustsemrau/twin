import type { ULID } from './common'
import type { DeliveryStatus } from './common'
import type { TaskEntity, DeliveryEntity, DecisionEntity, NoteEntity, OpenQuestionEntity, PersonEntity } from './entities'

export type DeltaOperation =
  | { op: 'create_task'; payload: Omit<TaskEntity, 'kind' | 'ref'> }
  | { op: 'update_task_status'; task_id: ULID; project: string; status: TaskEntity['status'] }
  | { op: 'mark_blocked'; task_id: ULID; project: string; blocked_by: string; waiting_on?: string }
  | { op: 'mark_unblocked'; task_id: ULID; project: string }
  | { op: 'append_decision'; payload: Omit<DecisionEntity, 'kind' | 'ref'> }
  | { op: 'supersede_decision'; old_id: ULID; new_id: ULID; project: string }
  | { op: 'create_delivery'; payload: Omit<DeliveryEntity, 'kind' | 'ref'> }
  | { op: 'update_delivery_status'; delivery_id: ULID; project: string; status: DeliveryStatus }
  | { op: 'create_note'; payload: Omit<NoteEntity, 'kind' | 'ref'>; body: string }
  | { op: 'add_open_question'; payload: Omit<OpenQuestionEntity, 'kind' | 'ref'> }
  | { op: 'resolve_question'; question_id: ULID; project: string }
  | { op: 'link_note_delivery'; note_id: ULID; delivery_id: ULID }
  | { op: 'upsert_person'; payload: Omit<PersonEntity, 'kind' | 'ref'> }
  | { op: 'archive_project'; project_slug: string }
