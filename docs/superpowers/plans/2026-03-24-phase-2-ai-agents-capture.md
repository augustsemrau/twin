# Phase 2 — AI Agents + Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Anthropic API, implement the Resolver agent, build the capture system (capture strip + global shortcut + inbox triage), and create project views (task list, delivery list, note list with inline editing) — making Twin usable for daily capture and browsing.

**Architecture:** The Anthropic SDK runs in the Tauri WebView (frontend). The API key is loaded via Vite's env system (`VITE_ANTHROPIC_API_KEY` in `.env`). A shared `anthropic-client.ts` module handles client instantiation, retry logic, and token counting. The Resolver agent takes raw text + work graph context and returns structured observations via JSON mode. Capture writes to `~/twin/inbox/` immediately, then runs the Resolver async. Inbox triage presents Resolver output with accept/edit/discard actions that apply deltas via the existing State Updater.

**Tech Stack:** @anthropic-ai/sdk, existing fs.ts/validator/state-updater/graph-builder, Tauri global-shortcut plugin, Tauri multi-window

**Spec reference:** `twin-spec-v1.1.md` — sections 9 (Agent 1: Resolver), 13 (Capture), 14 (Inbox triage), 16 (Views)

**Phase 1 foundation:** 74 tests passing, types defined, fs layer, graph builder, validator, state updater, visual graph, app shell with sidebar all working.

---

## Pre-requisite: API Key Loading

The `.env` file contains `ANTHROPIC_API_KEY=sk-ant-...`. In a Tauri app, there is no Node.js `process.env`. Two options:

**Option A (chosen): Vite env loading.** Rename to `VITE_ANTHROPIC_API_KEY` in `.env`. Vite exposes it as `import.meta.env.VITE_ANTHROPIC_API_KEY`. This is acceptable because Twin is a local desktop app — the key is not exposed to the public internet.

**Option B: Rust-side env.** Read the key in Rust via `std::env::var`, expose via a Tauri command. More secure but more complex. Defer to v2 if needed.

---

## File Structure (new/modified files)

```
src/
├── lib/
│   ├── anthropic-client.ts      # Shared Anthropic SDK client with retry + token counting
│   ├── anthropic-client.test.ts # Unit tests for retry logic, token counting
│   ├── resolver.ts              # Resolver agent: raw text → ResolverOutput
│   ├── resolver.test.ts         # Tests with mocked API responses
│   ├── capture.ts               # Capture logic: write inbox file, trigger resolver
│   └── capture.test.ts          # Tests for inbox file creation and slug generation
│
├── types/
│   └── agents.ts                # ResolverOutput type, agent-specific types
│
├── components/
│   ├── CaptureStrip.tsx         # Persistent capture input at bottom of views
│   ├── InboxTriage.tsx          # Inbox triage view: list items, accept/edit/discard
│   ├── InboxItem.tsx            # Single inbox item card with resolver interpretation
│   ├── DeltaReview.tsx          # Reusable delta review UI: observation cards with evidence
│   ├── ManualClassify.tsx       # Manual classification fallback (project picker, type, title)
│   ├── ProjectTaskList.tsx      # Task list view for a project with inline status editing
│   ├── ProjectDeliveryList.tsx  # Delivery list view
│   ├── ProjectNoteList.tsx      # Note list view (title, type, date, twin_synced toggle)
│   └── StatusBadge.tsx          # Reusable status badge component (todo/blocked/done/etc.)
│
├── hooks/
│   └── useTokenCounter.ts       # Track cumulative API token usage
│
└── App.tsx                      # Updated: route to new views, wire capture strip
```

---

## Task 1: API Key Loading + Anthropic Client

**Files:**
- Modify: `.env` (rename key to `VITE_ANTHROPIC_API_KEY`)
- Create: `src/lib/anthropic-client.ts`
- Create: `src/lib/anthropic-client.test.ts`
- Create: `src/types/agents.ts`
- Create: `src/hooks/useTokenCounter.ts`

- [ ] **Step 1: Rename API key in .env**

Change `.env` from:
```
ANTHROPIC_API_KEY=sk-ant-...
```
to:
```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Vite only exposes env vars prefixed with `VITE_` to the frontend.

- [ ] **Step 2: Create agent types**

Create `src/types/agents.ts`:
```typescript
import type { DeltaOperation } from './deltas'
import type { NoteType, Confidence } from './common'

export type ObservationType =
  | 'task' | 'decision' | 'blocker' | 'open_question'
  | 'note' | 'person_mentioned' | 'artifact_referenced'

export type ProposedObservation = {
  observation_type: ObservationType
  summary: string
  evidence: string
  proposed_delta: DeltaOperation | null
}

export type ResolverOutput = {
  candidate_project: string | null
  confidence: Confidence
  proposed_observations: ProposedObservation[]
  suggested_note_type: NoteType
  suggested_note_title: string
}

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
}

export type ApiCallRecord = {
  agent: string
  model: string
  timestamp: number
  usage: TokenUsage
  duration_ms: number
  success: boolean
  error?: string
}
```

Add `export * from './agents'` to `src/types/index.ts`.

Also update `src/types/entities.ts`: change `InboxItem.resolver_output` from `unknown` to `ResolverOutput` (import from `./agents`).

- [ ] **Step 3: Write failing tests for anthropic client**

Create `src/lib/anthropic-client.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { createAnthropicClient, getApiKey, addTokenUsage, getTokenUsage, resetTokenUsage } from './anthropic-client'

describe('anthropic-client', () => {
  it('reads API key from import.meta.env', () => {
    // Mock import.meta.env
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'sk-ant-test-key')
    const key = getApiKey()
    expect(key).toBe('sk-ant-test-key')
    vi.unstubAllEnvs()
  })

  it('throws if API key is not set', () => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '')
    expect(() => getApiKey()).toThrow('ANTHROPIC_API_KEY')
    vi.unstubAllEnvs()
  })

  it('tracks cumulative token usage', () => {
    resetTokenUsage()
    addTokenUsage({ input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0 })
    addTokenUsage({ input_tokens: 200, output_tokens: 100, cache_read_tokens: 50, cache_creation_tokens: 0 })
    const usage = getTokenUsage()
    expect(usage.input_tokens).toBe(300)
    expect(usage.output_tokens).toBe(150)
    expect(usage.cache_read_tokens).toBe(50)
  })

  it('calculates estimated cost', () => {
    resetTokenUsage()
    addTokenUsage({ input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_tokens: 0, cache_creation_tokens: 0 })
    const usage = getTokenUsage()
    // Haiku: $1/MTok input, $5/MTok output
    expect(usage.estimated_cost_usd).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 4: Run tests — verify FAIL**

```bash
pnpm test src/lib/anthropic-client.test.ts
```

- [ ] **Step 5: Implement anthropic-client.ts**

Create `src/lib/anthropic-client.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { TokenUsage, ApiCallRecord } from '@/types/agents'

// Pricing per million tokens (March 2026)
const PRICING = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cache_read: 0.1, cache_write: 1.25 },
  'claude-sonnet-4-5-20250514': { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 },
} as const

type ModelId = keyof typeof PRICING

let _client: Anthropic | null = null
let _totalUsage: TokenUsage & { estimated_cost_usd: number } = {
  input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0,
  estimated_cost_usd: 0,
}
const _callLog: ApiCallRecord[] = []

export function getApiKey(): string {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set. Add VITE_ANTHROPIC_API_KEY to .env')
  return key
}

export function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: getApiKey(),
      maxRetries: 3,
      timeout: 30_000,
      dangerouslyAllowBrowser: true, // Required for Tauri WebView (not a real browser)
    })
  }
  return _client
}

export function addTokenUsage(usage: TokenUsage, model: ModelId = 'claude-haiku-4-5-20251001') {
  _totalUsage.input_tokens += usage.input_tokens
  _totalUsage.output_tokens += usage.output_tokens
  _totalUsage.cache_read_tokens += usage.cache_read_tokens
  _totalUsage.cache_creation_tokens += usage.cache_creation_tokens

  const pricing = PRICING[model] ?? PRICING['claude-haiku-4-5-20251001']
  _totalUsage.estimated_cost_usd +=
    (usage.input_tokens / 1_000_000) * pricing.input +
    (usage.output_tokens / 1_000_000) * pricing.output +
    (usage.cache_read_tokens / 1_000_000) * pricing.cache_read +
    (usage.cache_creation_tokens / 1_000_000) * pricing.cache_write
}

export function getTokenUsage() { return { ..._totalUsage } }
export function resetTokenUsage() {
  _totalUsage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, estimated_cost_usd: 0 }
}
export function getCallLog() { return [..._callLog] }
export function addCallRecord(record: ApiCallRecord) { _callLog.push(record) }
```

- [ ] **Step 6: Run tests — verify PASS**

```bash
pnpm test src/lib/anthropic-client.test.ts
```

- [ ] **Step 7: Create useTokenCounter hook**

Create `src/hooks/useTokenCounter.ts`:
```typescript
import { useState, useCallback } from 'react'
import { getTokenUsage, resetTokenUsage } from '@/lib/anthropic-client'

export function useTokenCounter() {
  const [usage, setUsage] = useState(getTokenUsage())
  const refresh = useCallback(() => setUsage(getTokenUsage()), [])
  const reset = useCallback(() => { resetTokenUsage(); refresh() }, [refresh])
  return { usage, refresh, reset }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/types/agents.ts src/lib/anthropic-client.ts src/lib/anthropic-client.test.ts src/hooks/useTokenCounter.ts src/types/index.ts
git commit -m "feat: add Anthropic client with retry, token tracking, and cost estimation

Reads API key from VITE_ANTHROPIC_API_KEY in .env
maxRetries: 3, timeout: 30s, dangerouslyAllowBrowser for Tauri WebView
Tracks cumulative token usage with estimated USD cost

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Resolver Agent

**Files:**
- Create: `src/lib/resolver.ts`
- Create: `src/lib/resolver.test.ts`

- [ ] **Step 1: Write failing tests for resolver**

Create `src/lib/resolver.test.ts`. Since we don't want to hit the real API in unit tests, mock the Anthropic client:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildResolverPrompt, parseResolverResponse } from './resolver'
import type { WorkGraph } from '@/types/graph'
import type { ProjectEntity, TaskEntity } from '@/types/entities'

describe('resolver', () => {
  const mockGraph: WorkGraph = {
    entities: [
      { kind: 'project', slug: 'municipality-platform', name: 'Municipality Platform', status: 'active', ref: { file: '' } } as ProjectEntity,
      { kind: 'task', id: '01A', title: 'Architecture diagram', status: 'blocked', priority: 'high', due_date: null, blocked_by: 'Cost estimate', waiting_on: 'Thomas', project: 'municipality-platform', delivery: null, ref: { file: '' } } as TaskEntity,
    ],
    relationships: [],
    built_at: Date.now(),
    file_mtimes: {},
  }

  describe('buildResolverPrompt', () => {
    it('includes the system prompt', () => {
      const { system } = buildResolverPrompt('Thomas sent the cost estimate', mockGraph, 'municipality-platform')
      expect(system).toContain('Twin Resolver')
      expect(system).toContain('ResolverOutput JSON')
    })

    it('includes the raw text in user message', () => {
      const { userMessage } = buildResolverPrompt('Thomas sent the cost estimate', mockGraph, 'municipality-platform')
      expect(userMessage).toContain('Thomas sent the cost estimate')
    })

    it('includes graph context with entity IDs', () => {
      const { userMessage } = buildResolverPrompt('Thomas sent the cost estimate', mockGraph, 'municipality-platform')
      expect(userMessage).toContain('01A')
      expect(userMessage).toContain('Architecture diagram')
    })
  })

  describe('parseResolverResponse', () => {
    it('parses valid JSON response', () => {
      const json = JSON.stringify({
        candidate_project: 'municipality-platform',
        confidence: 'high',
        proposed_observations: [{
          observation_type: 'task',
          summary: 'Cost estimate received, unblock architecture diagram',
          evidence: 'Thomas sent the cost estimate',
          proposed_delta: { op: 'mark_unblocked', task_id: '01A', project: 'municipality-platform' }
        }],
        suggested_note_type: 'thought',
        suggested_note_title: 'Cost estimate received'
      })
      const result = parseResolverResponse(json)
      expect(result.confidence).toBe('high')
      expect(result.proposed_observations).toHaveLength(1)
      expect(result.proposed_observations[0].proposed_delta?.op).toBe('mark_unblocked')
    })

    it('handles malformed JSON gracefully', () => {
      const result = parseResolverResponse('not json at all')
      expect(result.confidence).toBe('low')
      expect(result.proposed_observations).toHaveLength(0)
    })

    it('handles partial/incomplete JSON', () => {
      const result = parseResolverResponse('{"candidate_project": "test"')
      expect(result.confidence).toBe('low')
    })
  })
})
```

- [ ] **Step 2: Run tests — verify FAIL**

- [ ] **Step 3: Implement resolver.ts**

Create `src/lib/resolver.ts`:

Two layers:
1. **Pure functions** (testable): `buildResolverPrompt(rawText, graph, projectSlug?)` returns `{ system, userMessage }`. `parseResolverResponse(text)` returns `ResolverOutput`.
2. **Async function** (calls API): `runResolver(rawText, graph, projectSlug?)` calls the Anthropic API and returns `ResolverOutput`.

The system prompt from spec section 9 (Agent 1). The user message includes:
- The raw capture text
- A serialized summary of the work graph (project names, task titles+IDs+statuses, people names+IDs, recent decisions)
- The active project slug if known

`runResolver` uses the shared client from `anthropic-client.ts`, calls `messages.create` with `claude-haiku-4-5-20251001`, extracts the text response, passes to `parseResolverResponse`, records token usage.

`parseResolverResponse` tries `JSON.parse`. On failure, returns a safe default ResolverOutput with `confidence: 'low'` and empty observations.

- [ ] **Step 4: Run tests — verify PASS**

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/resolver.ts src/lib/resolver.test.ts
git commit -m "feat: implement Resolver agent with prompt building and response parsing

System prompt from spec. Graph context serialized into user message.
Graceful fallback on malformed/incomplete JSON responses.
API call via shared Anthropic client with token tracking.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Capture System

**Files:**
- Create: `src/lib/capture.ts`
- Create: `src/lib/capture.test.ts`
- Create: `src/components/CaptureStrip.tsx`

- [ ] **Step 1: Write failing tests for capture logic**

Create `src/lib/capture.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { generateCaptureFilename, formatCaptureContent } from './capture'

describe('capture', () => {
  it('generates filename from timestamp and text slug', () => {
    const filename = generateCaptureFilename('Thomas still hasn\'t responded re infra cost', new Date('2026-03-17T09:14:00'))
    expect(filename).toBe('2026-03-17T09-14-00-thomas-still-hasnt-responded-re-infra.md')
  })

  it('truncates slug to 40 chars', () => {
    const long = 'This is a very long capture text that should be truncated to forty characters maximum for the filename'
    const filename = generateCaptureFilename(long, new Date('2026-03-17T10:00:00'))
    const slug = filename.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '').replace('.md', '')
    expect(slug.length).toBeLessThanOrEqual(40)
  })

  it('formats capture content with frontmatter', () => {
    const content = formatCaptureContent('Thomas sent the cost estimate')
    expect(content).toContain('captured:')
    expect(content).toContain('raw: true')
    expect(content).toContain('source: capture')
    expect(content).toContain('Thomas sent the cost estimate')
  })

  it('sanitizes special characters in slug', () => {
    const filename = generateCaptureFilename('Cost: $5,000 — really?!', new Date('2026-03-17T10:00:00'))
    expect(filename).not.toContain('$')
    expect(filename).not.toContain('!')
    expect(filename).not.toContain('—')
  })
})
```

- [ ] **Step 2: Run tests — verify FAIL**

- [ ] **Step 3: Implement capture.ts**

Create `src/lib/capture.ts`:
```typescript
import type { WorkGraph } from '@/types/graph'

export function generateCaptureFilename(text: string, now: Date = new Date()): string {
  // Use LOCAL time, not UTC — spec section 6.3 examples use local time
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '')
  return `${ts}-${slug}.md`
}

export function formatCaptureContent(text: string): string {
  const now = new Date().toISOString()
  return `---\ncaptured: ${now}\nraw: true\nsource: capture\n---\n\n${text}\n`
}

// Async function: writes to ~/twin/inbox/ then triggers Resolver
export async function captureToInbox(text: string, graph: WorkGraph, activeProject?: string): Promise<string> {
  // 1. Generate filename
  // 2. Format content with frontmatter (captured, raw, source)
  // 3. Write file to ~/twin/inbox/ via fs module — CAPTURE MUST NEVER BE BLOCKED
  // 4. Trigger Resolver in background (non-blocking):
  //    - On success: write resolver output back as YAML frontmatter to the same inbox file
  //      (add resolver_output field to the frontmatter — spec section 13: "Proposed deltas
  //       are written back as frontmatter")
  //    - On failure: write resolver_error field to frontmatter instead
  // 5. Return the filename
}
```

- [ ] **Step 4: Run tests — verify PASS**

- [ ] **Step 5: Implement CaptureStrip component**

Create `src/components/CaptureStrip.tsx`:
```typescript
// Persistent input bar at bottom of views
// On Enter: call captureToInbox(), clear input, green border flash
// Shows loading indicator while Resolver runs (non-blocking)
// Placeholder: "Capture a thought, task, or decision… Enter to save"
```

Tailwind styled: fixed bottom, full width of main content area, subtle border, focus ring.

- [ ] **Step 6: Wire CaptureStrip into App.tsx**

Add `<CaptureStrip>` at the bottom of the main content area, passing the graph and active project.

- [ ] **Step 7: Commit**

```bash
git add src/lib/capture.ts src/lib/capture.test.ts src/components/CaptureStrip.tsx src/App.tsx
git commit -m "feat: implement capture system with inbox file creation and capture strip

Filename: timestamp + text slug (max 40 chars)
Frontmatter: captured, raw, source fields
CaptureStrip: persistent input, Enter to save, green flash on success
Resolver triggered async after file write (non-blocking)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Delta Review UI (Reusable)

**Files:**
- Create: `src/components/DeltaReview.tsx`
- Create: `src/components/StatusBadge.tsx`

- [ ] **Step 1: Implement StatusBadge**

Create `src/components/StatusBadge.tsx` — small pill component showing status with colour coding:
- `todo` → grey
- `in_progress` → blue
- `blocked` → red
- `done` → green
- `active` → teal
- `superseded` → grey
- `draft` → grey
- `high` → red, `medium` → amber, `low` → grey (for priority)

- [ ] **Step 2: Implement DeltaReview**

Create `src/components/DeltaReview.tsx` — displays a list of proposed observations from the Resolver:

```
┌─────────────────────────────────────────────────────┐
│ ☑ TASK  Cost estimate received → unblock task       │
│   Evidence: "Thomas sent the cost estimate"          │
│   Delta: mark_unblocked(01A)                        │
│                                                [edit]│
├─────────────────────────────────────────────────────┤
│ ☑ NOTE  Infrastructure costs confirmed               │
│   Evidence: "confirmed $5k/month for H100 cluster"   │
│   Delta: create_note                                 │
│                                                [edit]│
└─────────────────────────────────────────────────────┘
│  [ Accept selected ]  [ Discard all ]               │
```

Props:
```typescript
type DeltaReviewProps = {
  observations: ProposedObservation[]
  confidence: Confidence
  onAccept: (selected: ProposedObservation[]) => void
  onDiscard: () => void
  onEdit?: (index: number, edited: ProposedObservation) => void
}
```

**Confidence-based UX (spec section 9):**
- `high` confidence: observations are auto-accepted with a 10-second undo toast ("Applied 2 observations — Undo"). If user doesn't undo, deltas are applied.
- `medium` confidence: observations shown as cards, checkboxes pre-checked, one-click "Accept" button.
- `low` confidence: observations shown as cards, checkboxes unchecked by default, evidence highlighted in yellow. User must explicitly check items to accept.

Each observation card shows:
- Checkbox (pre-checked for medium, unchecked for low)
- Type badge (from StatusBadge)
- Summary text
- Evidence quote (italic, smaller, highlighted yellow for low confidence)
- Delta operation description (human-readable)
- Edit button: opens inline edit of summary and proposed_delta

- [ ] **Step 3: Commit**

```bash
git add src/components/DeltaReview.tsx src/components/StatusBadge.tsx
git commit -m "feat: add reusable DeltaReview and StatusBadge components

DeltaReview: observation cards with checkboxes, evidence, delta descriptions
StatusBadge: colour-coded pills for task/delivery/decision statuses
Reused by inbox triage, reconciler review, and future agent outputs

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Inbox Triage View

**Files:**
- Create: `src/components/InboxTriage.tsx`
- Create: `src/components/InboxItem.tsx`
- Create: `src/components/ManualClassify.tsx`
- Modify: `src/App.tsx` (add inbox route)

- [ ] **Step 1: Implement ManualClassify**

Create `src/components/ManualClassify.tsx` — fallback when Resolver fails or returns low confidence:
- Project picker dropdown (from graph's project entities)
- Note type selector (thought, meeting, decision, reference)
- Title input
- On confirm: creates a `create_note` delta

- [ ] **Step 2: Implement InboxItem**

Create `src/components/InboxItem.tsx` — single inbox item card:
- Raw capture text (large, readable)
- If resolver output available: DeltaReview component with observations
- If resolver failed/pending: ManualClassify component
- Confidence badge
- Three action buttons: Accept, Edit, Discard
- **Edit action:** Switches the card to show ManualClassify component pre-filled with the Resolver's `candidate_project`, `suggested_note_type`, and `suggested_note_title`. User can adjust these fields, then confirm to move the file and apply the edited classification as a `create_note` delta.

Props:
```typescript
type InboxItemProps = {
  item: InboxItem  // from types
  resolverOutput?: ResolverOutput
  projects: ProjectEntity[]
  onAccept: (item: InboxItem, deltas: DeltaOperation[]) => void
  onEdit: (item: InboxItem, editedClassification: { project: string; noteType: NoteType; title: string }) => void
  onDiscard: (item: InboxItem) => void
}
```

- [ ] **Step 3: Implement InboxTriage**

Create `src/components/InboxTriage.tsx` — the full inbox view:
- Reads all items from `~/twin/inbox/` via fs module
- Sorts chronologically
- Renders each as an InboxItem
- Accept handler: validates deltas, applies via State Updater, moves file to project notes
- Discard handler: deletes inbox file
- Shows empty state when inbox is clear: "Inbox clear — nothing to triage"
- Shows count badge in header

- [ ] **Step 4: Wire into App.tsx**

Add inbox view routing:
- Sidebar "Inbox [N]" shows count of inbox items
- Clicking navigates to InboxTriage view
- After accept/discard, rebuild graph

- [ ] **Step 5: Commit**

```bash
git add src/components/InboxTriage.tsx src/components/InboxItem.tsx src/components/ManualClassify.tsx src/App.tsx
git commit -m "feat: implement inbox triage with resolver interpretation and manual fallback

InboxTriage: chronological list, accept/edit/discard actions
InboxItem: shows resolver observations or manual classification
ManualClassify: project picker, type selector, title input
Deltas validated and applied via State Updater on accept

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Project Views (Tasks, Deliveries, Notes)

**Files:**
- Create: `src/components/ProjectTaskList.tsx`
- Create: `src/components/ProjectDeliveryList.tsx`
- Create: `src/components/ProjectNoteList.tsx`
- Modify: `src/App.tsx` (add project sub-views)
- Modify: `src/components/Sidebar.tsx` (add project sub-navigation)

- [ ] **Step 1: Implement ProjectTaskList**

Create `src/components/ProjectTaskList.tsx`:
- Reads tasks from graph for the active project
- Table with columns: Title, Status, Priority, Due, Blocked By, Waiting On
- Status is an inline dropdown (todo/in_progress/blocked/done) — on change, creates an `update_task_status` delta, validates, applies via State Updater
- Priority shown as StatusBadge
- Overdue dates highlighted red
- Filterable by status (toggle buttons: All, Todo, In Progress, Blocked, Done)
- Sorted: blocked → overdue → high priority → by due date

- [ ] **Step 2: Implement ProjectDeliveryList**

Create `src/components/ProjectDeliveryList.tsx`:
- Table: Title, Type, Status, Due, Brief
- Status dropdown (draft/in_review/delivered/archived) — inline editing via delta
- StatusBadge for type

- [ ] **Step 3: Implement ProjectNoteList**

Create `src/components/ProjectNoteList.tsx`:
- List of notes for the active project
- Each row: title, type badge, updated date, twin_synced toggle
- Twin_synced toggle: on change, updates the note frontmatter via fs.writeNote
- Click a note: navigates to note view (placeholder for Phase 4)
- Sorted by updated date, most recent first

- [ ] **Step 4: Update Sidebar with project sub-navigation**

When a project is selected, show sub-items:
```
PROJECTS
▼ Municipality platform
  ○ Tasks (5)
  ○ Deliveries (3)
  ○ Notes (1)
  ○ Graph
○ Internal tooling
```

- [ ] **Step 5: Wire into App.tsx**

Add routing for project sub-views: `project-tasks`, `project-deliveries`, `project-notes`, `project-graph`. Pass the active project slug to each component.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProjectTaskList.tsx src/components/ProjectDeliveryList.tsx src/components/ProjectNoteList.tsx src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: add project views with inline task/delivery status editing

ProjectTaskList: filterable, sortable, inline status dropdown via deltas
ProjectDeliveryList: inline status editing
ProjectNoteList: twin_synced toggle, sorted by updated
Sidebar: project sub-navigation (tasks/deliveries/notes/graph)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Global Keyboard Shortcut (Capture Window)

**Files:**
- Modify: `src-tauri/src/lib.rs` (register global shortcut)
- Modify: `src-tauri/tauri.conf.json` (add capture window config)
- Create: `src/CaptureWindow.tsx` (lightweight capture-only UI)

- [ ] **Step 1: Add capture window configuration**

In `src-tauri/tauri.conf.json`, add a second window:
```json
{
  "windows": [
    { "label": "main", "title": "Twin", "width": 1200, "height": 800 },
    {
      "label": "capture",
      "title": "Twin Capture",
      "width": 600,
      "height": 120,
      "decorations": false,
      "alwaysOnTop": true,
      "center": true,
      "visible": false,
      "resizable": false,
      "skipTaskbar": true,
      "transparent": true
    }
  ]
}
```

- [ ] **Step 2: Register global shortcut in Rust**

Update `src-tauri/src/lib.rs` to register `Cmd+Shift+Space`:
- On trigger: show the capture window, focus it
- On Enter in capture window: write to inbox, hide window

Use the `tauri_plugin_global_shortcut` API. Check if the shortcut registration needs to happen in the `setup` hook.

- [ ] **Step 3: Create CaptureWindow component**

Create `src/CaptureWindow.tsx` — a minimal UI for the floating capture overlay:
- Single text input, auto-focused
- Enter: capture to inbox, close window
- Escape: close without saving
- Styled: rounded, slight shadow, transparent background, single row

Wire this as the content for the `capture` window label in the Tauri multi-window setup.

- [ ] **Step 4: Test manually**

This requires `pnpm tauri dev` and macOS Accessibility permission. Test:
1. `Cmd+Shift+Space` opens the capture overlay
2. Type text, press Enter → file appears in `~/twin/inbox/`
3. Escape closes without saving
4. If Accessibility permission denied → log warning, shortcut doesn't register (non-fatal)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/tauri.conf.json src/CaptureWindow.tsx
git commit -m "feat: add global capture shortcut (Cmd+Shift+Space) with floating window

Floating capture window: always-on-top, transparent, single input
Enter saves to inbox and hides, Escape dismisses
Requires macOS Accessibility permission — graceful fallback if denied

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Integration Wiring + Error Handling

**Files:**
- Modify: `src/App.tsx` (error boundaries, loading states)
- Modify: `src/components/Sidebar.tsx` (inbox count, token cost)
- Create: `src/components/ErrorBoundary.tsx`
- Create: `src/components/ApiStatus.tsx`

- [ ] **Step 1: Create ErrorBoundary**

React error boundary that catches render errors and shows a friendly message instead of a white screen. Includes a "Retry" button.

- [ ] **Step 2: Create ApiStatus component**

Small status indicator in the sidebar footer:
```
● Twin active · $0.12 today
```
Shows token cost from useTokenCounter. If API key is missing, shows warning.

- [ ] **Step 3: Update Sidebar with inbox count**

The sidebar "Inbox [N]" badge should reflect the actual count of files in `~/twin/inbox/`. Read via fs module, update on file watcher events.

- [ ] **Step 4: Wire error handling throughout**

- CaptureStrip: show error toast if file write fails
- InboxTriage: show error if delta application fails
- Resolver: show "AI unavailable" if API call fails, switch to manual classify
- Graph view: show "Graph could not be built" with retry button

- [ ] **Step 5: Add file system error resilience (spec section 20)**

Update `useWorkGraph` to handle partial graph construction:
- If `tasks.yaml` has invalid YAML: skip that file, add warning badge to the project in sidebar
- If note frontmatter is malformed: include the note with a warning icon, body still readable
- If a file is deleted externally during graph build: skip it, log warning
- Never refuse to build the graph because of parse errors — partial data is better than no data
- Show notification: "N files could not be parsed — some data may be missing"

Update `ProjectTaskList` and `ProjectNoteList`:
- Show a warning banner at the top if the project has parse errors
- Items with parse errors show a warning icon but are still browsable

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add error boundaries, API status, and inbox count

ErrorBoundary: catches render errors with retry
ApiStatus: token cost display in sidebar footer
Inbox count: live badge from file watcher
Graceful degradation: manual classify when Resolver fails

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 Gate

Run all checks:

```bash
pnpm test                          # All unit tests pass
pnpm exec tsc --noEmit             # No type errors
pnpm build                         # Vite compiles
source ~/.cargo/env && pnpm tauri dev   # App opens, full UI works
```

**Gate criteria (from spec section 23):**

1. **Resolver correctly classifies real captures** → Verified by Task 2 tests + manual testing
2. **API failure falls back gracefully** → Verified by Task 8 error handling
3. **Capture from another app in under 5 seconds** → Verified by Task 7 global shortcut
4. **Triage 5 items in under 2 minutes** → Verified by Task 5 inbox triage UI
5. **Edit a task status in UI → tasks.yaml updates → graph re-derives** → Verified by Task 6 inline editing
6. **IDs remain stable through edits** → Verified by existing Phase 1 tests

**If all gates pass:** Proceed to Phase 3 plan (Planning + Dispatch).
