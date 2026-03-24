import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Graph } from '@antv/g6'
import type { WorkGraph } from '@/types/graph'
import { workGraphToG6 } from '@/lib/graph-to-g6'
import { GraphControls, type EntityKind } from './GraphControls'
import type { G6GraphData } from '@/lib/graph-to-g6'

interface GraphViewProps {
  graph: WorkGraph
  onDispatchFromEntity?: (objective: string) => void
  onOpenEntity?: (entityKind: string, entityId: string) => void
}

const ALL_KINDS: Set<EntityKind> = new Set([
  'task', 'delivery', 'decision', 'note', 'person', 'open_question', 'session',
])

type ContextMenuState = {
  x: number
  y: number
  nodeId: string
  label: string
  entityKind: string
} | null

export function GraphView({ graph, onDispatchFromEntity, onOpenEntity }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphInstanceRef = useRef<Graph | null>(null)

  // Filter state
  const [activeKinds, setActiveKinds] = useState<Set<EntityKind>>(new Set(ALL_KINDS))
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [activeRelType, setActiveRelType] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  // Close context menu on click anywhere
  useEffect(() => {
    function handleClick() {
      setContextMenu(null)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  // Derive filtered G6 data
  const filteredData = useMemo((): G6GraphData => {
    const raw = workGraphToG6(graph)

    // Filter nodes by entity kind
    let nodes = raw.nodes.filter((n) => {
      const kind = n.data.entityKind as EntityKind
      return activeKinds.has(kind)
    })

    // Filter nodes by status
    if (activeStatus) {
      nodes = nodes.filter((n) => n.data.status === activeStatus)
    }

    // Collect visible node IDs
    const visibleIds = new Set(nodes.map((n) => n.id))

    // Filter edges — both endpoints must be visible
    let edges = raw.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    )

    // Filter edges by relationship type
    if (activeRelType) {
      edges = edges.filter((e) => e.data.relType === activeRelType)
    }

    // Search highlighting — modify node styles
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      nodes = nodes.map((n) => {
        const label = (n.data.label ?? '').toLowerCase()
        const isMatch = label.includes(query)
        return {
          ...n,
          style: {
            ...n.style,
            opacity: isMatch ? 1 : 0.25,
            stroke: isMatch ? '#2563eb' : '#fff',
            lineWidth: isMatch ? 3 : 1.5,
          },
        }
      })
    }

    // Only include combos that have at least one visible child node
    const usedCombos = new Set(nodes.map((n) => n.combo).filter(Boolean))
    const combos = raw.combos.filter((c) => usedCombos.has(c.id))

    return { nodes, edges, combos }
  }, [graph, activeKinds, activeStatus, activeRelType, searchQuery])

  useEffect(() => {
    if (!containerRef.current) return

    // Destroy previous instance if it exists
    if (graphInstanceRef.current) {
      graphInstanceRef.current.destroy()
      graphInstanceRef.current = null
    }

    const g = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      data: filteredData,

      // Node styles — dynamic based on per-node data
      node: {
        type: (datum: Record<string, unknown>) => (datum.type as string) ?? 'circle',
        style: {
          size: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.size as number) ?? 24
          },
          fill: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.fill as string) ?? '#9ca3af'
          },
          opacity: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.opacity as number) ?? 1
          },
          labelText: (datum: Record<string, unknown>) => {
            const d = datum.data as Record<string, unknown> | undefined
            return (d?.label as string) ?? ''
          },
          labelFontSize: 10,
          labelPlacement: 'bottom',
          labelFill: '#374151',
          stroke: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.stroke as string) ?? '#fff'
          },
          lineWidth: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.lineWidth as number) ?? 1.5
          },
        },
      },

      // Edge styles — dynamic based on per-edge data
      edge: {
        style: {
          stroke: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.stroke as string) ?? '#9ca3af'
          },
          lineWidth: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.lineWidth as number) ?? 1
          },
          lineDash: (datum: Record<string, unknown>) => {
            const s = datum.style as Record<string, unknown> | undefined
            return (s?.lineDash as number[]) ?? []
          },
          endArrow: true,
          endArrowSize: 6,
        },
      },

      // Combo styles
      combo: {
        type: 'rect',
        style: {
          stroke: '#475569',
          lineWidth: 1,
          fill: '#f8fafc',
          fillOpacity: 0.3,
          radius: 8,
          padding: 20,
          labelText: (datum: Record<string, unknown>) => {
            const d = datum.data as Record<string, unknown> | undefined
            return (d?.label as string) ?? ''
          },
          labelPlacement: 'top',
          labelFontSize: 12,
          labelFill: '#475569',
          labelFontWeight: 600,
        },
      },

      // Force-directed layout with combo support
      layout: {
        type: 'd3-force',
        preventOverlap: true,
        nodeSize: 30,
        linkDistance: 120,
        chargeStrength: -300,
        collideRadius: 40,
      },

      // Interactive behaviors
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        'drag-element',
      ],

      // Plugins
      plugins: [
        {
          type: 'tooltip',
          key: 'node-tooltip',
          getContent: (_event: unknown, items: Array<Record<string, unknown>>) => {
            if (!items || items.length === 0) return ''
            const item = items[0]
            const data = item.data as Record<string, unknown> | undefined
            if (!data) return ''
            const label = data.label as string ?? ''
            const kind = data.entityKind as string ?? ''
            const status = data.status as string
            let html = `<div style="padding:8px;font-size:13px;max-width:250px;">`
            html += `<div style="font-weight:600;margin-bottom:4px;">${label}</div>`
            html += `<div style="color:#6b7280;font-size:11px;">Kind: ${kind}</div>`
            if (status) {
              html += `<div style="color:#6b7280;font-size:11px;">Status: ${status}</div>`
            }
            html += `</div>`
            return html
          },
          style: {
            '.tooltip': {
              background: '#ffffff',
              color: '#111827',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            },
          },
        },
        {
          type: 'minimap',
          key: 'minimap',
          size: [180, 120],
          position: 'right-bottom',
        },
      ],
    })

    // Right-click context menu handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    g.on('node:contextmenu', (evt: any) => {
      const e = evt.event as MouseEvent | undefined
      if (e) {
        e.preventDefault()
        e.stopPropagation()
      }

      const target = evt.target as Record<string, unknown> | undefined
      const targetId = (target?.id ?? evt.targetId ?? evt.itemId) as string | undefined
      if (!targetId) return

      // Find node data
      const nodeData = filteredData.nodes.find((n) => n.id === targetId)
      if (!nodeData) return

      const clientX = e?.clientX ?? (evt.client as { x: number })?.x ?? 0
      const clientY = e?.clientY ?? (evt.client as { y: number })?.y ?? 0

      setContextMenu({
        x: clientX as number,
        y: clientY as number,
        nodeId: targetId,
        label: nodeData.data.label,
        entityKind: nodeData.data.entityKind,
      })
    })

    g.render()
    graphInstanceRef.current = g

    return () => {
      if (graphInstanceRef.current) {
        graphInstanceRef.current.destroy()
        graphInstanceRef.current = null
      }
    }
  }, [filteredData])

  const handleDispatchFromHere = useCallback(() => {
    if (contextMenu && onDispatchFromEntity) {
      onDispatchFromEntity(contextMenu.label)
    }
    setContextMenu(null)
  }, [contextMenu, onDispatchFromEntity])

  const handleOpenEntity = useCallback(() => {
    if (contextMenu && onOpenEntity) {
      onOpenEntity(contextMenu.entityKind, contextMenu.nodeId)
    }
    setContextMenu(null)
  }, [contextMenu, onOpenEntity])

  return (
    <div className="flex flex-col h-full gap-2">
      <GraphControls
        onFilterKinds={setActiveKinds}
        onFilterStatus={setActiveStatus}
        onFilterRelationship={setActiveRelType}
        onSearch={setSearchQuery}
        activeKinds={activeKinds}
        activeStatus={activeStatus}
        activeRelType={activeRelType}
        searchQuery={searchQuery}
      />
      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          className="w-full h-full min-h-[600px] bg-gray-50 rounded-lg border"
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Right-click context menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-100 truncate max-w-[220px]">
              {contextMenu.label}
            </div>
            {onDispatchFromEntity && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                onClick={handleDispatchFromHere}
              >
                Dispatch from here
              </button>
            )}
            {onOpenEntity && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                onClick={handleOpenEntity}
              >
                Open in editor
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
