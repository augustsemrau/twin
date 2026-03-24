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

async function updateInboxFrontmatter(
  filename: string,
  originalContent: string,
  update: Record<string, string>,
): Promise<void> {
  // Simple frontmatter update — replace the closing --- and inject new keys
  const closingIdx = originalContent.indexOf('\n---\n', 4)
  if (closingIdx === -1) return

  const existingFrontmatter = originalContent.slice(0, closingIdx)
  const body = originalContent.slice(closingIdx + 5) // skip '\n---\n'

  const extraLines = Object.entries(update)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  const newContent = `${existingFrontmatter}\n${extraLines}\n---\n\n${body.trimStart()}`
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
        await updateInboxFrontmatter(filename, content, {
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
        await updateInboxFrontmatter(filename, content, {
          resolver_error: JSON.stringify(message),
        })
      } catch (writeErr) {
        console.warn('[capture] Could not write resolver_error to frontmatter:', writeErr)
      }
    })

  return filename
}
