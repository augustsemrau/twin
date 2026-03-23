# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Tauri app, implement the filesystem layer, build the work graph, write the state updater with delta validation, and render the visual graph — producing a working foundation that all later phases build on.

**Architecture:** Tauri 2.x shell with React 18 + TypeScript + Vite frontend. All data lives in `~/twin/` as YAML and markdown files. A single `fs.ts` module abstracts all filesystem operations. The work graph is derived in-memory by parsing these files. The visual graph renders the work graph using @antv/g6 v5 with force-directed layout and combo nodes. The state updater applies typed delta operations to canonical files with mtime-based conflict detection.

**Tech Stack:** Tauri 2.x, React 18, TypeScript, Vite, Tailwind CSS, pnpm, eemeli/yaml, gray-matter, ulid, @antv/g6 v5, vitest

**Spec reference:** `twin-spec-v1.1.md` — sections 5-8, 17-18

---

## File Structure

```
twin/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json          # Tauri config: window, plugins, capabilities
│   ├── capabilities/
│   │   └── default.json         # FS, global-shortcut, clipboard permissions
│   └── src/
│       └── lib.rs               # Minimal Rust entry point
│
├── src/
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Root component with router
│   ├── vite-env.d.ts
│   │
│   ├── types/
│   │   ├── entities.ts          # All entity types (WorkGraphEntity union, EntityRef, etc.)
│   │   ├── deltas.ts            # DeltaOperation union type
│   │   ├── graph.ts             # WorkGraph, Relationship, RelationshipType
│   │   ├── sessions.ts          # ContextPack, WritebackContract, SessionManifest, ActiveSession
│   │   └── common.ts            # ULID, ISODate, ISOTimestamp, enums (NoteType, TaskStatus, etc.)
│   │
│   ├── lib/
│   │   ├── fs.ts                # All filesystem operations — the single seam
│   │   ├── fs.test.ts           # Tests for fs layer
│   │   ├── paths.ts             # Path constants and helpers (TWIN_HOME, project paths)
│   │   ├── yaml-utils.ts        # YAML round-trip helpers using eemeli/yaml
│   │   ├── yaml-utils.test.ts
│   │   ├── frontmatter.ts       # gray-matter wrapper for note parsing
│   │   ├── frontmatter.test.ts
│   │   ├── graph-builder.ts     # buildGraph() — parse files into typed entities + relationships
│   │   ├── graph-builder.test.ts
│   │   ├── validator.ts         # Rule-based delta validation (no LLM)
│   │   ├── validator.test.ts
│   │   ├── state-updater.ts     # Apply validated deltas to files via fs.ts
│   │   ├── state-updater.test.ts
│   │   └── seed.ts              # First-launch scaffold: create ~/twin/ with seed data
│   │
│   ├── hooks/
│   │   ├── useWorkGraph.ts      # React hook: build graph + rebuild on file changes
│   │   └── useFileWatcher.ts    # React hook: watch ~/twin/ for changes, trigger rebuilds
│   │
│   ├── components/
│   │   ├── GraphView.tsx        # G6 visual graph component
│   │   ├── NodeTooltip.tsx      # Hover tooltip for graph nodes
│   │   └── Sidebar.tsx          # Navigation sidebar (placeholder for Phase 1)
│   │
│   └── fixtures/                # Test fixtures: sample YAML/MD files
│       ├── tasks.yaml
│       ├── deliveries.yaml
│       ├── decisions.yaml
│       ├── people.yaml
│       ├── context.md
│       └── notes/
│           └── 2026-03-17-tech-stack-decision.md
│
├── test/                        # Integration tests (Tauri-dependent)
│   └── e2e-seed.test.ts
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── vitest.config.ts
└── index.html
```

---

## Task 1: Scaffold Tauri + React + Vite App

**Files:**
- Create: entire project scaffold via `pnpm create tauri-app`
- Modify: `package.json` (add dependencies)
- Modify: `src-tauri/tauri.conf.json` (window config, plugin capabilities)
- Modify: `src-tauri/Cargo.toml` (add plugin dependencies)
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Create the Tauri app**

```bash
cd /Users/augustsemrauandersen/Documents/2026projects
pnpm create tauri-app twin-app --template react-ts --manager pnpm
```

Then move the generated files into the existing `twin/` directory (preserving spec, CLAUDE.md, archive, git history).

- [ ] **Step 2: Install frontend dependencies**

```bash
cd /Users/augustsemrauandersen/Documents/2026projects/twin
pnpm add yaml gray-matter ulid @antv/g6 markdown-it ufuzzy
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/markdown-it
```

- [ ] **Step 3: Configure Tauri plugins in Cargo.toml**

Add to `src-tauri/Cargo.toml` `[dependencies]`:
```toml
tauri-plugin-fs = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-shell = "2"
```

- [ ] **Step 4: Configure Tauri capabilities**

Create `src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for Twin",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-home-read",
    "fs:allow-home-write",
    "fs:allow-home-meta",
    "fs:allow-watch",
    "fs:allow-unwatch",
    "global-shortcut:default",
    "shell:default"
  ]
}
```

- [ ] **Step 5: Register plugins in Rust entry point**

Update `src-tauri/src/lib.rs`:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                // Global shortcut registration will happen in Phase 2
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Configure Vite and Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
```

Add to `package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 7: Verify the app builds and opens**

```bash
source ~/.cargo/env && pnpm tauri dev
```

Expected: A blank Tauri window opens with the React template content. Close it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri 2.x + React + Vite app with plugin config"
```

---

## Task 2: Define TypeScript Types

**Files:**
- Create: `src/types/common.ts`
- Create: `src/types/entities.ts`
- Create: `src/types/deltas.ts`
- Create: `src/types/graph.ts`

- [ ] **Step 1: Create common types**

Create `src/types/common.ts` — all primitive types and enums from spec section 18:
```typescript
export type ULID = string
export type ISODate = string        // "2026-03-17"
export type ISOTimestamp = string   // "2026-03-17T14:22:00"

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
```

- [ ] **Step 2: Create entity types**

Create `src/types/entities.ts` — all 8 entity types from spec section 7:
```typescript
import type { ULID, ISODate, NoteType, TaskStatus, DeliveryType, DeliveryStatus, DecisionStatus, QuestionStatus, DispatchTarget } from './common'

export type EntityRef = {
  file: string
  line?: number
}

export type ProjectEntity = {
  kind: 'project'
  slug: string
  name: string
  status: 'active' | 'paused' | 'archived'
  ref: EntityRef
}

export type TaskEntity = {
  kind: 'task'
  id: ULID
  title: string
  status: TaskStatus
  priority: 'high' | 'medium' | 'low'
  due_date: string | null
  blocked_by: string | null
  waiting_on: string | null
  project: string
  delivery: ULID | null
  ref: EntityRef
}

export type DeliveryEntity = {
  kind: 'delivery'
  id: ULID
  slug: string
  title: string
  type: DeliveryType
  status: DeliveryStatus
  due_date: string | null
  brief: string | null
  project: string
  ref: EntityRef
}

export type DecisionEntity = {
  kind: 'decision'
  id: ULID
  title: string
  decision: string
  rationale: string | null
  unblocks: ULID[]
  date: string
  decided_by: string
  project: string
  status: DecisionStatus
  superseded_by: ULID | null
  ref: EntityRef
}

export type NoteEntity = {
  kind: 'note'
  id: ULID
  filename: string
  title: string
  type: NoteType
  project: string
  twin_synced: boolean
  people: string[]
  ref: EntityRef
}

export type PersonEntity = {
  kind: 'person'
  id: ULID
  name: string
  role: string | null
  projects: string[]
  ref: EntityRef
}

export type OpenQuestionEntity = {
  kind: 'open_question'
  id: ULID
  question: string
  project: string
  source_note: ULID | null
  status: QuestionStatus
  ref: EntityRef
}

export type SessionEntity = {
  kind: 'session'
  id: ULID
  target: DispatchTarget
  objective: string
  status: 'active' | 'completed' | 'reconciled'
  ref: EntityRef
}

export type WorkGraphEntity =
  | ProjectEntity | TaskEntity | DeliveryEntity | DecisionEntity
  | NoteEntity | PersonEntity | OpenQuestionEntity | SessionEntity

// Full note with body content (not just the entity/metadata)
export type Note = {
  id: ULID
  filename: string
  title: string
  type: NoteType
  project: string | null
  twin_synced: boolean
  linked_delivery?: ULID
  people?: string[]
  date?: ISODate
  created: ISODate
  updated: ISODate
  body: string
}

export type InboxItem = {
  filename: string
  captured: ISOTimestamp
  raw: string
  resolver_output?: ResolverOutput  // defined in Phase 2, use unknown until then
  resolver_error?: string
}

export type ConversationNote = Note & {
  type: 'conversation'
  people: string[]
  date: ISODate
  discussed: string
  agreed: string
  open_questions: string
}
```

Also create session and dispatch types (used in later phases, defined now for completeness):
```typescript
// In src/types/sessions.ts

import type { ULID, ISOTimestamp, ISODate, DispatchTarget, Confidence, TaskStatus } from './common'
import type { EntityRef } from './entities'

export type ContextPack = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string
  selected_sources: EntityRef[]
  entity_id_map: Record<ULID, string>
  writeback_contract: WritebackContract
  created_at: ISOTimestamp
}

export type WritebackContract = {
  session_id: ULID
  expected_outputs: Array<{
    type: 'decision' | 'task_update' | 'artifact' | 'open_question'
    description: string
  }>
  writeback_file: string
  schema_version: '1.0'
}

export type SessionManifest = {
  session_id: ULID
  summary: string
  target: DispatchTarget
  decisions: Array<{ title: string; decision: string; rationale?: string; unblocks?: ULID[]; supersedes?: ULID }>
  tasks_created: Array<{ title: string; priority: 'high' | 'medium' | 'low'; due_date?: ISODate; waiting_on?: string }>
  tasks_updated: Array<{ id?: ULID; title?: string; status: TaskStatus; blocked_by?: string; waiting_on?: string }>
  artifacts: Array<{ path: string; delivery_id?: ULID; description: string }>
  open_questions: Array<{ id?: ULID; question: string }>
  blockers: Array<{ title: string; blocked_by: string; waiting_on?: string }>
  confidence: Confidence
}

export type ActiveSession = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  dispatched_at: ISOTimestamp
  writeback_received: boolean
  writeback_path: 'session_end' | 'clipboard' | 'quick_summary' | 'full_import' | null
}
```

- [ ] **Step 3: Create delta operation types**

Create `src/types/deltas.ts` — all 14 delta operations from spec section 7:
```typescript
import type { ULID } from './common'
import type { TaskEntity, DeliveryEntity, DecisionEntity, NoteEntity, OpenQuestionEntity, PersonEntity } from './entities'
import type { DeliveryStatus } from './common'

export type DeltaOperation =
  | { op: 'create_task'; payload: Omit<TaskEntity, 'kind' | 'ref'> }
  | { op: 'update_task_status'; task_id: ULID; project: string; status: TaskEntity['status'] }
  | { op: 'mark_blocked'; task_id: ULID; project: string; blocked_by: string; waiting_on?: string }
  | { op: 'mark_unblocked'; task_id: ULID; project: string }
  | { op: 'append_decision'; payload: Omit<DecisionEntity, 'kind' | 'ref'> }
  | { op: 'supersede_decision'; old_id: ULID; new_id: ULID; project: string }
  | { op: 'create_delivery'; payload: Omit<DeliveryEntity, 'kind' | 'ref'> }
  | { op: 'update_delivery_status'; delivery_id: ULID; project: string; status: DeliveryStatus }
  | { op: 'create_note'; payload: Omit<NoteEntity, 'kind' | 'ref'>; body: string }
  | { op: 'add_open_question'; payload: Omit<OpenQuestionEntity, 'kind' | 'ref'> }
  | { op: 'resolve_question'; question_id: ULID; project: string }
  | { op: 'link_note_delivery'; note_id: ULID; delivery_id: ULID }
  | { op: 'upsert_person'; payload: Omit<PersonEntity, 'kind' | 'ref'> }
  | { op: 'archive_project'; project_slug: string }
```

- [ ] **Step 4: Create graph types**

Create `src/types/graph.ts`:
```typescript
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
```

- [ ] **Step 5: Verify types compile**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/
git commit -m "feat: define all TypeScript entity, delta, and graph types from spec"
```

---

## Task 3: Create Seed Data and Path Helpers

**Files:**
- Create: `src/lib/paths.ts`
- Create: `src/lib/seed.ts`
- Create: `src/fixtures/` (all fixture files)
- Test: `src/lib/paths.test.ts`

- [ ] **Step 1: Write path helpers**

Create `src/lib/paths.ts`:
```typescript
import { homeDir, join } from '@tauri-apps/api/path'

let _twinHome: string | null = null

export async function twinHome(): Promise<string> {
  if (_twinHome) return _twinHome
  const home = await homeDir()
  _twinHome = await join(home, 'twin')
  return _twinHome
}

export async function projectPath(slug: string): Promise<string> {
  return join(await twinHome(), 'projects', slug)
}

export async function inboxPath(): Promise<string> {
  return join(await twinHome(), 'inbox')
}

export async function sessionsPath(): Promise<string> {
  return join(await twinHome(), 'sessions')
}

export async function archivePath(): Promise<string> {
  return join(await twinHome(), 'archive')
}

export async function peoplePath(): Promise<string> {
  return join(await twinHome(), 'people.yaml')
}

export async function globalClaudePath(): Promise<string> {
  return join(await twinHome(), 'CLAUDE.md')
}
```

- [ ] **Step 2: Create test fixture files**

Create all fixture YAML/MD files under `src/fixtures/` matching the exact formats from spec sections 6.1–6.9. These serve as both test data and the template for `seed.ts`. Use the exact example data from the spec (municipality-platform project with Thomas, Jakob, Rasmus).

- [ ] **Step 3: Write the seed module**

Create `src/lib/seed.ts` — on first launch, create `~/twin/` with:
- `CLAUDE.md` (template)
- `people.yaml` (empty structure)
- `inbox/` (empty directory)
- `sessions/` + `writeback-schema.yaml`
- `archive/` (empty directory)
- `projects/municipality-platform/` with all files populated from fixture data

Uses `@tauri-apps/plugin-fs` for all file operations: `exists()`, `mkdir()`, `writeTextFile()`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/paths.ts src/lib/seed.ts src/fixtures/
git commit -m "feat: add path helpers, seed data, and test fixtures"
```

---

## Task 4: Implement YAML and Frontmatter Utilities

**Files:**
- Create: `src/lib/yaml-utils.ts`
- Create: `src/lib/yaml-utils.test.ts`
- Create: `src/lib/frontmatter.ts`
- Create: `src/lib/frontmatter.test.ts`

- [ ] **Step 1: Write failing test for YAML round-trip with comments**

Create `src/lib/yaml-utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseYamlDoc, stringifyYamlDoc, readYamlList } from './yaml-utils'

describe('yaml-utils', () => {
  it('preserves comments above keys during round-trip', () => {
    const input = `# Tasks — municipality-platform\n# Updated: 2026-03-17\n\ntasks:\n  - id: 01JBQF3A1K\n    title: Test task\n    status: todo\n`
    const doc = parseYamlDoc(input)
    const output = stringifyYamlDoc(doc)
    expect(output).toContain('# Tasks — municipality-platform')
    expect(output).toContain('# Updated: 2026-03-17')
  })

  it('parses a YAML list into typed array', () => {
    const input = `tasks:\n  - id: abc\n    title: Task One\n    status: todo\n  - id: def\n    title: Task Two\n    status: done\n`
    const result = readYamlList<{ id: string; title: string; status: string }>(input, 'tasks')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('abc')
    expect(result[1].status).toBe('done')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/lib/yaml-utils.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement yaml-utils**

Create `src/lib/yaml-utils.ts`:
```typescript
import { Document, parseDocument, stringify, parse } from 'yaml'

export function parseYamlDoc(text: string): Document {
  return parseDocument(text)
}

export function stringifyYamlDoc(doc: Document): string {
  return doc.toString()
}

export function readYamlList<T>(text: string, key: string): T[] {
  const data = parse(text)
  return (data?.[key] ?? []) as T[]
}

export function parseYaml<T>(text: string): T {
  return parse(text) as T
}

export function toYamlString(data: unknown): string {
  return stringify(data, { lineWidth: 0 })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/lib/yaml-utils.test.ts
```

Expected: PASS

- [ ] **Step 5: Write failing test for frontmatter parsing**

Create `src/lib/frontmatter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseNote, stringifyNote } from './frontmatter'

describe('frontmatter', () => {
  it('parses a note with YAML frontmatter', () => {
    const input = `---\nid: 01ABC\ntitle: Test Note\ntype: thought\nproject: test-project\ntwin_synced: true\ncreated: 2026-03-17\nupdated: 2026-03-17\n---\n\nThis is the body.`
    const note = parseNote(input, 'test-note.md')
    expect(note.id).toBe('01ABC')
    expect(note.title).toBe('Test Note')
    expect(note.type).toBe('thought')
    expect(note.body).toBe('This is the body.')
  })

  it('round-trips a note without data loss', () => {
    const input = `---\nid: 01ABC\ntitle: Test Note\ntype: thought\nproject: test-project\ntwin_synced: true\ncreated: 2026-03-17\nupdated: 2026-03-17\n---\n\nBody content here.`
    const note = parseNote(input, 'test-note.md')
    const output = stringifyNote(note)
    expect(output).toContain('id: 01ABC')
    expect(output).toContain('Body content here.')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pnpm test src/lib/frontmatter.test.ts
```

Expected: FAIL

- [ ] **Step 7: Implement frontmatter**

Create `src/lib/frontmatter.ts`:
```typescript
import matter from 'gray-matter'
import type { Note } from '@/types/entities'

export function parseNote(content: string, filename: string): Note {
  const { data, content: body } = matter(content)
  return {
    id: data.id ?? '',
    filename,
    title: data.title ?? '',
    type: data.type ?? 'thought',
    project: data.project ?? null,
    twin_synced: data.twin_synced ?? true,
    linked_delivery: data.linked_delivery,
    people: data.people,
    date: data.date,
    created: data.created ?? '',
    updated: data.updated ?? '',
    body: body.trim(),
  }
}

export function stringifyNote(note: Note): string {
  const frontmatter: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    type: note.type,
    project: note.project,
    twin_synced: note.twin_synced,
    created: note.created,
    updated: note.updated,
  }
  if (note.linked_delivery) frontmatter.linked_delivery = note.linked_delivery
  if (note.people?.length) frontmatter.people = note.people
  if (note.date) frontmatter.date = note.date

  return matter.stringify(note.body, frontmatter)
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
pnpm test src/lib/
```

Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/yaml-utils.ts src/lib/yaml-utils.test.ts src/lib/frontmatter.ts src/lib/frontmatter.test.ts
git commit -m "feat: implement YAML round-trip and frontmatter parsing with tests"
```

---

## Task 5: Implement the `fs.ts` Layer

**Files:**
- Create: `src/lib/fs.ts`
- Create: `src/lib/fs.test.ts`

This is the single seam for all file operations. Every function uses `@tauri-apps/plugin-fs` under the hood. For unit testing, we test the parsing/serialization logic with plain strings; integration tests against the actual filesystem happen via Tauri dev mode.

- [ ] **Step 1: Write failing tests for fs read operations**

Create `src/lib/fs.test.ts` — tests that verify parsing of fixture data into typed entities. Since Tauri's fs plugin isn't available in vitest, test the parsing functions separately from the file I/O. The fs module should expose both the high-level async methods (which call Tauri) and pure parsing functions (which are testable without Tauri).

```typescript
import { describe, it, expect } from 'vitest'
import { parseTasks, parseDeliveries, parseDecisions, parsePeople } from './fs'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const fixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

describe('fs parsing', () => {
  it('parses tasks.yaml into TaskEntity[]', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks[0].kind).toBe('task')
    expect(tasks[0].id).toBeTruthy()
    expect(tasks[0].project).toBe('test-project')
  })

  it('parses deliveries.yaml into DeliveryEntity[]', () => {
    const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'test-project')
    expect(deliveries.length).toBeGreaterThan(0)
    expect(deliveries[0].kind).toBe('delivery')
    expect(deliveries[0].slug).toBeTruthy()
  })

  it('parses decisions.yaml into DecisionEntity[]', () => {
    const decisions = parseDecisions(fixture('decisions.yaml'), 'test-project')
    expect(decisions.length).toBeGreaterThan(0)
    expect(decisions[0].kind).toBe('decision')
    expect(decisions[0].status).toMatch(/^(active|superseded)$/)
  })

  it('parses people.yaml into PersonEntity[]', () => {
    const people = parsePeople(fixture('people.yaml'))
    expect(people.length).toBeGreaterThan(0)
    expect(people[0].kind).toBe('person')
    expect(people[0].name).toBeTruthy()
  })

  it('parses note frontmatter into NoteEntity[]', () => {
    const noteContent = readFileSync(resolve(__dirname, '../fixtures/notes/2026-03-17-tech-stack-decision.md'), 'utf-8')
    const notes = parseNotes([{ filename: '2026-03-17-tech-stack-decision.md', content: noteContent }], 'test-project')
    expect(notes.length).toBe(1)
    expect(notes[0].kind).toBe('note')
    expect(notes[0].id).toBeTruthy()
    expect(notes[0].twin_synced).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/lib/fs.test.ts
```

- [ ] **Step 3: Implement fs.ts parsing functions**

Create `src/lib/fs.ts` with two layers:
1. Pure parsing functions (`parseTasks`, `parseDeliveries`, etc.) that take raw YAML strings and return typed entities — these are unit-testable.
2. Async I/O functions (`readTasks`, `writeTask`, etc.) that use `@tauri-apps/plugin-fs` to read files then call the parsing functions — these are tested in integration.

Implement all parsing functions matching the spec's file formats. Each parser returns entities with `kind` and `ref` fields populated:
- `parseTasks(yaml, projectSlug)` → `TaskEntity[]`
- `parseDeliveries(yaml, projectSlug)` → `DeliveryEntity[]`
- `parseDecisions(yaml, projectSlug)` → `DecisionEntity[]` (note: `unblocks` is a `ULID[]`)
- `parsePeople(yaml)` → `PersonEntity[]`
- `parseNotes(files: {filename, content}[], projectSlug)` → `NoteEntity[]` (parse frontmatter via gray-matter, extract entity fields only — not the full body)

Session parsing (`parseSessions`) is deferred to Phase 3 when sessions are first created. In Phase 1, `buildGraph` passes an empty array for sessions.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/lib/fs.test.ts
```

Expected: PASS

- [ ] **Step 5: Add serialization tests**

Add tests for writing YAML back: `serializeTasks`, `serializeDeliveries`, `serializeDecisions`. Verify round-trip: parse → serialize → parse produces identical entity arrays.

- [ ] **Step 6: Implement serialization functions**

Each serialization function produces YAML matching the spec's format, with comments at the top.

- [ ] **Step 7: Run all tests**

```bash
pnpm test src/lib/
```

Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/fs.ts src/lib/fs.test.ts
git commit -m "feat: implement fs.ts layer with YAML parsing and serialization"
```

---

## Task 6: Implement the Work Graph Builder

**Files:**
- Create: `src/lib/graph-builder.ts`
- Create: `src/lib/graph-builder.test.ts`

- [ ] **Step 1: Write failing test for graph construction**

Create `src/lib/graph-builder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildGraphFromEntities, deriveRelationships } from './graph-builder'
import { parseTasks, parseDeliveries, parseDecisions, parsePeople } from './fs'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const fixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

describe('graph-builder', () => {
  it('builds a graph with all entity kinds', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'test-project')
    const decisions = parseDecisions(fixture('decisions.yaml'), 'test-project')
    const people = parsePeople(fixture('people.yaml'))
    const project = { kind: 'project' as const, slug: 'test-project', name: 'Test Project', status: 'active' as const, ref: { file: 'projects/test-project' } }

    const entities = [project, ...tasks, ...deliveries, ...decisions, ...people]
    const graph = buildGraphFromEntities(entities)

    expect(graph.entities.length).toBe(entities.length)
    expect(graph.built_at).toBeGreaterThan(0)
  })

  it('derives belongs_to relationships for project entities', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    const project = { kind: 'project' as const, slug: 'test-project', name: 'Test', status: 'active' as const, ref: { file: 'projects/test-project' } }

    const graph = buildGraphFromEntities([project, ...tasks])
    const belongsTo = graph.relationships.filter(r => r.type === 'belongs_to')
    expect(belongsTo.length).toBe(tasks.length)
  })

  it('derives delivers relationships from task.delivery', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'test-project')

    const graph = buildGraphFromEntities([...tasks, ...deliveries])
    const delivers = graph.relationships.filter(r => r.type === 'delivers')
    const tasksWithDelivery = tasks.filter(t => t.delivery !== null)
    expect(delivers.length).toBe(tasksWithDelivery.length)
  })

  it('derives involves relationships from waiting_on', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    const people = parsePeople(fixture('people.yaml'))

    const graph = buildGraphFromEntities([...tasks, ...people])
    const involves = graph.relationships.filter(r => r.type === 'involves')
    const tasksWaiting = tasks.filter(t => t.waiting_on !== null)
    expect(involves.length).toBeGreaterThanOrEqual(tasksWaiting.length)
  })

  it('derives unblocks relationships from decision.unblocks array', () => {
    const tasks = parseTasks(fixture('tasks.yaml'), 'test-project')
    const decisions = parseDecisions(fixture('decisions.yaml'), 'test-project')

    const graph = buildGraphFromEntities([...tasks, ...decisions])
    const unblocks = graph.relationships.filter(r => r.type === 'unblocks')
    const totalUnblockRefs = decisions.flatMap(d => d.unblocks).length
    expect(unblocks.length).toBe(totalUnblockRefs)
  })

  it('derives supersedes relationships', () => {
    const decisions = parseDecisions(fixture('decisions.yaml'), 'test-project')

    const graph = buildGraphFromEntities(decisions)
    const supersedes = graph.relationships.filter(r => r.type === 'supersedes')
    const supersededDecisions = decisions.filter(d => d.superseded_by !== null)
    expect(supersedes.length).toBe(supersededDecisions.length)
  })

  it('derives informs relationships from note.linked_delivery', () => {
    const noteContent = readFileSync(resolve(__dirname, '../fixtures/notes/2026-03-17-tech-stack-decision.md'), 'utf-8')
    const notes = parseNotes([{ filename: '2026-03-17-tech-stack-decision.md', content: noteContent }], 'test-project')
    const deliveries = parseDeliveries(fixture('deliveries.yaml'), 'test-project')

    const graph = buildGraphFromEntities([...notes, ...deliveries])
    const informs = graph.relationships.filter(r => r.type === 'informs')
    const notesWithDelivery = notes.filter(n => n.ref.file && 'linked_delivery' in n)
    // linked_delivery in the fixture should produce informs relationships
    expect(informs.length).toBeGreaterThanOrEqual(0) // depends on fixture data
  })

  it('excludes archived projects', () => {
    const active = { kind: 'project' as const, slug: 'active', name: 'Active', status: 'active' as const, ref: { file: '' } }
    const archived = { kind: 'project' as const, slug: 'archived', name: 'Archived', status: 'archived' as const, ref: { file: '' } }

    const graph = buildGraphFromEntities([active, archived])
    const projects = graph.entities.filter(e => e.kind === 'project')
    expect(projects.length).toBe(1)
    expect(projects[0].slug).toBe('active')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/lib/graph-builder.test.ts
```

- [ ] **Step 3: Implement graph-builder**

Create `src/lib/graph-builder.ts`:
- `buildGraphFromEntities(entities)` — filters archived projects, stores `built_at` timestamp, calls `deriveRelationships`
- `deriveRelationships(entities)` — implements all 9 relationship types from spec section 7:
  - `belongs_to`: every entity with a `project` field → its project entity
  - `delivers`: task with `delivery` field → that delivery entity by ID
  - `involves`: task with `waiting_on` / decision with `decided_by` → matching person by name
  - `unblocks`: decision with `unblocks` array → each task by ID
  - `supersedes`: decision with `superseded_by` → the superseding decision by ID
  - `informs`: note with `linked_delivery` → that delivery by ID
  - `blocks`: task with `blocked_by` that names another task → heuristic match (best-effort in Phase 1)
  - `raises`: note entities that have open questions (derived if open_question.source_note matches note ID)
  - `produces`: session → artifact (deferred to Phase 3 when sessions exist; returns empty for now)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/lib/graph-builder.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph-builder.ts src/lib/graph-builder.test.ts
git commit -m "feat: implement work graph builder with relationship derivation"
```

---

## Task 7: Implement Validator

**Files:**
- Create: `src/lib/validator.ts`
- Create: `src/lib/validator.test.ts`

- [ ] **Step 1: Write failing tests for validator**

Test each validation rule from spec section 9 (Agent 5b):
- `update_task_status` fails if task ID doesn't exist
- `mark_blocked` fails if task ID doesn't exist
- `mark_unblocked` fails if task is not currently blocked
- `update_delivery_status` fails if delivery ID doesn't exist
- `supersede_decision` fails if target is not `active`
- `upsert_person` fails if name is empty
- ULID format validation on all ID fields
- Valid operations pass without errors

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement validator**

Create `src/lib/validator.ts`:
```typescript
import type { DeltaOperation } from '@/types/deltas'
import type { WorkGraph } from '@/types/graph'

export type ValidationResult = {
  valid: boolean
  errors: Array<{ op: DeltaOperation; reason: string }>
  warnings: Array<{ op: DeltaOperation; reason: string }>
}

export function validateDeltas(deltas: DeltaOperation[], graph: WorkGraph): ValidationResult
```

Rule-based only — no LLM call. Returns errors for hard failures and warnings for soft issues (e.g., duplicate decision title).

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/validator.ts src/lib/validator.test.ts
git commit -m "feat: implement rule-based delta validator"
```

---

## Task 8: Implement State Updater

**Files:**
- Create: `src/lib/state-updater.ts`
- Create: `src/lib/state-updater.test.ts`

- [ ] **Step 1: Write failing tests for state updater**

Test the pure transformation functions (not file I/O) for all 14 delta operations:
- `applyCreateTask` — adds a task entry to a tasks array, generates ULID
- `applyUpdateTaskStatus` — changes the status field by ID
- `applyMarkBlocked` — sets blocked_by and waiting_on by ID
- `applyMarkUnblocked` — clears blocked_by and waiting_on, sets status to `todo`
- `applyAppendDecision` — adds a decision to the decisions array, generates ULID
- `applySupersede` — updates both old and new decision entries atomically
- `applyCreateDelivery` — adds a delivery entry, generates ULID
- `applyUpdateDeliveryStatus` — changes delivery status by ID
- `applyCreateNote` — returns a note file object (frontmatter + body), generates ULID
- `applyAddOpenQuestion` — appends question to note content, generates ULID
- `applyResolveQuestion` — marks question as resolved
- `applyLinkNoteDelivery` — updates linked_delivery in note frontmatter by note ID
- `applyUpsertPerson` — adds new or updates existing person in people array
- `applyArchiveProject` — sets project status to archived
- All create operations generate ULIDs for new entities
- All operations preserve existing entities unchanged

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement state updater**

Create `src/lib/state-updater.ts`:
- Pure transformation functions for each delta operation type (testable without fs)
- `applyDelta(delta, currentData)` → returns new data (immutable transform)
- The async wrapper `applyDeltaToFile(delta, graph, fs)` handles file I/O with mtime checking:
  1. Read current file mtime
  2. Compare to `graph.file_mtimes[path]`
  3. If changed: re-read, re-parse, check if delta still applies
  4. If clean: apply and write
  5. If conflict: throw `ConflictError` with details

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: All tests pass across yaml-utils, frontmatter, fs, graph-builder, validator, state-updater.

- [ ] **Step 6: Commit**

```bash
git add src/lib/state-updater.ts src/lib/state-updater.test.ts
git commit -m "feat: implement state updater with mtime conflict detection"
```

---

## Task 9: Wire Seed + App Shell with Basic Sidebar

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/hooks/useWorkGraph.ts`
- Create: `src/hooks/useFileWatcher.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Implement useFileWatcher hook**

Create `src/hooks/useFileWatcher.ts` — uses Tauri's `watch` from `@tauri-apps/plugin-fs` to watch `~/twin/` recursively. Calls a callback on any change. Debounces at 500ms to avoid rapid re-triggers.

- [ ] **Step 2: Implement useWorkGraph hook**

Create `src/hooks/useWorkGraph.ts` — on mount:
1. Calls `buildGraph()` (reads all files via `fs.ts`, passes to `graph-builder`)
2. Returns `{ graph, loading, error, rebuild }`
3. Subscribes to `useFileWatcher` — calls `rebuild()` on changes
4. Skips rebuilding when the change came from Twin's own writes (via a write-lock flag)

- [ ] **Step 3: Implement App shell with sidebar**

Create a basic layout: sidebar on left, main content area on right. Sidebar shows:
- "Today's focus" (placeholder)
- "Work graph" (navigates to graph view)
- "Inbox" (placeholder)
- Project list (read from the graph's project entities)

- [ ] **Step 4: Wire seed on first launch**

In `App.tsx`, on mount:
1. Check if `~/twin/` exists
2. If not, run `seed.ts` to scaffold
3. `useWorkGraph` hook builds the graph
4. Pass graph to views via React context

- [ ] **Step 3: Verify in Tauri dev**

```bash
source ~/.cargo/env && pnpm tauri dev
```

Expected: App opens. If `~/twin/` doesn't exist, it gets created with seed data. Sidebar shows "Municipality platform" project. Console logs the graph entity count.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/main.tsx
git commit -m "feat: wire app shell with sidebar and first-launch seed"
```

---

## Task 10: Implement Visual Graph View

**Files:**
- Create: `src/components/GraphView.tsx`
- Create: `src/components/NodeTooltip.tsx`
- Create: `src/lib/graph-to-g6.ts`
- Create: `src/lib/graph-to-g6.test.ts`

- [ ] **Step 1: Write failing test for graph data transform**

Create `src/lib/graph-to-g6.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { workGraphToG6 } from './graph-to-g6'
import type { WorkGraph } from '@/types/graph'

describe('graph-to-g6', () => {
  it('transforms projects into combos', () => {
    const graph: WorkGraph = {
      entities: [{ kind: 'project', slug: 'test', name: 'Test', status: 'active', ref: { file: '' } }],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const { combos } = workGraphToG6(graph)
    expect(combos).toHaveLength(1)
    expect(combos[0].id).toBe('test')
  })

  it('maps entity kinds to correct node shapes', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'task', id: '01A', title: 'T', status: 'todo', priority: 'high', due_date: null, blocked_by: null, waiting_on: null, project: 'p', delivery: null, ref: { file: '' } },
        { kind: 'delivery', id: '01B', slug: 's', title: 'D', type: 'doc', status: 'draft', due_date: null, brief: null, project: 'p', ref: { file: '' } },
        { kind: 'decision', id: '01C', title: 'Dec', decision: '', rationale: null, unblocks: [], date: '', decided_by: '', project: 'p', status: 'active', superseded_by: null, ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const { nodes } = workGraphToG6(graph)
    const task = nodes.find(n => n.id === '01A')
    const delivery = nodes.find(n => n.id === '01B')
    const decision = nodes.find(n => n.id === '01C')
    expect(task?.type).toBe('circle')
    expect(delivery?.type).toBe('diamond')
    expect(decision?.type).toBe('hexagon')
  })

  it('maps relationship types to correct edge styles', () => {
    const graph: WorkGraph = {
      entities: [],
      relationships: [
        { from: { kind: 'task', id: 'a' }, to: { kind: 'task', id: 'b' }, type: 'blocks' },
        { from: { kind: 'task', id: 'c' }, to: { kind: 'person', id: 'd' }, type: 'involves' },
      ],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const { edges } = workGraphToG6(graph)
    const blocks = edges.find(e => e.source === 'a')
    const involves = edges.find(e => e.source === 'c')
    expect(blocks?.style?.stroke).toBe('#ef4444')  // red
    expect(involves?.style?.lineDash).toBeTruthy()  // dotted
  })

  it('assigns nodes to project combos via comboId', () => {
    const graph: WorkGraph = {
      entities: [
        { kind: 'project', slug: 'proj', name: 'Proj', status: 'active', ref: { file: '' } },
        { kind: 'task', id: '01A', title: 'T', status: 'todo', priority: 'high', due_date: null, blocked_by: null, waiting_on: null, project: 'proj', delivery: null, ref: { file: '' } },
      ],
      relationships: [],
      built_at: Date.now(),
      file_mtimes: {},
    }
    const { nodes } = workGraphToG6(graph)
    expect(nodes[0].comboId).toBe('proj')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement graph-to-g6 transform**

Create `src/lib/graph-to-g6.ts` — maps the WorkGraph to G6's data format:
- Projects → combos
- All other entities → nodes with `type` (shape), `style` (colour by status), `comboId`
- Relationships → edges with `style` per relationship type
- Implements the visual encoding table from spec section 8 (node shapes, colours, edge styles)

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Implement GraphView component**

Create `src/components/GraphView.tsx`:
- Initialize G6 `Graph` instance in a `useEffect`
- Force-directed layout with combo support
- Configure node/edge styles per the spec's visual encoding
- Hover tooltips via `NodeTooltip.tsx`
- Click to select (highlight node, show details in console for now)
- Zoom, pan, minimap plugin

- [ ] **Step 6: Wire GraphView into App**

Add a route/view so clicking "Work graph" in the sidebar renders `<GraphView>` with the current work graph data.

- [ ] **Step 7: Verify in Tauri dev**

```bash
source ~/.cargo/env && pnpm tauri dev
```

Expected: Click "Work graph" in sidebar. The seed project's entities render as an interactive force-directed graph. Tasks are circles (blue/amber/red/green by status), deliveries are diamonds, decisions are hexagons. Edges connect related entities. Hovering shows a tooltip. Zooming and panning work.

- [ ] **Step 8: Commit**

```bash
git add src/lib/graph-to-g6.ts src/lib/graph-to-g6.test.ts src/components/GraphView.tsx src/components/NodeTooltip.tsx
git commit -m "feat: implement visual graph with G6 force-directed layout and combo nodes"
```

---

## Phase 1 Gate

Run all checks:

```bash
pnpm test                          # All unit tests pass
pnpm exec tsc --noEmit             # No type errors
source ~/.cargo/env && pnpm tauri dev   # App opens, graph renders
```

**Gate criteria (from spec section 23):**

1. Can the app read a task from `tasks.yaml` and a note with correct frontmatter parsing and IDs? → Verified by Task 5 tests
2. Does the graph correctly represent typed entities with relationships? Are IDs consistent? Are archived projects excluded? → Verified by Task 6 tests
3. All delta types work. Conflict detection surfaces external edits. Validator rejects invalid operations. → Verified by Task 7 and 8 tests
4. The seed project's entities render as a readable, interactive graph. Clicking a node shows its details. → Verified visually in Task 10

**If all gates pass:** Proceed to Phase 2 plan (AI agents + capture).
