import type { WorkGraph } from '@/types/graph'
import type { WorkGraphEntity } from '@/types/entities'

// G6 v5 data types
export type G6NodeData = {
  id: string
  type: string
  data: {
    label: string
    entityKind: string
    status?: string
    priority?: string | number
    [key: string]: unknown
  }
  style?: Record<string, unknown>
  combo?: string
}

export type G6EdgeData = {
  id: string
  source: string
  target: string
  data: {
    label: string
    relType: string
  }
  style?: Record<string, unknown>
}

export type G6ComboData = {
  id: string
  data: {
    label: string
  }
  style?: Record<string, unknown>
}

export type G6GraphData = {
  nodes: G6NodeData[]
  edges: G6EdgeData[]
  combos: G6ComboData[]
}

// --- Node visual encoding ---

const TASK_STATUS_COLOURS: Record<string, string> = {
  todo: '#3b82f6',        // blue
  in_progress: '#f59e0b', // amber
  blocked: '#ef4444',     // red
  done: '#22c55e',        // green
}

const DECISION_STATUS_COLOURS: Record<string, string> = {
  active: '#14b8a6',      // teal
  superseded: '#9ca3af',  // grey
}

const QUESTION_STATUS_COLOURS: Record<string, string> = {
  open: '#eab308',        // yellow
  resolved: '#9ca3af',    // grey
}

const ENTITY_KIND_COLOURS: Record<string, string> = {
  delivery: '#a855f7',    // purple
  note: '#e5e7eb',        // light grey
  person: '#f97316',      // orange
  session: '#ec4899',     // pink
}

const ENTITY_KIND_SHAPES: Record<string, string> = {
  task: 'circle',
  delivery: 'diamond',
  decision: 'hexagon',
  note: 'rect',
  person: 'circle',
  open_question: 'triangle',
  session: 'rect',
}

const ENTITY_KIND_SIZES: Record<string, number> = {
  task: 28,
  delivery: 28,
  decision: 28,
  note: 20,
  person: 28,
  open_question: 24,
  session: 24,
}

// --- Edge visual encoding ---

type EdgeStyle = {
  stroke: string
  lineWidth: number
  lineDash?: number[]
}

const EDGE_STYLES: Record<string, EdgeStyle> = {
  blocks:     { stroke: '#ef4444', lineWidth: 2 },
  unblocks:   { stroke: '#22c55e', lineWidth: 1, lineDash: [5, 5] },
  informs:    { stroke: '#9ca3af', lineWidth: 1 },
  delivers:   { stroke: '#a855f7', lineWidth: 1.5 },
  involves:   { stroke: '#f97316', lineWidth: 1, lineDash: [2, 2] },
  supersedes: { stroke: '#9ca3af', lineWidth: 1, lineDash: [5, 5] },
  raises:     { stroke: '#eab308', lineWidth: 1 },
  produces:   { stroke: '#ec4899', lineWidth: 1 },
}

// --- Label extraction ---

function getLabel(entity: WorkGraphEntity): string {
  switch (entity.kind) {
    case 'project': return entity.name
    case 'task': return entity.title
    case 'delivery': return entity.title
    case 'decision': return entity.title
    case 'note': return entity.title
    case 'person': return entity.name
    case 'open_question': return entity.question
    case 'session': return entity.objective
  }
}

function getEntityId(entity: WorkGraphEntity): string {
  if (entity.kind === 'project') return entity.slug
  return entity.id
}

function getProject(entity: WorkGraphEntity): string | undefined {
  switch (entity.kind) {
    case 'task':
    case 'delivery':
    case 'decision':
    case 'open_question':
      return entity.project
    case 'note':
      return entity.project
    default:
      return undefined
  }
}

function getNodeFill(entity: WorkGraphEntity): string {
  switch (entity.kind) {
    case 'task':
      return TASK_STATUS_COLOURS[entity.status] ?? '#3b82f6'
    case 'decision':
      return DECISION_STATUS_COLOURS[entity.status] ?? '#14b8a6'
    case 'open_question':
      return QUESTION_STATUS_COLOURS[entity.status] ?? '#eab308'
    default:
      return ENTITY_KIND_COLOURS[entity.kind] ?? '#9ca3af'
  }
}

function getStatus(entity: WorkGraphEntity): string | undefined {
  if ('status' in entity) return entity.status as string
  return undefined
}

// --- Main transform ---

export function workGraphToG6(graph: WorkGraph): G6GraphData {
  const nodes: G6NodeData[] = []
  const combos: G6ComboData[] = []

  for (const entity of graph.entities) {
    if (entity.kind === 'project') {
      combos.push({
        id: entity.slug,
        data: { label: entity.name },
        style: {
          stroke: '#475569', // slate
          lineWidth: 1,
        },
      })
      continue
    }

    const id = getEntityId(entity)
    const project = getProject(entity)

    const node: G6NodeData = {
      id,
      type: ENTITY_KIND_SHAPES[entity.kind] ?? 'circle',
      data: {
        label: getLabel(entity),
        entityKind: entity.kind,
        status: getStatus(entity),
      },
      style: {
        fill: getNodeFill(entity),
        size: ENTITY_KIND_SIZES[entity.kind] ?? 24,
        labelText: getLabel(entity),
        labelFontSize: 10,
        labelPlacement: 'bottom' as const,
      },
    }

    if (project) {
      node.combo = project
    }

    nodes.push(node)
  }

  // Edges: skip belongs_to (handled by combo membership)
  const edges: G6EdgeData[] = []
  for (const rel of graph.relationships) {
    if (rel.type === 'belongs_to') continue

    const style = EDGE_STYLES[rel.type]
    if (!style) continue

    const edgeStyle: Record<string, unknown> = {
      stroke: style.stroke,
      lineWidth: style.lineWidth,
    }
    if (style.lineDash) {
      edgeStyle.lineDash = style.lineDash
    }

    edges.push({
      id: `${rel.from.id}-${rel.type}-${rel.to.id}`,
      source: rel.from.id,
      target: rel.to.id,
      data: {
        label: rel.type,
        relType: rel.type,
      },
      style: edgeStyle,
    })
  }

  return { nodes, edges, combos }
}
