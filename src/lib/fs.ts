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
} from '@/types/entities'
import type { TaskStatus, DeliveryType, DeliveryStatus, DecisionStatus, NoteType } from '@/types/common'

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
  const { readTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'tasks.yaml')
  const content = await readTextFile(path)
  return parseTasks(content, projectSlug)
}

export async function readDeliveries(projectSlug: string): Promise<DeliveryEntity[]> {
  const { readTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'deliveries.yaml')
  const content = await readTextFile(path)
  return parseDeliveries(content, projectSlug)
}

export async function readDecisions(projectSlug: string): Promise<DecisionEntity[]> {
  const { readTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'decisions.yaml')
  const content = await readTextFile(path)
  return parseDecisions(content, projectSlug)
}

export async function readActiveDecisions(projectSlug: string): Promise<DecisionEntity[]> {
  const all = await readDecisions(projectSlug)
  return all.filter((d) => d.status === 'active')
}

export async function readPeople(): Promise<PersonEntity[]> {
  const { readTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await paths.peoplePath()
  const content = await readTextFile(path)
  return parsePeople(content)
}

export async function readNotes(projectSlug: string): Promise<NoteEntity[]> {
  const { readTextFile, readDir } = await tauriFs()
  const paths = await tauriPaths()
  const notesDir = await paths.projectNotesPath(projectSlug)
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

// --- Write functions ---

export async function writeTasks(projectSlug: string, tasks: TaskEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'tasks.yaml')
  await writeTextFile(path, serializeTasks(tasks))
}

export async function writeDeliveries(projectSlug: string, deliveries: DeliveryEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'deliveries.yaml')
  await writeTextFile(path, serializeDeliveries(deliveries))
}

export async function writeDecisions(projectSlug: string, decisions: DecisionEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await tauriJoin(await paths.projectPath(projectSlug), 'decisions.yaml')
  await writeTextFile(path, serializeDecisions(decisions))
}

export async function writePeople(people: PersonEntity[]): Promise<void> {
  const { writeTextFile } = await tauriFs()
  const paths = await tauriPaths()
  const path = await paths.peoplePath()
  await writeTextFile(path, serializePeople(people))
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
  const { rename } = await tauriFs()
  const paths = await tauriPaths()
  const src = await paths.projectPath(projectSlug)
  const dest = await tauriJoin(await paths.archivePath(), 'projects', projectSlug)
  await rename(src, dest)
}

export async function archiveSessions(sessionIds: string[]): Promise<void> {
  const { rename } = await tauriFs()
  const paths = await tauriPaths()
  const sessionsDir = await paths.sessionsPath()
  const archiveDir = await tauriJoin(await paths.archivePath(), 'sessions')
  for (const id of sessionIds) {
    const src = await tauriJoin(sessionsDir, `${id}.md`)
    const dest = await tauriJoin(archiveDir, `${id}.md`)
    await rename(src, dest)
  }
}
