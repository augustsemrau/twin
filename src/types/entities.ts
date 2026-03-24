import type { ULID, ISODate, ISOTimestamp, NoteType, TaskStatus, DeliveryType, DeliveryStatus, DecisionStatus, QuestionStatus } from './common'

export type EntityRef = {
  file: string
  line?: number
}

export type ProjectEntity = {
  kind: 'project'
  ref: EntityRef
  slug: string
  name: string
  status: string
}

export type TaskEntity = {
  kind: 'task'
  ref: EntityRef
  id: ULID
  title: string
  status: TaskStatus
  priority: 'high' | 'medium' | 'low'
  due_date?: ISODate
  blocked_by?: string
  waiting_on?: string
  project: string
  delivery?: ULID
}

export type DeliveryEntity = {
  kind: 'delivery'
  ref: EntityRef
  id: ULID
  slug: string
  title: string
  type: DeliveryType
  status: DeliveryStatus
  due_date?: ISODate
  brief?: string
  project: string
}

export type DecisionEntity = {
  kind: 'decision'
  ref: EntityRef
  id: ULID
  title: string
  decision: string
  rationale?: string
  unblocks: ULID[]
  date: ISODate
  decided_by?: string
  project: string
  status: DecisionStatus
  superseded_by?: ULID
}

export type NoteEntity = {
  kind: 'note'
  ref: EntityRef
  id: ULID
  filename: string
  title: string
  type: NoteType
  project?: string
  twin_synced: boolean
  people: string[]
}

export type PersonEntity = {
  kind: 'person'
  ref: EntityRef
  id: ULID
  name: string
  role?: string
  projects: string[]
}

export type OpenQuestionEntity = {
  kind: 'open_question'
  ref: EntityRef
  id: ULID
  question: string
  project: string
  source_note?: ULID
  status: QuestionStatus
}

export type SessionEntity = {
  kind: 'session'
  ref: EntityRef
  id: ULID
  target: string
  objective: string
  status: string
}

export type WorkGraphEntity =
  | ProjectEntity
  | TaskEntity
  | DeliveryEntity
  | DecisionEntity
  | NoteEntity
  | PersonEntity
  | OpenQuestionEntity
  | SessionEntity

export type Note = {
  id: ULID
  filename: string
  title: string
  type: NoteType
  project?: string
  twin_synced: boolean
  linked_delivery?: ULID
  people?: string[]
  date?: ISODate
  created: ISOTimestamp
  updated: ISOTimestamp
  body: string
}

export type InboxItem = {
  filename: string
  captured: ISOTimestamp
  raw: string
  resolver_output?: unknown
  resolver_error?: string
}

export type ConversationNote = Note & {
  discussed: string
  agreed: string
  open_questions: string
}
