import type { WorkGraphEntity } from './entities'

export type RelationshipType =
  | 'blocks' | 'unblocks' | 'informs' | 'produces'
  | 'involves' | 'belongs_to' | 'supersedes' | 'delivers' | 'raises'

export type Relationship = {
  from: { kind: WorkGraphEntity['kind']; id: string }
  to: { kind: WorkGraphEntity['kind']; id: string }
  type: RelationshipType
}

export type WorkGraph = {
  entities: WorkGraphEntity[]
  relationships: Relationship[]
  built_at: number
  file_mtimes: Record<string, number>
}
