import { useEffect, useRef } from 'react'
import { Graph } from '@antv/g6'
import type { WorkGraph } from '@/types/graph'
import { workGraphToG6 } from '@/lib/graph-to-g6'

interface GraphViewProps {
  graph: WorkGraph
}

export function GraphView({ graph }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphInstanceRef = useRef<Graph | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Destroy previous instance if it exists
    if (graphInstanceRef.current) {
      graphInstanceRef.current.destroy()
      graphInstanceRef.current = null
    }

    const g6Data = workGraphToG6(graph)

    const g = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      data: g6Data,

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
          labelText: (datum: Record<string, unknown>) => {
            const d = datum.data as Record<string, unknown> | undefined
            return (d?.label as string) ?? ''
          },
          labelFontSize: 10,
          labelPlacement: 'bottom',
          labelFill: '#374151',
          stroke: '#fff',
          lineWidth: 1.5,
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

    g.render()
    graphInstanceRef.current = g

    return () => {
      if (graphInstanceRef.current) {
        graphInstanceRef.current.destroy()
        graphInstanceRef.current = null
      }
    }
  }, [graph])

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[600px] bg-gray-50 rounded-lg border"
    />
  )
}
