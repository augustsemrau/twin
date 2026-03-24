/**
 * capture.ts — Twin's capture system
 *
 * Pure functions for generating capture filenames and content,
 * plus the async captureToInbox function for writing to ~/twin/inbox/.
 *
 * Key behaviour:
 * - Local timestamps (not UTC) — per spec section 6.3
 * - File write happens before Resolver runs (capture is never blocked by AI)
 * - Resolver output is written back as frontmatter after completion
 */

import type { WorkGraph } from '@/types/graph'
import type { ResolverOutput } from '@/types/agents'
import { writeInbox } from '@/lib/fs'
import { runResolver } from '@/lib/resolver'
import matter from 'gray-matter'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function localISOString(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function generateCaptureFilename(text: string, now: Date = new Date()): string {
  const ts =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`

  let slug =
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s/g, '-')   // each space → hyphen (preserves double-space as double-hyphen)
      .slice(0, 40)

  // If we cut mid-word, trim back to last hyphen boundary
  if (slug.length === 40 && !slug.endsWith('-')) {
    const lastHyphen = slug.lastIndexOf('-')
    if (lastHyphen > 0) {
      slug = slug.slice(0, lastHyphen)
    }
  }

  // Strip trailing hyphen
  slug = slug.replace(/-$/, '') || 'capture'

  return `${ts}-${slug}.md`
}

export function formatCaptureContent(text: string, now: Date = new Date()): string {
  const captured = localISOString(now)
  return `---\ncaptured: ${captured}\nraw: true\nsource: capture\n---\n\n${text}\n`
}

// ---------------------------------------------------------------------------
// Async I/O
// ---------------------------------------------------------------------------

function serializeResolverOutput(output: ResolverOutput): string {
  return JSON.stringify(output)
}

async function readInboxFile(filename: string): Promise<string> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  const { inboxPath } = await import('@/lib/paths')
  const { join } = await import('@tauri-apps/api/path')
  const dir = await inboxPath()
  const path = await join(dir, filename)
  return readTextFile(path)
}

async function updateInboxFrontmatter(
  filename: string,
  update: Record<string, string>,
): Promise<void> {
  // Re-read the file from disk to avoid stale content issues
  const currentContent = await readInboxFile(filename)
  const { data, content: body } = matter(currentContent)

  // Merge update keys into existing frontmatter
  const merged = { ...data, ...update }
  const newContent = matter.stringify(body, merged)
  await writeInbox(filename, newContent)
}

export async function captureToInbox(
  text: string,
  graph: WorkGraph,
  activeProject?: string,
): Promise<string> {
  const now = new Date()
  const filename = generateCaptureFilename(text, now)
  const content = formatCaptureContent(text, now)

  // Write file immediately — never block on AI
  await writeInbox(filename, content)

  // Trigger Resolver in background (non-blocking)
  runResolver(text, graph, activeProject)
    .then(async (output) => {
      try {
        await updateInboxFrontmatter(filename, {
          resolver_output: JSON.stringify(serializeResolverOutput(output)),
        })
      } catch (err) {
        console.warn('[capture] Could not write resolver_output to frontmatter:', err)
      }
    })
    .catch(async (err) => {
      console.warn('[capture] Resolver failed:', err)
      try {
        const message = err instanceof Error ? err.message : String(err)
        await updateInboxFrontmatter(filename, {
          resolver_error: JSON.stringify(message),
        })
      } catch (writeErr) {
        console.warn('[capture] Could not write resolver_error to frontmatter:', writeErr)
      }
    })

  return filename
}
