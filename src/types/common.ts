export type ULID = string
export type ISODate = string
export type ISOTimestamp = string

export type NoteType =
  | 'thought' | 'meeting' | 'decision'
  | 'reference' | 'chat_learning' | 'conversation'

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type DeliveryType = 'deck' | 'doc' | 'spec' | 'code' | 'report' | 'email' | 'other'
export type DeliveryStatus = 'draft' | 'in_review' | 'delivered' | 'archived'
export type DecisionStatus = 'active' | 'superseded'
export type QuestionStatus = 'open' | 'resolved'
export type DispatchTarget = 'chat' | 'code' | 'cowork'
export type DispatchScope = 'me' | 'project' | 'note'
export type Confidence = 'high' | 'medium' | 'low'
