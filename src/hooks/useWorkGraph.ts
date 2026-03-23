/**
 * useWorkGraph — Build and maintain the work graph.
 *
 * Reads all entities from ~/twin/ on mount, builds the graph,
 * and rebuilds whenever the file watcher fires.
 */

import { useState, useEffect, useCallback } from 'react'
import { useFileWatcher } from './useFileWatcher'
import { buildGraphFromEntities } from '@/lib/graph-builder'
import {
  listProjects,
  readTasks,
  readDeliveries,
  readDecisions,
  readPeople,
  readNotes,
} from '@/lib/fs'
import type { WorkGraph } from '@/types/graph'
import type { WorkGraphEntity, ProjectEntity } from '@/types/entities'

export function useWorkGraph() {
  const [graph, setGraph] = useState<WorkGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const build = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const slugs = await listProjects()
      const entities: WorkGraphEntity[] = []

      // Create project entities from discovered directories
      for (const slug of slugs) {
        const project: ProjectEntity = {
          kind: 'project',
          slug,
          name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          status: 'active',
          ref: { file: `projects/${slug}` },
        }
        entities.push(project)

        // Read project data files — each may be missing, so handle gracefully
        try {
          const tasks = await readTasks(slug)
          entities.push(...tasks)
        } catch (err) {
          console.warn(`[useWorkGraph] Could not read tasks for ${slug}:`, err)
        }

        try {
          const deliveries = await readDeliveries(slug)
          entities.push(...deliveries)
        } catch (err) {
          console.warn(`[useWorkGraph] Could not read deliveries for ${slug}:`, err)
        }

        try {
          const decisions = await readDecisions(slug)
          entities.push(...decisions)
        } catch (err) {
          console.warn(`[useWorkGraph] Could not read decisions for ${slug}:`, err)
        }

        try {
          const notes = await readNotes(slug)
          entities.push(...notes)
        } catch (err) {
          console.warn(`[useWorkGraph] Could not read notes for ${slug}:`, err)
        }
      }

      // Read people (global)
      try {
        const people = await readPeople()
        entities.push(...people)
      } catch (err) {
        console.warn('[useWorkGraph] Could not read people:', err)
      }

      const workGraph = buildGraphFromEntities(entities)
      setGraph(workGraph)
    } catch (err) {
      console.error('[useWorkGraph] Build failed:', err)
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [])

  // Build on mount
  useEffect(() => {
    build()
  }, [build])

  // Rebuild on file changes
  useFileWatcher(build)

  return { graph, loading, error, rebuild: build }
}
