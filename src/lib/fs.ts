/**
 * fs.ts — Twin's filesystem layer
 *
 * Two layers:
 * 1. Pure parsing/serialization functions (testable without Tauri)
 * 2. Async I/O wrappers (call Tauri's @tauri-apps/plugin-fs)
 *
 * All filesystem operations go through this module.
 * Components never call Tauri's fs plugin directly.
 */

import { readYamlList, toYamlString } from './yaml-utils'
import { parseNote } from './frontmatter'
import type {
  TaskEntity,
  DeliveryEntity,
  DecisionEntity,
  PersonEntity,
  NoteEntity,
  InboxItem,
} from '@/types/entities'
import type { ResolverOutput } from '@/types/agents'
import type { TaskStatus, DeliveryType, DeliveryStatus, DecisionStatus, NoteType } from '@/types/common'
import matter from 'gray-matter'

// ---------------------------------------------------------------------------
// Pure parsing functions
// ---------------------------------------------------------------------------

export function parseTasks(yaml: string, projectSlug: string): TaskEntity[] {
  const raw = readYamlList<Record<string, unknown>>(yaml, 'tasks')
  return raw.map((item) => ({
    kind: 'task' as const,
    id: String(item.id),
    title: String(item.title),
    status: String(item.status) as TaskStatus,
    priority: (item.priority ?? undefined) as TaskEntity['priority'],
    due_date: item.due != null ? String(item.due) : null,
    blocked_by: item.blocked_by != null ? String(item.blocked_by) : null,
    waiting_on: item.waiting_on != null ? String(item.waiting_on) : null,
    delivery: item.delivery != null ? String(item.delivery) : null,
    project: projectSlug,
    ref: { file: `projects/${projectSlug}/tasks.yaml` },
  })) as unknown as TaskEntity[]
}

export function parseDeliveries(yaml: string, projectSlug: string): DeliveryEntity[] {
  const raw = readYamlList<Record<string, unknown>>(yaml, 'deliveries')
  return raw.map((item) => ({
    kind: 'delivery' as const,
    id: String(item.id),
    title: String(item.title ?? ''),
    slug: String(item.slug),
    type: String(item.type) as DeliveryType,
    status: String(item.status) as DeliveryStatus,
    due_date: item.due != null ? String(item.due) : null,
    brief: item.brief != null ? String(item.brief) : null,
    project: projectSlug,
    ref: { file: `projects/${projectSlug}/deliveries.yaml` },
  })) as unknown as DeliveryEntity[]
}

export function parseDecisions(yaml: string, projectSlug: string): DecisionEntity[] {
  const raw = readYamlList<Record<string, unknown>>(yaml, 'decisions')
  return raw.map((item) => ({
    kind: 'decision' as const,
    id: String(item.id),
    title: String(item.title ?? ''),
    decision: String(item.decision ?? ''),
    rationale: item.rationale != null ? String(item.rationale).trim() : null,
    date: String(item.date),
    decided_by: item.decided_by != null ? String(item.decided_by) : undefined,
    unblocks: Array.isArray(item.unblocks) ? item.unblocks.map(String) : [],
    status: String(item.status) as DecisionStatus,
    superseded_by: item.superseded_by != null ? String(item.superseded_by) : null,
    project: projectSlug,
    ref: { file: `projects/${projectSlug}/decisions.yaml` },
  })) as unknown as DecisionEntity[]
}

export function parsePeople(yaml: string): PersonEntity[] {
  const raw = readYamlList<Record<string, unknown>>(yaml, 'people')
  return raw.map((item) => ({
    kind: 'person' as const,
    id: String(item.id),
    name: String(item.name),
    role: item.role != null ? String(item.role) : undefined,
    projects: Array.isArray(item.projects) ? item.projects.map(String) : [],
    ref: { file: 'people.yaml' },
  }))
}

export function parseNotes(
  files: Array<{ filename: string; content: string }>,
  projectSlug: string,
): NoteEntity[] {
  return files.map(({ filename, content }) => {
    const note = parseNote(content, filename)
    return {
      kind: 'note' as const,
      id: note.id,
      filename: note.filename,
      title: note.title,
      type: note.type as NoteType,
      project: note.project,
      twin_synced: note.twin_synced,
      people: note.people ?? [],
      ref: { file: `projects/${projectSlug}/notes/${filename}` },
    }
  })
}

// ---------------------------------------------------------------------------
// Serialization functions
// ---------------------------------------------------------------------------

export function serializeTasks(tasks: TaskEntity[]): string {
  const items = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: t.due_date,
    blocked_by: t.blocked_by,
    waiting_on: t.waiting_on,
    delivery: t.delivery,
  }))
  return toYamlString({ tasks: items })
}

export function serializeDeliveries(deliveries: DeliveryEntity[]): string {
  const items = deliveries.map((d) => ({
    id: d.id,
    title: d.title,
    slug: d.slug,
    type: d.type,
    status: d.status,
    due: (d as unknown as Record<string, unknown>).due_date ?? undefined,
    brief: d.brief,
  }))
  return toYamlString({ deliveries: items })
}

export function serializeDecisions(decisions: DecisionEntity[]): string {
  const items = decisions.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    date: d.date,
    decided_by: d.decided_by,
    unblocks: d.unblocks,
    decision: d.decision,
    rationale: d.rationale,
    ...(d.superseded_by ? { superseded_by: d.superseded_by } : {}),
  }))
  return toYamlString({ decisions: items })
}

export function serializePeople(people: PersonEntity[]): string {
  const items = people.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    projects: p.projects,
  }))
  return toYamlString({ people: items })
}

// ---------------------------------------------------------------------------
// Async I/O wrappers (Tauri runtime only — tested in integration)
// ---------------------------------------------------------------------------

// These imports will fail outside Tauri runtime but that's expected.
// They are only called from the async functions below.

async function tauriFs() {
  return await import('@tauri-apps/plugin-fs')
}

async function tauriPaths() {
  return await import('./paths')
}

async function tauriJoin(...parts: string[]) {
  const { join } = await import('@tauri-apps/api/path')
  return join(...parts)
}

// --- Read functions ---

export async function readTasks(projectSlug: string): Promise<TaskEntity[]> {
  const { readTextFile, exists } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'tasks.yaml')
  try {
    const fileExists = await exists(path)
    if (!fileExists) return []
    const content = await readTextFile(path)
    return parseTasks(content, projectSlug)
  } catch (err) {
    console.warn(`[fs] Could not read tasks.yaml for ${projectSlug}:`, err)
    return []
  }
}

export async function readDeliveries(projectSlug: string): Promise<DeliveryEntity[]> {
  const { readTextFile, exists } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'deliveries.yaml')
  try {
    const fileExists = await exists(path)
    if (!fileExists) return []
    const content = await readTextFile(path)
    return parseDeliveries(content, projectSlug)
  } catch (err) {
    console.warn(`[fs] Could not read deliveries.yaml for ${projectSlug}:`, err)
    return []
  }
}

export async function readDecisions(projectSlug: string): Promise<DecisionEntity[]> {
  const { readTextFile, exists } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'decisions.yaml')
  try {
    const fileExists = await exists(path)
    if (!fileExists) return []
    const content = await readTextFile(path)
    return parseDecisions(content, projectSlug)
  } catch (err) {
    console.warn(`[fs] Could not read decisions.yaml for ${projectSlug}:`, err)
    return []
  }
}

export async function readActiveDecisions(projectSlug: string): Promise<DecisionEntity[]> {
  const all = await readDecisions(projectSlug)
  return all.filter((d) => d.status === 'active')
}

export async function readPeople(): Promise<PersonEntity[]> {
  const { readTextFile, exists } = await tauriFs()
  const paths = await tauriPaths()
  const path = await paths.peoplePath()
  try {
    const fileExists = await exists(path)
    if (!fileExists) return []
  } catch {
    return []
  }
  const content = await readTextFile(path)
  return parsePeople(content)
}

export async function readNotes(projectSlug: string): Promise<NoteEntity[]> {
  const { readTextFile, readDir, exists } = await tauriFs()
  const paths = await tauriPaths()
  const notesDir = await paths.projectNotesPath(projectSlug)

  // Return empty array if notes/ directory doesn't exist
  try {
    const dirExists = await exists(notesDir)
    if (!dirExists) return []
  } catch {
    return []
  }

  const entries = await readDir(notesDir)
  const files: Array<{ filename: string; content: string }> = []
  for (const entry of entries) {
    if (entry.name && entry.name.endsWith('.md')) {
      const filePath = await tauriJoin(notesDir, entry.name)
      const content = await readTextFile(filePath)
      files.push({ filename: entry.name, content })
    }
  }
  return parseNotes(files, projectSlug)
}

// --- Mtime tracking for optimistic concurrency ---

const _knownMtimes: Map<string, number> = new Map()

/**
 * Record the mtime of a file after reading it.
 * Called after read operations that precede writes.
 */
export function trackMtime(path: string, mtime: number): void {
  _knownMtimes.set(path, mtime)
}

/**
 * Check if a file has been modified since we last read it.
 * Returns true if there's a conflict (file was modified externally).
 * Logs a warning if conflict detected; does not block the write.
 */
async function checkMtimeConflict(path: string): Promise<boolean> {
  const knownMtime = _knownMtimes.get(path)
  if (knownMtime == null) return false // No prior read recorded — no conflict possible

  const currentMtime = await getMtime(path)
  if (!currentMtime) return false

  if (currentMtime.getTime() > knownMtime) {
    console.warn(
      `[fs] Concurrent edit detected: ${path} was modified since last read ` +
      `(known: ${new Date(knownMtime).toISOString()}, current: ${currentMtime.toISOString()}). ` +
      `Proceeding with write — the external change may be overwritten.`
    )
    return true
  }
  return false
}

/**
 * Update the known mtime after a write operation.
 */
async function refreshMtime(path: string): Promise<void> {
  const mtime = await getMtime(path)
  if (mtime) {
    _knownMtimes.set(path, mtime.getTime())
  }
}

// Exported for testing
export { _knownMtimes as __knownMtimes_for_testing }

// --- Write functions ---

export async function writeTasks(projectSlug: string, tasks: TaskEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'tasks.yaml')
  await checkMtimeConflict(path)
  await writeTextFile(path, serializeTasks(tasks))
  await refreshMtime(path)
}

export async function writeDeliveries(projectSlug: string, deliveries: DeliveryEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'deliveries.yaml')
  await checkMtimeConflict(path)
  await writeTextFile(path, serializeDeliveries(deliveries))
  await refreshMtime(path)
}

export async function writeDecisions(projectSlug: string, decisions: DecisionEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'decisions.yaml')
  await checkMtimeConflict(path)
  await writeTextFile(path, serializeDecisions(decisions))
  await refreshMtime(path)
}

export async function writePeople(people: PersonEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await paths.peoplePath()
  await checkMtimeConflict(path)
  await writeTextFile(path, serializePeople(people))
  await refreshMtime(path)
}

// --- Decision helpers ---

export async function appendDecision(projectSlug: string, decision: DecisionEntity): Promise<void> {
  const existing = await readDecisions(projectSlug)
  existing.push(decision)
  await writeDecisions(projectSlug, existing)
}

export async function supersedeDecision(
  projectSlug: string,
  oldId: string,
  newDecision: DecisionEntity,
): Promise<void> {
  const existing = await readDecisions(projectSlug)
  const idx = existing.findIndex((d) => d.id === oldId)
  if (idx !== -1) {
    existing[idx] = { ...existing[idx], status: 'superseded', superseded_by: newDecision.id }
  }
  existing.push(newDecision)
  await writeDecisions(projectSlug, existing)
}

// --- Mtime ---

export async function getMtime(path: string): Promise<Date | null> {
  try {
    const { stat } = await tauriFs()
    const info = await stat(path)
    return info.mtime ? new Date(info.mtime) : null
  } catch {
    return null
  }
}

// --- Projects ---

export async function listProjects(): Promise<string[]> {
  const { readDir } = await tauriFs()
  const paths = await tauriPaths()
  const projectsDir = await tauriJoin(await paths.twinHome(), 'projects')
  const entries = await readDir(projectsDir)
  return entries
    .filter((e) => e.isDirectory)
    .map((e) => e.name)
    .filter((name): name is string => name != null)
}

// --- Inbox ---

export async function listInbox(): Promise<string[]> {
  const { readDir } = await tauriFs()
  const paths = await tauriPaths()
  const dir = await paths.inboxPath()
  const entries = await readDir(dir)
  return entries
    .map((e) => e.name)
    .filter((name): name is string => name != null)
}

export async function writeInbox(filename: string, content: string): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.inboxPath(), filename)
  await writeTextFile(path, content)
}

export async function clearInbox(filename: string): Promise<void> {
  const { remove } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.inboxPath(), filename)
  await remove(path)
}

export async function readInboxItems(): Promise<InboxItem[]> {
  const { readTextFile, readDir } = await tauriFs()
  const paths = await tauriPaths()
  const dir = await paths.inboxPath()
  const entries = await readDir(dir)
  const items: InboxItem[] = []

  for (const entry of entries) {
    if (!entry.name || !entry.name.endsWith('.md')) continue
    const filePath = await tauriJoin(dir, entry.name)
    const content = await readTextFile(filePath)
    const item = parseInboxContent(content, entry.name)
    items.push(item)
  }

  return items
}

export function parseInboxContent(content: string, filename: string): InboxItem {
  const { data, content: body } = matter(content)

  let resolverOutput: ResolverOutput | undefined
  if (data.resolver_output) {
    try {
      resolverOutput = typeof data.resolver_output === 'string'
        ? JSON.parse(data.resolver_output)
        : data.resolver_output
    } catch {
      // If parsing fails, treat as no resolver output
    }
  }

  let resolverError: string | undefined
  if (data.resolver_error) {
    try {
      resolverError = typeof data.resolver_error === 'string'
        ? JSON.parse(data.resolver_error)
        : String(data.resolver_error)
    } catch {
      resolverError = String(data.resolver_error)
    }
  }

  // gray-matter parses date-like strings into Date objects — convert back to string
  let captured = ''
  if (data.captured instanceof Date) {
    captured = data.captured.toISOString()
  } else if (data.captured != null) {
    captured = String(data.captured)
  }

  return {
    filename,
    captured,
    raw: body.trim(),
    resolver_output: resolverOutput,
    resolver_error: resolverError,
  }
}

export async function writeNote(
  projectSlug: string,
  filename: string,
  content: string,
): Promise<void> {
  const { writeTextFile, mkdir } = await tauriFs()
  const paths = await tauriPaths()
  const notesDir = await paths.projectNotesPath(projectSlug)
  await mkdir(notesDir, { recursive: true })
  const path = await tauriJoin(notesDir, filename)
  await writeTextFile(path, content)
}

// --- CLAUDE.md generation ---

export async function writeProjectCLAUDE(projectSlug: string, content: string): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'CLAUDE.md')
  await writeTextFile(path, content)
}

export async function writeGlobalCLAUDE(content: string): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await paths.globalClaudePath()
  await writeTextFile(path, content)
}

// --- Sessions ---

export async function writeSessionPack(sessionId: string, content: string): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const dir = await paths.sessionsPath()
  const path = await tauriJoin(dir, `${sessionId}.md`)
  await writeTextFile(path, content)
}

export async function readSessionManifest(sessionId: string): Promise<string> {
  const { readTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const dir = await paths.sessionsPath()
  const path = await tauriJoin(dir, `${sessionId}-manifest.yaml`)
  return readTextFile(path)
}

export async function listSessions(): Promise<string[]> {
  const { readDir } = await tauriFs()
  const paths = await tauriPaths()
  const dir = await paths.sessionsPath()
  const entries = await readDir(dir)
  return entries
    .map((e) => e.name)
    .filter((name): name is string => name != null)
}

// --- Archive ---

export async function archiveProject(projectSlug: string): Promise<void> {
  const { rename, mkdir } = await tauriFs()
  const paths = await tauriPaths()
  const src = await paths.projectPath(projectSlug)
  const archiveProjectsDir = await tauriJoin(await paths.archivePath(), 'projects')
  await mkdir(archiveProjectsDir, { recursive: true })
  const dest = await tauriJoin(archiveProjectsDir, projectSlug)
  await rename(src, dest)
}

export async function restoreProject(projectSlug: string): Promise<void> {
  const { rename } = await tauriFs()
  const paths = await tauriPaths()
  const src = await tauriJoin(await paths.archivePath(), 'projects', projectSlug)
  const dest = await paths.projectPath(projectSlug)
  await rename(src, dest)
}

export async function listArchivedProjects(): Promise<string[]> {
  const { readDir, exists } = await tauriFs()
  const paths = await tauriPaths()
  const archiveProjectsDir = await tauriJoin(await paths.archivePath(), 'projects')
  try {
    const dirExists = await exists(archiveProjectsDir)
    if (!dirExists) return []
  } catch {
    return []
  }
  const entries = await readDir(archiveProjectsDir)
  return entries
    .filter((e) => e.isDirectory)
    .map((e) => e.name)
    .filter((name): name is string => name != null)
}

export async function archiveSessions(sessionIds: string[]): Promise<void> {
  const { rename, mkdir } = await tauriFs()
  const paths = await tauriPaths()
  const sessionsDir = await paths.sessionsPath()
  const archiveDir = await tauriJoin(await paths.archivePath(), 'sessions')
  await mkdir(archiveDir, { recursive: true })
  for (const id of sessionIds) {
    const src = await tauriJoin(sessionsDir, `${id}.md`)
    const dest = await tauriJoin(archiveDir, `${id}.md`)
    await rename(src, dest)
  }
}

export async function archiveOldSessions(olderThanDays: number = 30): Promise<void> {
  const { readDir, stat, rename, mkdir, exists } = await tauriFs()
  const paths = await tauriPaths()
  const sessionsDir = await paths.sessionsPath()

  try {
    const dirExists = await exists(sessionsDir)
    if (!dirExists) return
  } catch {
    return
  }

  const entries = await readDir(sessionsDir)
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  const archiveDir = await tauriJoin(await paths.archivePath(), 'sessions')
  let archiveDirCreated = false

  for (const entry of entries) {
    if (!entry.name || !entry.name.endsWith('.md')) continue
    try {
      const filePath = await tauriJoin(sessionsDir, entry.name)
      const info = await stat(filePath)
      const mtime = info.mtime ? new Date(info.mtime).getTime() : Date.now()
      if (mtime < cutoff) {
        if (!archiveDirCreated) {
          await mkdir(archiveDir, { recursive: true })
          archiveDirCreated = true
        }
        const dest = await tauriJoin(archiveDir, entry.name)
        await rename(filePath, dest)
      }
    } catch {
      // Skip files that can't be stat'd or moved
    }
  }
}
