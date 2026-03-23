# Twin — Complete Prototype Specification
**Version:** 1.0
**Date:** 2026-03-23
**Status:** Pre-build
**Architecture:** Filesystem-canonical, graph-derived, Tauri desktop app
**Supersedes:** v0.4 (2026-03-17)

---

## Table of contents

1. What this document is
2. Product definition
3. Core design principles
4. The folder structure
5. File formats
6. The work graph
7. Internal agent runtime
8. The three dispatch targets
9. The scope and objective model
10. The focus view
11. Capture
12. Inbox triage
13. Conversation import
14. The Twin app — views and navigation
15. Tech stack
16. TypeScript types
17. CLAUDE.md generation
18. Error handling and degraded states
19. MVP feature list
20. Build order
21. Definition of done
22. Open questions
23. Success metrics

---

## 1. What this document is

This spec defines the first working prototype of Twin — a personal context engine and agent orchestration layer for knowledge workers. The prototype's goal is not to be feature-complete. It is to validate one core hypothesis:

> **If Twin maintains a live, structured model of a user's work state and routes work to Claude Chat, Claude Code, and Claude Cowork through typed context packs and structured writeback contracts, those sessions will be meaningfully better — with near-zero overhead from the user.**

Everything in this spec is in service of testing that hypothesis. Features that don't directly test it are out of scope for v1.

### Changes from v0.4

| Area | v0.4 | v1.0 | Rationale |
|---|---|---|---|
| Structured data format | Markdown tables | YAML files | Markdown tables are fragile to round-trip. YAML is unambiguous, parseable, and still human-readable. |
| Entity identity | Match by title string | ULID on every entity | Title matching breaks on typos, renames, and LLM paraphrase. Stable IDs are structural. |
| Chat writeback | Manual paste + import only | Clipboard listener + auto-detect + one-click import | Chat is the most common dispatch target but had the highest friction writeback. |
| Confidence model | Numeric 0.0–1.0 with thresholds | Categorical `high` / `medium` / `low` | LLMs are poorly calibrated for numeric scores. Categorical is more reliable. |
| CLAUDE.md regeneration | On every state change (debounced 30s) | On dispatch and on explicit request | Regeneration is an API call. During active work, per-change regeneration is wasteful. |
| Planner scope | Single agent doing everything | Planner (recommends action) + Prioritiser (focus brief) | The v0.4 Planner carried too much responsibility for a single LLM call. |
| Concurrent edits | Not addressed | File-level optimistic locking via mtime check | The spec promises "any editor can write" but didn't handle conflicts. |
| Error handling | Not addressed | Dedicated section with degraded state behaviors | Happy path only is insufficient for a tool that runs all day. |
| Build timeline | ~9 days | ~4 weeks | v0.4 estimate was 3-4x too aggressive for the scope. |
| Session IDs | Mixed format (ULID in types, timestamp in examples) | ULID everywhere | Consistency. |

### What is explicitly deferred to v2

- Support for non-Claude agents (Cursor, ChatGPT, Notion AI, Gemini, etc.)
- Governance and privacy modes
- Workspace / repository linking
- Team or shared twins
- Calendar integration
- Passive screen or audio capture
- Mobile app
- Cloud sync or authentication

---

## 2. Product definition

Twin sits between how you think and how your AI agents work. It captures notes, tasks, and decisions; builds and maintains a live structured model — the work graph — of your current state across projects; and dispatches tailored context packs to three AI production modes.

| Mode | Activity | Output type |
|---|---|---|
| Claude Chat | Understand, explore, decide | Mental state change — learnings and decisions |
| Claude Code | Implement, build, debug | Working code, scripts, configuration |
| Claude Cowork | Draft, format, deliver | Documents, decks, analyses, communications |

The three modes map to the three fundamental activities of knowledge work:

- **Understanding** is the most common and least captured. You work through a problem, evaluate options, form a view. Nothing gets written down unless Twin makes it easy.
- **Implementation** produces verifiable outputs in a repository or filesystem. Claude Code is the agent; Twin provides the context and receives the writeback.
- **Delivery** produces formatted artifacts for a human audience. Claude Cowork is the agent; Twin provides the brief and the source materials.

Twin also closes the loop. Outputs from all three modes write back into `~/twin/` as structured session manifests. Twin's Reconciler converts these into proposed state deltas. The work graph stays current without the user having to maintain it manually.

---

## 3. Core design principles

**Filesystem-canonical, graph-derived.**
YAML and markdown files in `~/twin/` are the durable source of truth. Twin maintains a derived work graph in memory, built by parsing those files on launch and kept current by file watchers. The graph is never persisted separately — if lost, it is rebuilt from files in under 200ms. Any text editor, any agent, and any future tool can read and write the canonical state without Twin being present.

**Structured data in YAML, prose in markdown.**
Structured, machine-read data (tasks, deliveries, people) is stored as YAML — unambiguous, trivially parseable, and safely round-trippable. Prose content (notes, decisions, context) remains in markdown for human readability and agent compatibility.

**Every entity has a stable identity.**
Tasks, deliveries, open questions, sessions, and people all carry a ULID. References between entities use IDs, not display strings. Titles are for humans; IDs are for machines. This prevents the entire class of bugs where an LLM paraphrases a title and breaks a reference.

**Twin proposes actions, not just summaries.**
Every output from Twin answers "what happens next?" not just "what is the current state?" A focus brief ends with prioritised next actions. A dispatch includes a writeback contract. A reconciliation produces proposed deltas, not a summary of what happened.

**All autonomous updates are expressed as structured deltas.**
Twin never applies freeform mutations to canonical files. Every change — whether proposed by an internal agent or received from an external one — is expressed as a typed delta operation (`create_task`, `append_decision`, `mark_unblocked`, etc.) that Twin validates before applying. Every change is inspectable and reversible.

**External agents never mutate canonical state directly.**
Claude Code and Cowork write outputs to the project folder. They do not edit `tasks.yaml` or `decisions.md` directly. Instead, they emit a session manifest file that Twin reads, validates, and applies as deltas. Canonical state stays under Twin's control.

**Context is objective-based, files are the override.**
When the user dispatches a session, they state an objective. Twin's Planner assembles the minimal sufficient context pack automatically. The user can inspect and override selected sources, but does not have to think about file scopes by default.

**Autonomy is explicit, bounded, and inspectable.**
Twin takes no autonomous action the user has not seen proposed. Proactive behaviours — drafting a follow-up, proposing downstream task updates after a decision — are always shown as proposals before being applied. No silent writes to canonical state.

**Capture must be near-zero friction.**
If adding something to Twin takes more than 5 seconds, the habit breaks and the model goes stale. Capture is always one keystroke away from anywhere on the OS.

**The folder is the integration.**
Claude Code and Cowork are pointed at `~/twin/projects/[slug]/`. No API integration required. The filesystem is the contract between Twin and every agent it dispatches to.

**Graceful degradation over silent failure.**
When an API call fails, a file is malformed, or a manifest references unknown entities, Twin surfaces the problem to the user and continues operating with reduced capability. No silent data loss. No invisible errors.

---

## 4. The folder structure

```
~/twin/
├── CLAUDE.md                              # Global context — role, expertise, style
├── people.yaml                            # Lightweight people model
│
├── inbox/                                 # Unprocessed captures, one file each
│   ├── 2026-03-17T09-14-thomas.md
│   └── 2026-03-17T11-02-polars.md
│
├── sessions/                              # One pair of files per dispatch session
│   ├── writeback-schema.yaml              # Schema agents use for manifests
│   ├── 01JBQF8X2K-pack.md                # Context pack sent to agent
│   └── 01JBQF8X2K-manifest.yaml          # Writeback from agent
│
└── projects/
    ├── municipality-platform/
    │   ├── CLAUDE.md                      # Project brief — generated by Twin
    │   ├── context.md                     # Background: client, goal, constraints
    │   ├── tasks.yaml                     # Task list with status and deadlines
    │   ├── deliveries.yaml                # Delivery tracker
    │   ├── decisions.md                   # Append-only decision log
    │   └── notes/
    │       ├── 2026-03-17-tech-stack-decision.md
    │       ├── 2026-03-16-stakeholder-alignment.md
    │       └── 2026-03-14-meeting-jakob.md
    │
    └── internal-tooling/
        ├── CLAUDE.md
        ├── context.md
        ├── tasks.yaml
        ├── deliveries.yaml
        ├── decisions.md
        └── notes/
```

### Why this structure works for agents

When you point Claude Code at `~/twin/projects/municipality-platform/`, it reads `CLAUDE.md` (the generated brief), `tasks.yaml` (what is in flight and blocked), `decisions.md` (what has been decided), and `notes/` (the thinking behind everything). It does not need to be told what to read. The filenames and structure are self-describing.

When you point Cowork at the same folder, it reads the same files and produces different outputs — because it is a different agent with a different mandate, not because the context is different.

Git version control is free. Run `git init ~/twin/` and you get full history of every note, decision, and context change.

---

## 5. File formats

### 5.1 Note files (`notes/YYYY-MM-DD-[slug].md`)

Every note is a standalone markdown file with YAML frontmatter. The frontmatter is kept minimal — only what Twin needs to build the work graph without parsing the full body. The body is for humans and agents to read directly.

```markdown
---
id: 01JBQF8X2K
title: Tech stack decision
type: thought
project: municipality-platform
twin_synced: true
linked_delivery: 01JBQF9M3P
created: 2026-03-17
updated: 2026-03-17
---

We're choosing between Polars + DuckDB vs Spark for the pipeline layer.
The client has on-prem H100s so inference cost isn't the concern.

Main tension: team familiarity (Spark) vs performance + simplicity (Polars).
Leaning toward Polars — fast, clean API, junior devs up to speed in a sprint.

Blocker: Thomas hasn't sent the infra cost estimate. Architecture diagram on hold.
Decision needed by Friday EOD.
```

**Frontmatter fields:**

| Field | Type | Description |
|---|---|---|
| `id` | ULID | Stable identity. Generated on creation, never changed. |
| `title` | string | Display title. Auto-generated from first line if absent. |
| `type` | enum | `thought \| meeting \| decision \| reference \| chat_learning \| conversation` |
| `project` | string | Project slug. Absent if note is in inbox. |
| `twin_synced` | bool | Include in AI context and work graph. Default `true`. |
| `linked_delivery` | ULID? | Delivery ID this note informs. Optional. |
| `people` | string[]? | Names — for conversation notes. Looked up in `people.yaml`. |
| `date` | string? | Date of conversation — for conversation notes. |
| `created` | date | ISO date, set on creation, never changed. |
| `updated` | date | ISO date, updated on every save. |

**Note types:**

| Type | Description |
|---|---|
| `thought` | Raw idea, observation, or half-formed thinking |
| `meeting` | Notes from a meeting, call, or structured conversation |
| `decision` | A decision that was made — also appended to `decisions.md` |
| `reference` | Background material, constraints, client information |
| `chat_learning` | Written back from a Claude Chat or AI conversation session |
| `conversation` | Structured record of a real-world exchange with a colleague or client |

---

### 5.2 Conversation notes

A `conversation` note is a structured record of a real-world exchange. It is not a transcript. It captures what was relevant: what was discussed, what was agreed, and what remains open.

This is the primary mechanism for capturing context that exists only in human conversations — the client constraint mentioned in a call, the risk flagged by a colleague, the informal decision made in a message thread.

```markdown
---
id: 01JBQG1R4N
title: Thomas — infra cost estimate and H100 constraints
type: conversation
project: municipality-platform
twin_synced: true
people:
  - Thomas
date: 2026-03-17
created: 2026-03-17
updated: 2026-03-17
---

## What we discussed
Thomas confirmed the H100 cluster has 8 nodes available but memory per node is
limited to 40GB due to shared workloads. Cost estimate will be ready Thursday EOD.

## What was agreed
- We wait for the cost estimate before finalising the architecture diagram
- Thomas will flag if Thursday slips — cannot slip past Friday without escalation

## Open questions
- Can the cluster be dedicated during peak inference periods?
```

When a conversation note is saved with content in "What was agreed," Twin proposes appending each item to `decisions.md`. The user toggles per item.

---

### 5.3 Inbox captures (`inbox/[timestamp]-[slug].md`)

```markdown
---
captured: 2026-03-17T09:14:00
raw: true
source: capture
---

Thomas still hasn't responded re infra cost estimate. Blocking architecture diagram.
```

Filename: ISO timestamp with colons replaced by hyphens + first 40 chars of content as slug.

---

### 5.4 Tasks (`projects/[slug]/tasks.yaml`)

```yaml
# Tasks — municipality-platform
# Updated: 2026-03-17

tasks:
  - id: 01JBQF3A1K
    title: Finalise Q2 pitch structure
    status: in_progress
    priority: high
    due: 2026-03-21
    blocked_by: null
    waiting_on: null
    delivery: 01JBQF9M3P

  - id: 01JBQF3B2M
    title: Architecture diagram
    status: blocked
    priority: high
    due: 2026-03-21
    blocked_by: Infra cost estimate
    waiting_on: Thomas
    delivery: 01JBQF9M3P

  - id: 01JBQF3C3N
    title: TCO one-pager for Jakob
    status: todo
    priority: high
    due: 2026-03-18
    blocked_by: null
    waiting_on: null
    delivery: 01JBQF9N4Q

  - id: 01JBQF3D4P
    title: Stakeholder alignment doc
    status: todo
    priority: medium
    due: 2026-03-25
    blocked_by: null
    waiting_on: null
    delivery: null

  - id: 01JBQF3E5Q
    title: Set up Polars dev environment
    status: todo
    priority: low
    due: null
    blocked_by: null
    waiting_on: null
    delivery: null
```

**Why YAML instead of markdown tables:** YAML is unambiguous to parse, trivially round-trippable, supports null values natively, and doesn't break when a field contains pipes or special characters. The tradeoff is slightly lower readability in a plain text editor — but tasks are primarily viewed through the Twin UI, and YAML is still readable enough for direct editing.

---

### 5.5 Deliveries (`projects/[slug]/deliveries.yaml`)

```yaml
# Deliveries — municipality-platform
# Updated: 2026-03-17

deliveries:
  - id: 01JBQF9M3P
    title: Q2 pitch deck
    slug: q2-pitch-deck
    type: deck
    status: in_progress
    due: 2026-03-21
    brief: Architecture proposal, 3 options, risk section

  - id: 01JBQF9N4Q
    title: TCO one-pager
    slug: tco-one-pager
    type: doc
    status: draft
    due: 2026-03-18
    brief: Single-page TCO comparison for Jakob

  - id: 01JBQF9P5R
    title: Tech stack ADR
    slug: tech-stack-adr
    type: doc
    status: draft
    due: 2026-03-25
    brief: Architecture decision record for Polars + DuckDB
```

Delivery slugs are retained for human-readable folder references alongside the ULID. The slug is derived from the title on creation and never changes.

---

### 5.6 Decisions log (`projects/[slug]/decisions.md`)

Append-only. Never edited, only extended. Both humans and agents append here. Decisions remain in markdown because they are prose-heavy, append-only, and never need round-trip parsing — Twin only appends new entries and reads existing ones for context.

```markdown
# Decisions — municipality-platform

## 2026-03-17 — Data framework decision deferred
_id: 01JBQFA1K2_

**Decision:** No final decision on Polars vs Spark yet.
**Rationale:** Blocked on infra cost estimate from Thomas. Decide by Friday EOD.
**Unblocks:** 01JBQF3B2M (Architecture diagram)
**Decided by:** August

---

## 2026-03-14 — On-premise inference confirmed
_id: 01JBQFA2M3_

**Decision:** All LLM inference will run on-prem on the client's H100 cluster.
**Rationale:** Client data governance policy prohibits cloud inference.
**Unblocks:** 01JBQF3D4P (Stakeholder alignment doc)
**Decided by:** August + client IT team

---
```

The `_id:` line gives each decision a stable identity. The `Unblocks` field references task IDs. Human-readable titles are included in parentheses for readability when editing directly.

---

### 5.7 Global CLAUDE.md (`~/twin/CLAUDE.md`)

Written during onboarding. Updated via Twin's settings screen or directly.

```markdown
# Global context

## Role & expertise
Senior consultant and data scientist at Trustworks, a Danish IT consultancy.
Masters in mathematical modelling. Specialises in AI systems, data pipelines,
solution architecture, and public sector technology.

## Current toolchain
- Python: conda (py_venv_01), polars, black, ruff, pyright, pytest
- AI coding: Claude Code, Kiro
- MCP: Context7, GitHub, Memory (SQLite), Playwright
- Context: chub for external API docs, Context7 for framework internals
- Platform: macOS, zsh

## Working style
- Strict typing, explicit error handling, no speculative features
- Conventional commits, no Claude co-author attribution
- Plan before executing on tasks over ~30 minutes
- Minimal, actionable documentation
- Small testable iterations over large speculative changes

## Communication preferences
- Direct, no pleasantries
- Technically precise

## Instructions for all sessions
- Read CLAUDE.md in the project folder before starting any task
- Ask clarifying questions before executing if the task is ambiguous
- Append decisions to decisions.md after the session — not to CLAUDE.md
- Flag blockers and risks explicitly
```

---

### 5.8 Project CLAUDE.md (`~/twin/projects/[slug]/CLAUDE.md`)

Generated and maintained by Twin. Regenerated on dispatch and on explicit user request — not on every file change. Do not edit directly.

```markdown
# Project context — Municipality Data Platform
_Generated by Twin · 2026-03-17_

## Project overview
Building a data platform proposal for a Danish municipality client. Goal is to replace
their fragmented data infrastructure with a unified pipeline and inference layer.
Client has on-prem H100 GPUs and strict data governance requirements.

## Current focus
Finalising the Q2 pitch deck by Friday EOD. Architecture diagram is blocked on infra
cost estimate from Thomas (client infrastructure lead). TCO one-pager for Jakob due Tuesday.

## Open decisions
- Data framework: Polars + DuckDB vs Spark — decide by Friday EOD once cost estimates arrive
- Inference layer architecture — depends on data framework decision

## Blocked items
- Architecture diagram (01JBQF3B2M) — waiting on Thomas (infra cost estimate, expected Thursday EOD)

## Deliveries in progress
| Delivery | Type | Due | Status |
|---|---|---|---|
| Q2 pitch deck | deck | 2026-03-21 | in_progress |
| TCO one-pager | doc | 2026-03-18 | draft |
| Tech stack ADR | doc | 2026-03-25 | draft |

## Key constraints
- All LLM inference on-prem (client data governance — no cloud inference)
- Stakeholder Jakob (IT director) is risk-averse — frame new tech conservatively
- Friday EOD is a hard deadline for the pitch

## Pick up here
Chase Thomas for the infra cost estimate, then complete the architecture diagram
and slot it into section 2 of the Q2 pitch deck.

---
_Source files: context.md · tasks.yaml · deliveries.yaml · decisions.md · notes/_
_Do not edit this file — it is regenerated by Twin._
_Append decisions to decisions.md. Edit tasks in tasks.yaml._
```

---

### 5.9 People (`~/twin/people.yaml`)

Global, lightweight. Not a CRM — just enough for Twin to reason about who is involved in what.

```yaml
# People
# Updated: 2026-03-17

people:
  - id: 01JBQFB1A1
    name: Thomas
    role: Infrastructure lead
    projects:
      - municipality-platform
    notes: Client-side, key technical contact

  - id: 01JBQFB2B2
    name: Jakob
    role: IT Director
    projects:
      - municipality-platform
    notes: Client stakeholder, risk-averse, vendor lock-in concern

  - id: 01JBQFB3C3
    name: Rasmus
    role: Consultant
    projects:
      - municipality-platform
      - internal-tooling
    notes: Trustworks colleague, reviews exec summaries
```

**How Twin uses people.yaml:**
- Conversation note people picker reads this for the dropdown
- When a task has `waiting_on: Thomas`, Twin annotates the focus brief with Thomas's role
- When generating CLAUDE.md, people involved in decisions or blockers are annotated
- The Planner uses this when proposing follow-up drafts — it knows who to address

---

### 5.10 Session files (`~/twin/sessions/`)

**Context pack** (`[session_id]-pack.md`) — the full brief sent to the agent. Stored so Twin can always see what context was provided for any past session.

**Session manifest** (`[session_id]-manifest.yaml`) — structured writeback from the agent. Written by Claude Code or Cowork (or manually by the user) after a session. Twin's Reconciler reads this file.

**Writeback schema** (`writeback-schema.yaml`) — written by Twin on first launch. Included in every dispatched brief so agents always have the schema available.

```yaml
# Twin session writeback schema v1.0
# Write your session manifest to ~/twin/sessions/[session_id]-manifest.yaml

session_id: ULID               # from the brief you received
summary: string                 # 2-3 sentences: what happened
target: chat | code | cowork

decisions:
  - title: string
    decision: string
    rationale: string           # optional
    unblocks: ULID              # optional — task ID this decision unblocks

tasks_created:
  - title: string
    priority: high | medium | low
    due_date: YYYY-MM-DD        # optional
    waiting_on: string          # optional

tasks_updated:
  - id: ULID                   # must match existing task ID
    status: todo | in_progress | blocked | done
    blocked_by: string          # optional
    waiting_on: string          # optional

artifacts:
  - path: string                # relative to project folder
    delivery_id: ULID           # optional
    description: string

open_questions:
  - id: ULID                   # generated by Twin, included in brief for reference
    question: string

blockers:
  - title: string
    blocked_by: string
    waiting_on: string          # optional

confidence: high | medium | low
```

**Fallback for task references:** If an agent writes a `tasks_updated` entry without a valid ID (e.g., it only has a title), Twin's Reconciler attempts fuzzy matching against existing task titles in the project and presents the match to the user for confirmation. This handles the common case where an agent doesn't have IDs available.

---

## 6. The work graph

The work graph is Twin's in-memory, derived representation of the project state. It is built by parsing the canonical files on launch and updated incrementally as files change. It is never persisted separately — if lost, it is rebuilt from files.

The graph exists because reasoning over typed entities and typed relationships is more reliable than reasoning over raw text. The internal agents operate over the graph, not over file contents directly.

### Typed entities

```typescript
type ULID = string

type EntityRef = {
  file: string        // relative path from ~/twin/
  line?: number       // line number for YAML entries or markdown sections
}

type ProjectEntity = {
  kind: 'project'
  slug: string
  name: string
  status: 'active' | 'paused' | 'archived'
  ref: EntityRef
}

type TaskEntity = {
  kind: 'task'
  id: ULID
  title: string
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  priority: 'high' | 'medium' | 'low'
  due_date: string | null
  blocked_by: string | null
  waiting_on: string | null
  project: string
  delivery: ULID | null
  ref: EntityRef
}

type DeliveryEntity = {
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

type DecisionEntity = {
  kind: 'decision'
  id: ULID
  title: string
  decision: string
  rationale: string | null
  unblocks: ULID | null
  date: string
  decided_by: string
  project: string
  ref: EntityRef
}

type NoteEntity = {
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

type PersonEntity = {
  kind: 'person'
  id: ULID
  name: string
  role: string | null
  projects: string[]
  ref: EntityRef
}

type OpenQuestionEntity = {
  kind: 'open_question'
  id: ULID
  question: string
  project: string
  source_note: ULID | null
  ref: EntityRef
}

type SessionEntity = {
  kind: 'session'
  id: ULID
  target: DispatchTarget
  objective: string
  status: 'active' | 'completed' | 'reconciled'
  ref: EntityRef
}

type WorkGraphEntity =
  | ProjectEntity | TaskEntity | DeliveryEntity | DecisionEntity
  | NoteEntity | PersonEntity | OpenQuestionEntity | SessionEntity
```

### Typed state transitions (delta operations)

Every change to canonical state is expressed as one of these typed operations. No agent writes to files directly — operations go through Validator then State Updater.

```typescript
type DeltaOperation =
  | { op: 'create_task';            payload: Omit<TaskEntity, 'kind' | 'ref'> }
  | { op: 'update_task_status';     task_id: ULID; project: string; status: TaskEntity['status'] }
  | { op: 'mark_blocked';           task_id: ULID; project: string; blocked_by: string; waiting_on?: string }
  | { op: 'mark_unblocked';         task_id: ULID; project: string }
  | { op: 'append_decision';        payload: Omit<DecisionEntity, 'kind' | 'ref'> }
  | { op: 'create_delivery';        payload: Omit<DeliveryEntity, 'kind' | 'ref'> }
  | { op: 'update_delivery_status'; delivery_id: ULID; project: string; status: DeliveryStatus }
  | { op: 'create_note';            payload: Omit<NoteEntity, 'kind' | 'ref'>; body: string }
  | { op: 'add_open_question';      payload: Omit<OpenQuestionEntity, 'kind' | 'ref'> }
  | { op: 'resolve_question';       question_id: ULID; project: string }
  | { op: 'link_note_delivery';     note_id: ULID; delivery_id: ULID }
  | { op: 'upsert_person';          payload: Omit<PersonEntity, 'kind' | 'ref'> }
```

All delta operations reference entities by ULID, never by display string. The Validator resolves IDs against the graph before applying.

### Derived relationships

The graph tracks relationships between entities derived from their content:

- A task with `waiting_on: Thomas` → related to the person entity named Thomas
- A note with `linked_delivery: 01JBQF9M3P` → related to that delivery
- A decision with `unblocks: 01JBQF3B2M` → related to that task
- Two tasks in the same project with the same `delivery` ID → siblings

These relationships allow the Planner to reason about cascading effects: "this decision unblocks this task which feeds this delivery which is due Friday."

### Graph construction

```typescript
async function buildGraph(): Promise<WorkGraph> {
  const projects = await fs.listProjects()
  const entities: WorkGraphEntity[] = []

  for (const project of projects) {
    entities.push(toProjectEntity(project))
    entities.push(...await parseTasks(project.slug))
    entities.push(...await parseDeliveries(project.slug))
    entities.push(...await parseDecisions(project.slug))
    entities.push(...await parseNotes(project.slug))
  }

  entities.push(...await parsePeople())
  entities.push(...await parseSessions())

  return deriveRelationships(entities)
}
```

Reconstruction takes under 200ms for a typical twin folder (under 500 files). The graph is rebuilt whenever the file watcher detects a change outside of Twin's own writes.

---

## 7. Internal agent runtime

Twin has six internal agents. Each runs as a called function, not a background process. They are invoked by events — user actions, file watcher triggers — and return structured outputs. No agent writes to canonical files directly. All writes go through Validator then State Updater.

The agents share no mutable state between invocations. Each receives the current work graph snapshot as input. This makes them testable in isolation.

### API call budget

Every internal agent that calls the Anthropic API is subject to:
- **Retry with backoff:** On transient errors (429, 500, 503), retry up to 3 times with exponential backoff (1s, 4s, 16s). On persistent failure, surface the error to the user and continue with degraded functionality.
- **Timeout:** 30 seconds per call. If exceeded, abort and surface "AI response timed out — try again or proceed manually."
- **Cost visibility:** Twin maintains a running token count for the session, displayed in the settings/status area. No hard budget enforced in v1 — visibility enables the user to notice runaway costs.

---

### Agent 1 — Resolver

**Purpose:** Convert raw events (captures, conversation imports, file appearances) into typed observations. The entry point for all new information.

**Triggers:** New inbox file written, conversation import submitted, new file detected in project folder.

**Inputs:** Raw text + current work graph + active project slug (if known).

**Output schema:**
```typescript
type ResolverOutput = {
  candidate_project: string | null
  confidence: 'high' | 'medium' | 'low'
  proposed_observations: Array<{
    observation_type: 'task' | 'decision' | 'blocker' | 'open_question' |
                      'note' | 'person_mentioned' | 'artifact_referenced'
    summary: string
    evidence: string                    // direct quote from input text
    proposed_delta: DeltaOperation | null
  }>
  suggested_note_type: NoteType
  suggested_note_title: string
}
```

**System prompt:**
```
You are Twin Resolver.

Convert a raw event into proposed observations about a user's work state.
Operate over the provided work graph. Do not invent entities not present in
the input text or graph.

Rules:
- Only extract what is clearly present. Do not infer beyond the evidence.
- Assess your confidence: high (obvious and unambiguous), medium (likely correct
  but some interpretation required), low (plausible but uncertain).
- Every proposed_observation must include an evidence quote from the input.
- proposed_delta may be null if you cannot confidently determine the right operation.
- When referencing existing entities in deltas, use their IDs from the graph.
- When creating new entities, omit the ID — Twin will generate one.
- Never write to files. Return ResolverOutput JSON only. No prose.
```

**Confidence behaviour:**
- `high`: auto-apply allowed — user sees a notification and can undo
- `medium`: propose to user — one-click accept
- `low`: present for manual review with evidence highlighted

---

### Agent 2 — State Updater

**Purpose:** Apply a validated list of delta operations to canonical files. The only agent that writes to files. No LLM call — purely mechanical.

**Trigger:** User approves a set of validated deltas.

**Concurrency control:** Before writing any file, the State Updater checks the file's mtime against the mtime recorded when the graph was last built from that file. If the mtime has changed (external edit detected), the State Updater:
1. Re-reads the file and re-parses the affected entities
2. Checks whether the delta still applies cleanly (target entity unchanged)
3. If clean: applies the delta to the fresh file content
4. If conflict: surfaces "File was modified externally — review before applying" with a diff view

**Behaviour per operation:**

| Operation | File action |
|---|---|
| `create_task` | Append entry to `tasks.yaml`, generate ULID |
| `update_task_status` | Find entry by ID in `tasks.yaml`, update status field |
| `mark_blocked` / `mark_unblocked` | Update blocked_by and waiting_on fields by ID |
| `append_decision` | Append formatted entry to `decisions.md`, generate ULID |
| `create_delivery` | Append entry to `deliveries.yaml`, generate ULID |
| `update_delivery_status` | Update status field in `deliveries.yaml` by ID |
| `create_note` | Write new file to `projects/[slug]/notes/`, generate ULID |
| `add_open_question` | Append to `## Open questions` in relevant note, generate ULID |
| `resolve_question` | Mark question resolved (strikethrough in note) |
| `link_note_delivery` | Update `linked_delivery` frontmatter field by note ID |
| `upsert_person` | Add or update entry in `people.yaml` by ID (or generate ULID for new) |

**After each write:** Notifies the graph to re-derive affected entities. Marks the project's CLAUDE.md as stale (regenerated on next dispatch). If an operation fails (entity not found, file conflict), returns an error — never silently skips.

---

### Agent 3 — Planner

**Purpose:** Given a user objective and the current work graph, decide what to do next. Recommends which dispatch target to use and which context sources to include.

**Triggers:** User states an objective. Also runs after every Reconciler cycle to propose follow-up actions.

**Inputs:** User objective + work graph + last 5 session records + active project slug.

**Output schema:**
```typescript
type PlannerOutput = {
  recommended_action:
    | { type: 'dispatch_chat';   objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_code';   objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_cowork'; delivery_id: ULID; context_sources: EntityRef[] }
    | { type: 'ask_user';        question: string }
    | { type: 'propose_deltas';  deltas: DeltaOperation[]; rationale: string }
    | { type: 'no_action';       reason: string }
  confidence: 'high' | 'medium' | 'low'
  alternatives: Array<{ action: string; rationale: string }>
}
```

**System prompt:**
```
You are Twin Planner.

Given a user objective and their current work state, decide the best next action.
You may recommend dispatching to Chat, Code, or Cowork. You may propose state
deltas. You may ask one clarifying question. You may propose no action.

Rules:
- Recommend the minimum action that moves the objective forward.
- Do not dispatch if the state is unclear — ask one question instead.
- Reference entities by their IDs when proposing deltas.
- Never invent tasks or decisions not in the current graph.
- Return PlannerOutput JSON only. No prose.
```

---

### Agent 3b — Prioritiser

**Purpose:** Generate the daily focus brief and proactive proposals. Separated from the Planner because it operates across all projects and has a different prompt structure optimised for prioritisation rather than action recommendation.

**Triggers:** Focus view load (once per session, or on explicit refresh). Also runs after Reconciler cycles.

**Inputs:** Work graph (all active projects) + current date.

**Output schema:**
```typescript
type PrioritiserOutput = {
  brief: string                   // 3-5 sentence paragraph: actual state of work right now
  priority_items: Array<{
    title: string
    project: string
    reasoning: string             // one sentence: why this is urgent
    next_action: string           // one concrete action
    entity_refs: ULID[]           // related task/delivery IDs
  }>
  proactive_proposals: Array<{
    proposal: string
    trigger_reason: string
    proposed_delta: DeltaOperation | null
    entity_refs: ULID[]
  }>
}
```

**Proactive checks the Prioritiser runs:**

| Condition | Proposed action |
|---|---|
| Task `waiting_on` a person ≥ 2 days with no update | Draft follow-up to that person |
| Decision appended → tasks reference the unblocked item | Mark those tasks unblocked, elevate priority |
| Delivery status → `in_review` | Propose review checklist note |
| Open question resolved via import | Mark resolved, propose next dispatch |
| Delivery due in ≤ 2 days, status still `draft` | Elevate in focus, propose dispatch_cowork |
| Chat session resolves a blocked task's open question | Propose mark_unblocked + next dispatch |

**System prompt:**
```
You are Twin Prioritiser.

Based on the user's current work state across all active projects, produce a
direct, specific priority brief for today. Also identify proactive proposals —
situations where the work state implies a next action the user has not asked for.

Today: [weekday, date]

Rules:
- Be direct. Do not hedge. Prioritise ruthlessly.
- If not urgent and not blocked, leave it out.
- Proactive proposals must cite trigger_reason explicitly.
- Reference entities by their IDs.
- Never invent tasks or decisions not in the current graph.
- Return PrioritiserOutput JSON only. No prose.
```

Proposals are never applied without confirmation. Dismissed proposals are not re-shown unless the underlying condition changes (detected by comparing entity state at dismissal time vs current state).

---

### Agent 4 — Composer

**Purpose:** Render a complete, bounded context pack for a specific dispatch target and objective. Every dispatched brief is produced by the Composer.

**Trigger:** Planner recommends a dispatch action and user confirms.

**Inputs:** Dispatch target + objective + selected entity refs + work graph + global context.

**Output:**
```typescript
type ContextPack = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string        // full brief, ready to paste or write to file
  selected_sources: EntityRef[] // exactly what was included, for inspection
  writeback_contract: WritebackContract
  created_at: ISOTimestamp
}

type WritebackContract = {
  session_id: ULID
  expected_outputs: Array<{
    type: 'decision' | 'task_update' | 'artifact' | 'open_question'
    description: string
  }>
  writeback_file: string        // ~/twin/sessions/[session_id]-manifest.yaml
  schema_version: '1.0'
}
```

**Side effect on dispatch:** Before returning the brief, the Composer triggers CLAUDE.md regeneration for the target project if it is marked stale. This ensures the generated CLAUDE.md is current when Code or Cowork reads the project folder.

The writeback contract is embedded at the bottom of every brief:

```markdown
---
## Session writeback instructions

Session ID: 01JBQF8X2K
Write your session manifest to:
  ~/twin/sessions/01JBQF8X2K-manifest.yaml

Schema: ~/twin/sessions/writeback-schema.yaml

Expected outputs for this session:
- Decisions made about the data framework
- Tasks created or updated during implementation
- Any new blockers surfaced

When referencing existing tasks in your manifest, use these IDs:
- 01JBQF3A1K: Finalise Q2 pitch structure
- 01JBQF3B2M: Architecture diagram
- 01JBQF3C3N: TCO one-pager for Jakob

---
```

The brief includes an ID-to-title mapping so agents can reference tasks by ID in their manifests.

**Brief formats per target — see section 8.**

---

### Agent 5 — Reconciler

**Purpose:** Turn a session manifest from an external agent into proposed state deltas. Runs automatically when a manifest file appears in `~/twin/sessions/`.

**Trigger:** File watcher detects a new `*-manifest.yaml` in `~/twin/sessions/`.

**Inputs:** Session manifest + original ContextPack for that session_id + current work graph.

**Output:**
```typescript
type ReconcilerOutput = {
  session_id: ULID
  proposed_deltas: DeltaOperation[]
  follow_up_proposals: PrioritiserOutput['proactive_proposals']
  confidence: 'high' | 'medium' | 'low'
  unresolved: Array<{
    item: string
    reason: string
    needs_user_input: boolean
  }>
}
```

**ID resolution strategy:** When a manifest references a task by ID, the Reconciler validates the ID exists in the graph. When a manifest references a task by title only (common when agents don't preserve IDs), the Reconciler:
1. Attempts exact title match in the project
2. If no exact match, attempts fuzzy match (Levenshtein distance ≤ 3, or substring match)
3. If exactly one fuzzy match: proposes it with confidence `medium`
4. If multiple fuzzy matches or no match: adds to `unresolved` with `needs_user_input: true`

**System prompt:**
```
You are Twin Reconciler.

Given a session manifest from an external agent and the original context pack,
extract structured state deltas for the Twin work graph.

Rules:
- Only extract what is explicitly stated in the manifest.
- Cross-reference against the original context pack to detect contradictions.
- Use entity IDs from the original context pack when available.
- If a manifest item is ambiguous, add it to unresolved with needs_user_input: true.
- Propose follow_up_proposals for obvious next actions implied by the session.
- Return ReconcilerOutput JSON only. No prose.
```

User is notified: "Session reconciled — 3 deltas proposed." They review and approve via the same delta review UI used everywhere in Twin.

---

### Agent 5b — Validator

**Purpose:** Check proposed delta operations for correctness before State Updater applies them. No LLM call — rule-based only.

**Checks:**
- Task ID exists in graph before `update_task_status` or `mark_blocked`
- Project slug is valid before any project-scoped operation
- Decision ID is not a duplicate (warn, do not block)
- Delivery ID exists before `update_delivery_status`
- Person name is non-empty before `upsert_person`
- No circular unblocking (task A blocks B blocks A)
- ULID format validation on all ID fields

**Output:** Validated delta list with failed operations flagged with reason. Failed operations are shown to the user — never silently dropped.

---

## 8. The three dispatch targets

All three dispatch flows share the same entry point:

1. User states an objective (typed or selected from Planner suggestions)
2. Planner recommends a target and selects context sources
3. User reviews and confirms (or overrides sources)
4. Composer assembles the ContextPack and brief (triggers CLAUDE.md regen if stale)
5. Brief is shown in preview panel with source list
6. User copies brief (or Twin writes it directly to the project folder's CLAUDE.md)
7. ContextPack is saved to `~/twin/sessions/[session_id]-pack.md`
8. User runs the session in the target agent
9. Agent writes manifest to `~/twin/sessions/[session_id]-manifest.yaml`
10. File watcher triggers Reconciler
11. Reconciler proposes deltas — user reviews and approves

---

### 8.1 Claude Chat — understanding

**When to use:** Working through a problem, evaluating options, learning something, making a decision. No file output expected. Output is a mental state change.

**Brief structure:**

```markdown
## Context for this thinking session
_Session: [session_id] · Scope: project — [project name]_

**Who I am:** [role + expertise, 2 sentences]

**Objective:** [user's stated objective]

## What I already know
[twin_synced notes relevant to this objective — 3-5 bullet summaries]

## Decisions already made
[last 3-5 relevant entries from decisions.md]

## What I'm uncertain about
[open questions from the graph related to this objective, with IDs]

## Key constraints
[from context.md and reference notes]

---
## Session writeback instructions
[writeback contract with entity ID mapping — see section 7, Agent 4]
```

**Writeback — three paths, lowest friction first:**

1. **Clipboard auto-detect (primary):** When the user returns to Twin after a Chat dispatch, Twin checks the clipboard. If it contains text that looks like a conversation (heuristic: multiple speaker turns, or starts with common Chat export patterns), Twin offers a one-click "Import this conversation?" prompt. Clicking it triggers the Resolver extraction flow.

2. **Quick summary (fastest):** A text area in the session panel: "What came out of this session?" The user types 1-3 sentences. The Resolver extracts structured observations from this summary against the session's context pack. Lower fidelity than a full conversation import but takes 15 seconds.

3. **Full conversation import (highest fidelity):** The user opens the import panel, pastes the conversation text, and clicks Extract. The Resolver runs the extraction pass. The review screen shows discrete cards for decisions, tasks, learnings, and open questions. User ticks and confirms. State Updater applies the approved deltas.

Chat sessions do not produce a machine-written manifest — the Resolver handles extraction from human-provided input instead.

---

### 8.2 Claude Code — implementation

**When to use:** Writing code, running scripts, debugging, technical configuration. Output lands in a repository or file system.

**Brief structure:**

```markdown
## Role & expertise
[from global CLAUDE.md]

## Project context
[from context.md — what, who, goal, key constraints]

## Current focus
[twin_visible tasks with status=in_progress or todo, ordered by priority and due date, with IDs]

## Architecture decisions already made
[relevant entries from decisions.md — technical decisions only]

## Open technical questions
[tasks with status=blocked, notes with unanswered questions, with IDs]

## Blocked items
[tasks with waiting_on or blocked_by, with IDs]

## Deliveries in progress
[deliveries with type=spec or type=code, with IDs]

## Pick up here
[one sentence: what to start doing immediately]

---
_Full context available in this folder:_
_tasks.yaml · deliveries.yaml · decisions.md · notes/_

## Session writeback instructions
[writeback contract with entity ID mapping]
```

**Writeback:** Claude Code writes a manifest to `~/twin/sessions/[session_id]-manifest.yaml`. File watcher triggers Reconciler. The Code brief also instructs Claude Code:

```
At the end of this session, append any decisions to decisions.md using this format:
## [date] — [decision title]
_id: [generate a ULID or leave blank for Twin to fill]_

**Decision:** ...
**Rationale:** ...
**Unblocks:** [task ID if applicable]

Then write your full session manifest to the path in the writeback instructions.
Use the entity IDs from the mapping above when referencing tasks.
```

---

### 8.3 Claude Cowork — delivery

**When to use:** Producing a formatted output — a deck, document, report, brief, or communication. Output is a file.

**Brief structure:**

```markdown
## Delivery brief

**What to produce:** [delivery title] — [type]
**What done looks like:** [delivery.brief]
**Due:** [due_date]

## Audience & tone
[from context.md — who is this for, what register, what constraints]

## Source materials
The following notes in this folder are relevant source material.
Read them directly — they contain the thinking behind this delivery.
- notes/2026-03-17-tech-stack-decision.md
- notes/2026-03-16-stakeholder-alignment.md

## Decisions already made
[relevant entries from decisions.md, with IDs]

## Format requirements
[length, structure, format, what to avoid]

## Who I am
[role and relevant expertise]

---
_All source files are in this folder. Read them before starting._
_Save outputs to this folder when complete._

## Session writeback instructions
[writeback contract with entity ID mapping]
```

**Writeback:** File watcher detects new output files (`.docx`, `.pptx`, `.pdf`, `.md`) in the project folder. Twin prompts to link to a delivery and update its status. Cowork also writes a manifest. Reconciler processes both.

---

## 9. The scope and objective model

### Objective-based dispatch (default)

Dispatch begins with an objective, not a file scope. The user types or selects:

```
What do you want to accomplish in this session?

[ _________________________________________________ ]

Suggested by Planner:
  [ Decide the data framework ]
  [ Draft the TCO one-pager ]
  [ Debug the ETL pipeline setup ]
```

The Planner's suggested objectives come from the current work graph — blocked tasks, overdue deliveries, pending decisions. The user types freely or picks a suggestion. The objective drives:
- Which target the Planner recommends (Chat / Code / Cowork)
- Which sources the Composer selects
- What the writeback contract expects

### Scope override (available at any point)

The scope toggle remains available as an explicit override:

| Scope | What the AI receives | Use when |
|---|---|---|
| `me` | Global CLAUDE.md only | Starting something genuinely new; no project context wanted |
| `project` | Global CLAUDE.md + full project context | Working within a known project (most sessions) |
| `note` | Global CLAUDE.md + one specific note | Clean-room conversation on one topic |

Before any dispatch, the user sees a checklist of exactly which entities are included. Individual items can be deselected.

---

## 10. The focus view

The focus view is the landing screen. It answers: what do I actually work on today?

### Components

**Date and state header** — today's date, number of active projects, inbox item count.

**AI priority brief** — generated by the Prioritiser on first open each day, or on demand. Reads all twin-synced notes and tasks across active projects via the work graph. Produces:
- One direct paragraph: the actual state of work right now — specific, names projects, deadlines, blockers
- 2–4 prioritised items with concrete reasoning and a next action each
- Blocked items: named, with who/what is blocking and suggested follow-up
- Overdue or pending decisions: named explicitly

**Proactive proposals panel** — shown below the priority brief when Prioritiser has identified actionable proposals:

```
● Thomas hasn't responded in 3 days (infra cost estimate)
  → Draft follow-up?    [ Draft ] [ Dismiss ]

● Decision made: Polars confirmed
  → 2 tasks can now be unblocked. Apply?    [ Review (2) ] [ Dismiss ]

● Q2 pitch deck due in 2 days — still draft
  → Dispatch to Cowork?    [ Dispatch ] [ Dismiss ]
```

Proposals are never applied without confirmation. Dismissed proposals are not re-shown unless the underlying condition changes.

**Open items list** — all `twin_visible` tasks across active projects, sorted: overdue → due today → high priority → medium priority. Each row shows title, project, due date, status, and if blocked — waiting on whom.

**Inbox badge** — count of unprocessed captures. Clicking opens inbox triage.

### Focus brief prompt

```
You are a thinking partner for a senior consultant. Based on their current work
state, produce a direct, specific priority brief for today.

Today: [weekday, date]

Active projects and tasks (from work graph):
[TaskEntity[] for all active projects, with id, status, due_date, blocked_by, waiting_on]

Active deliveries:
[DeliveryEntity[] for all active projects, with id]

Recent decisions (last 7 days):
[DecisionEntity[] across active projects, with id]

Twin-synced notes (titles and first 200 chars):
[NoteEntity[] where twin_synced=true, most recent first, with id]

Produce PrioritiserOutput JSON.

Rules: be direct. Do not hedge. Prioritise ruthlessly — if not urgent and not
blocked, leave it out.
```

---

## 11. Capture

### Capture strip

Persistent at the bottom of the focus and notes views. Single text area. Placeholder: `Capture a thought, task, or decision… Enter to save`.

**On Enter:**
1. File written to `~/twin/inbox/[timestamp]-[slug].md` immediately
2. Input clears. Green border flash for 500ms.
3. Resolver runs in background (non-blocking)

Nothing blocks the capture. The file is written before any AI processing begins.

### Global keyboard shortcut

`Cmd+Shift+Space` opens a floating capture window from anywhere on the OS. Single input. Enter saves and closes. Project defaults to the most recently active project.

This shortcut is the most important UX feature in the prototype. Without it, capture requires switching to Twin's window, which breaks the habit.

### Resolver interpretation (background)

After the file is written, the Resolver runs against the new capture and the current work graph. Proposed deltas are written back to the inbox file as additional frontmatter. During triage, the user sees the Resolver's interpretation and can accept with one click or adjust.

**If the Resolver API call fails:** The capture is preserved as-is in the inbox. During triage, it appears without AI interpretation — the user classifies it manually. No data is lost.

---

## 12. Inbox triage

Reads all files in `~/twin/inbox/` and presents them chronologically. Goal: clear the inbox in under 2 minutes.

**For each item:**
- Raw capture text (large, readable)
- Resolver's interpretation (if available): type badge, suggested title, suggested project, proposed delta
- If Resolver failed or hasn't run: manual classification controls (project picker, type selector, title field)
- Three actions: `Accept`, `Edit`, `Discard`

**Accept:** File moved to `projects/[slug]/notes/[date]-[slug].md` with full frontmatter. State Updater applies the proposed delta (e.g. appends task to `tasks.yaml`).

**Edit:** Inline form with Resolver interpretation pre-filled (or blank if no interpretation). User adjusts. Confirm moves the file and applies the edited delta.

**Discard:** Deletes the inbox file.

No mandatory triage cadence. The inbox count on the focus view creates ambient pressure without blocking anything.

---

## 13. Conversation import

Accepts any pasted conversation text — Claude Chat, ChatGPT, email threads, Slack exports, anything. Resolver runs the extraction pass. Review screen shows discrete cards. User approves.

### Import flow

1. User opens the import panel ("Import conversation" button in toolbar)
2. Pastes any conversation text
3. Selects target project
4. Clicks Extract
5. Resolver returns a structured extraction
6. Review screen shows cards grouped by type

### Extraction prompt (Resolver mode: conversation import)

```
You are extracting structured information from a conversation transcript to update
a knowledge worker's project context.

Conversation:
[pasted text]

Current work graph context:
[active project's tasks (with IDs), decisions, open questions, people]

Extract only what is clearly present. Do not invent or infer beyond the text.

When referencing existing tasks or entities, use their IDs from the graph context.

Return ResolverOutput JSON with proposed_observations covering:
- decisions made
- tasks created or implied
- blockers mentioned
- open questions raised
- people mentioned

Also return:
- suggested_note_type: chat_learning | meeting | decision
- suggested_note_title: 5 words max
```

### Review screen

```
DECISIONS (2)
☑  Data framework deferred — waiting on cost estimate    [edit]
☑  On-prem inference confirmed                           [edit]

NEW TASKS (1)
☑  Follow up Thomas by Thursday   priority: high   due: 2026-03-20    [edit]

LEARNINGS (3)
☑  H100 cluster: 8 nodes, 40GB memory per node
☑  Cost estimate ready Thursday EOD
☑  Escalation required if Thursday deadline slips
☐  Client uses quarterly planning cycles                 [deselected]

OPEN QUESTIONS (1)
☑  Can cluster be dedicated during peak inference periods?
```

**On confirm:** State Updater creates a `chat_learning` note with the full conversation as collapsible body, appends ticked decisions to `decisions.md`, appends ticked tasks to `tasks.yaml`.

---

## 14. The Twin app — views and navigation

### Sidebar

```
Twin
────────────────
○  Today's focus
○  Inbox  [3]

PROJECTS
●  Municipality platform
○  Internal tooling
○  Personal / meta

+ New project

────────────────
[ me | project | note ]
Scope override

● Twin active
```

### Views

| View | Description |
|---|---|
| Today's focus | Priority brief + proactive proposals + open items across all projects |
| Inbox | Triage view for unprocessed captures |
| Project — notes | Note list for active project, sorted by updated |
| Project — tasks | Task list, filterable by status |
| Project — deliveries | Delivery list with status and due dates |
| Note editor | Markdown editor left, scoped chat assistant right |
| Conversation note | Structured form: people picker, discussed/agreed/questions |
| Dispatch | Objective input → Planner recommendation → Composer preview → send |
| Import | Paste conversation → Resolver extraction → review → confirm |
| Sessions | History of dispatched sessions and their reconciliation status |
| Settings | Global context editor, keyboard shortcut config, people management |

### Note editor

Split view. Left: markdown textarea with title, type selector, twin toggle, linked delivery picker. Right: scoped chat assistant grounded in the current note and project context.

The chat assistant in the note editor uses the Composer to build its context pack: global CLAUDE.md + current note + project context at `project` scope. Conversations are ephemeral — they do not auto-write back. The user can select any assistant message and "save to note" to append it.

### Conversation note UI

When type is set to `conversation`, the left pane switches to a structured form:

```
People:  [ Thomas × ]  [ + Add person ▾ ]
Date:    [ 2026-03-17 ]

What did you discuss?
[ _____________________________________________ ]

What was agreed or decided?
[ _____________________________________________ ]
☑ Append agreed items to decisions.md

Open questions?
[ _____________________________________________ ]
```

Fields map to the three markdown sections in the file. Compact by design — discussion and agreed fields are 3–5 lines each.

### Dispatch view

```
What do you want to accomplish?
[ Decide the data framework for the municipality pitch         ]

Planner recommends:  Claude Chat
Suggested sources:   4 items  [ review ]

  ☑ context.md — Municipality platform
  ☑ notes/2026-03-17-tech-stack-decision.md
  ☑ decisions.md (last 5 entries)
  ☑ tasks.yaml — blocked items only
  ☐ notes/2026-03-14-meeting-jakob.md  (deselected)

[ Chat ]  [ Code ]  [ Cowork ]   ← override Planner recommendation

[ Generate brief ]
```

After generating, the brief is shown in a preview panel. The user copies it and opens Claude Chat, or Twin writes it to the project folder's CLAUDE.md and the user points Code/Cowork at the folder.

---

## 15. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| App shell | Tauri 2.x | Native macOS/Windows, full filesystem access, 3–8MB bundle |
| Frontend | React 18 + TypeScript + Vite | Fast dev cycle, strong typing |
| Styling | Tailwind CSS (core utilities) | Rapid iteration |
| Frontmatter parsing | `gray-matter` | Battle-tested YAML frontmatter parser |
| YAML parsing | `yaml` (eemeli/yaml) | Full YAML 1.2 support, round-trip preservation |
| Markdown rendering | `marked` | Lightweight, no dependencies |
| AI calls | `@anthropic-ai/sdk` | Official SDK, streaming support |
| IDs | `ulid` | Sortable by creation time |
| Fuzzy matching | `fuse.js` | For Reconciler task-title fallback matching |
| File watching | Tauri `watch` plugin | Detects agent writebacks |
| Global shortcut | Tauri `global-shortcut` plugin | OS-level hook |
| Filesystem | Tauri `fs` plugin | Read/write `~/twin/` |

### No backend, no database

All data lives in `~/twin/`. The only network calls are to the Anthropic API. No auth, no sync service, no database process.

### The `fs.ts` layer

All filesystem operations go through one module. Components never call Tauri's `fs` plugin directly. This is the single seam for any future change to storage.

```typescript
export const fs = {
  // Projects
  listProjects(): Promise<ProjectEntity[]>
  readProject(slug: string): Promise<ProjectEntity>

  // Notes
  listNotes(projectSlug: string): Promise<NoteEntity[]>   // frontmatter only
  readNote(projectSlug: string, filename: string): Promise<Note>
  writeNote(note: Note): Promise<void>
  moveNote(from: string, to: string): Promise<void>

  // Inbox
  listInbox(): Promise<InboxItem[]>
  writeInbox(item: InboxItem): Promise<void>
  clearInbox(filename: string): Promise<void>

  // Structured files (YAML)
  readTasks(projectSlug: string): Promise<TaskEntity[]>
  writeTasks(projectSlug: string, tasks: TaskEntity[]): Promise<void>
  readDeliveries(projectSlug: string): Promise<DeliveryEntity[]>
  writeDeliveries(projectSlug: string, deliveries: DeliveryEntity[]): Promise<void>
  readPeople(): Promise<PersonEntity[]>
  writePeople(people: PersonEntity[]): Promise<void>

  // Decisions (append-only markdown)
  readDecisions(projectSlug: string): Promise<DecisionEntity[]>
  appendDecision(projectSlug: string, entry: DecisionEntity): Promise<void>

  // Generated files
  writeProjectCLAUDE(projectSlug: string, content: string): Promise<void>
  writeGlobalCLAUDE(content: string): Promise<void>

  // Sessions
  writeSessionPack(pack: ContextPack): Promise<void>
  readSessionManifest(sessionId: ULID): Promise<SessionManifest>
  listSessions(limit?: number): Promise<SessionEntity[]>

  // File metadata
  getMtime(path: string): Promise<number>
}
```

---

## 16. TypeScript types

```typescript
// Primitives
type ULID = string
type ISODate = string         // "2026-03-17"
type ISOTimestamp = string    // "2026-03-17T14:22:00"

type NoteType =
  | 'thought' | 'meeting' | 'decision'
  | 'reference' | 'chat_learning' | 'conversation'

type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
type DeliveryType = 'deck' | 'doc' | 'spec' | 'code' | 'report' | 'email' | 'other'
type DeliveryStatus = 'draft' | 'in_review' | 'delivered' | 'archived'
type DispatchTarget = 'chat' | 'code' | 'cowork'
type DispatchScope = 'me' | 'project' | 'note'
type Confidence = 'high' | 'medium' | 'low'

// Work graph (see section 6 for full entity definitions)
type WorkGraph = {
  entities: WorkGraphEntity[]
  relationships: Array<{
    from: { kind: WorkGraphEntity['kind']; id: ULID }
    to:   { kind: WorkGraphEntity['kind']; id: ULID }
    type: 'blocks' | 'unblocks' | 'informs' | 'produces' | 'involves' | 'belongs_to'
  }>
  built_at: number
  file_mtimes: Record<string, number>  // path → mtime, for conflict detection
}

// Delta operations (see section 6 for full definition)
// (DeltaOperation union type — 12 variants, all referencing entities by ULID)

// Agent outputs (see section 7 for full definitions)
type ResolverOutput = { ... }
type PlannerOutput = { ... }
type PrioritiserOutput = { ... }
type ReconcilerOutput = { ... }

// Session types
type ContextPack = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string
  selected_sources: EntityRef[]
  entity_id_map: Record<ULID, string>  // id → title, included in brief for agents
  writeback_contract: WritebackContract
  created_at: ISOTimestamp
}

type WritebackContract = {
  session_id: ULID
  expected_outputs: Array<{
    type: 'decision' | 'task_update' | 'artifact' | 'open_question'
    description: string
  }>
  writeback_file: string
  schema_version: '1.0'
}

type SessionManifest = {
  session_id: ULID
  summary: string
  target: DispatchTarget
  decisions: Array<{
    title: string
    decision: string
    rationale?: string
    unblocks?: ULID
  }>
  tasks_created: Array<{
    title: string
    priority: 'high' | 'medium' | 'low'
    due_date?: ISODate
    waiting_on?: string
  }>
  tasks_updated: Array<{
    id?: ULID                   // preferred — use if available
    title?: string              // fallback — Reconciler fuzzy-matches
    status: TaskStatus
    blocked_by?: string
    waiting_on?: string
  }>
  artifacts: Array<{
    path: string
    delivery_id?: ULID
    description: string
  }>
  open_questions: Array<{
    id?: ULID
    question: string
  }>
  blockers: Array<{
    title: string
    blocked_by: string
    waiting_on?: string
  }>
  confidence: Confidence
}

// Note types
type Note = {
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

type InboxItem = {
  filename: string
  captured: ISOTimestamp
  raw: string
  resolver_output?: ResolverOutput
  resolver_error?: string           // if API call failed, store reason
}

type ConversationNote = Note & {
  type: 'conversation'
  people: string[]
  date: ISODate
  discussed: string
  agreed: string
  open_questions: string
}
```

---

## 17. CLAUDE.md generation

Twin marks a project's CLAUDE.md as **stale** whenever any of the following changes:
- A task status changes
- A delivery status changes
- A new decision is appended
- A note is marked twin_synced
- User explicitly triggers regeneration

**Regeneration happens only when needed** — on dispatch (the Composer triggers it if the project is stale) or on explicit user request. This avoids wasteful API calls during active editing sessions.

### Generation prompt

```
Given the following project files, generate a concise, structured CLAUDE.md brief
for an AI agent session. The brief tells an agent what it needs to know to start
working on this project without asking clarifying questions.

context.md:
[full content]

tasks.yaml:
[full content — IDs visible for cross-reference]

deliveries.yaml:
[full content]

decisions.md (last 5 entries):
[last 5 entries]

Twin-synced notes (title + first 200 chars):
[NoteEntity[] where twin_synced=true]

Generate using exactly this structure:
# Project context — [name]
_Generated by Twin · [date]_

## Project overview
## Current focus
## Open decisions
## Blocked items  (include task IDs in parentheses)
## Deliveries in progress  [table]
## Key constraints
## Pick up here

End with:
---
_Source files: context.md · tasks.yaml · deliveries.yaml · decisions.md · notes/_
_Do not edit this file — it is regenerated by Twin._
_Append decisions to decisions.md. Edit tasks in tasks.yaml._
```

---

## 18. Error handling and degraded states

Twin is designed to run all day. Errors will happen. The principle: **surface the problem, preserve the data, continue operating.**

### API failures

| Scenario | Behaviour |
|---|---|
| Resolver API call fails during capture | Capture is preserved in inbox without AI interpretation. Triage shows manual classification controls. |
| Resolver API call fails during import | Import panel shows "AI extraction unavailable — try again or classify manually." User can retry or manually create notes/tasks. |
| Planner API call fails on dispatch | "Could not generate recommendation — select target and sources manually." Dispatch view switches to manual mode. |
| Prioritiser API call fails on focus load | Focus view shows the open items list (data-driven, no API needed) without the AI brief. "Priority brief unavailable — tap to retry." |
| Composer API call fails | "Could not generate brief — try again." The user retries or writes the brief manually. |
| CLAUDE.md generation fails | The stale flag remains set. On next dispatch, generation is retried. If it fails again, the last good CLAUDE.md is used with a warning: "Project brief may be outdated." |
| Rate limit (429) | Retry with backoff (1s, 4s, 16s). If still failing after 3 retries, surface the error. Other non-API features continue working. |

### File system errors

| Scenario | Behaviour |
|---|---|
| `tasks.yaml` has invalid YAML | Graph construction skips this file with a warning: "Could not parse tasks.yaml for [project] — fix the file or restore from git." Affected project shows a warning badge in sidebar. |
| Note frontmatter is malformed | Note appears in the list with a warning icon. Body is still readable. Frontmatter fields default to null/empty. |
| Manifest references unknown session ID | Reconciler adds to `unresolved`: "Unknown session — was this manifest written for a different Twin instance?" |
| External tool deletes a file Twin is watching | Graph removes the entity. If a pending delta references it, the delta fails with "Target entity no longer exists." |
| File write conflict (external edit during State Updater write) | See State Updater concurrency control in section 7, Agent 2. |

### Graph construction failures

If `buildGraph()` fails partially (some files unparseable), Twin:
1. Builds the graph from the files it can parse
2. Logs the failures
3. Shows a notification: "N files could not be parsed — some data may be missing"
4. Adds warning badges to affected projects in the sidebar

Twin never refuses to start because of parse errors. Partial data is better than no data.

---

## 19. MVP feature list

### Must have — prototype gates

| Feature | Why it's required |
|---|---|
| `~/twin/` folder scaffold on first launch | Foundation for everything |
| Work graph construction from YAML and markdown files | All internal agents operate over this |
| State Updater + Validator with concurrency control | Safe, traceable writes to canonical files |
| Resolver — capture and import pipeline | Makes sparse input intelligent |
| Planner — objective-based dispatch | Core of the agentic claim |
| Prioritiser — focus brief and proactive proposals | Daily value proposition |
| Composer — context pack generation with ID mapping | Consistent, traceable briefs |
| Reconciler — session manifest processing with fuzzy ID resolution | Closes the writeback loop |
| Global keyboard shortcut (`Cmd+Shift+Space`) | Without it capture friction kills the habit |
| Capture strip + inbox file creation | Core capture mechanic |
| Inbox triage view with Resolver proposals + manual fallback | Where captures become structured data |
| Conversation import — paste + extract + review | Chat sessions produce persistent context |
| Chat writeback — quick summary + clipboard auto-detect | Reduces Chat loop friction |
| Conversation note type + structured UI | Captures human conversation context |
| People model (`people.yaml`) + picker | Required for conversation notes |
| Project CRUD + folder creation | Context boundary for everything |
| Note editor with frontmatter controls | Primary surface for longer thinking |
| Twin toggle per note | Explicit context opt-in |
| Task list read/write per project (YAML) | Required for Planner to reason about priority |
| Delivery list read/write per project (YAML) | Gives tasks a "why" |
| Decisions log append | Closes the writeback loop |
| Focus view with priority brief + proactive proposals | Core value proposition |
| Objective input at dispatch start | Replaces scope-first as primary dispatch driver |
| Dispatch to Chat — ContextPack + copy | Validates Chat dispatch flow |
| Dispatch to Code — ContextPack + write to folder | Validates Code dispatch flow |
| Dispatch to Cowork — ContextPack + write to folder | Validates Cowork dispatch flow |
| Session pack saved to `sessions/` | Traceability — what was sent |
| Session manifest detection + Reconciler | Closes Code and Cowork loops |
| CLAUDE.md generation per project (on dispatch) | The filesystem integration |
| File watcher for agent writebacks | Detects manifests and output files |
| Snapshot history (last 10 sessions) | Re-use and review past sessions |
| Writeback schema (`writeback-schema.yaml`) | Agents need this to write manifests |
| Error handling — API failures with graceful degradation | Tool must survive bad network days |
| Token usage counter | Cost visibility |

### Nice to have

| Feature | Notes |
|---|---|
| Scope override toggle | Advanced feature — objective-based is the default |
| Decisions log view in UI | Currently append-only via writeback |
| Note-to-delivery linking UI | Via frontmatter, but UI makes it easier |
| Auto-generated note titles | From first sentence of body |
| Git init on folder creation | Free version history |
| Context.md editor in UI | Currently edited manually or by Cowork |
| Sessions view with reconciliation status | Useful for debugging |
| Dark mode | CSS variables already support it |

### Explicitly out of scope

- Non-Claude agents (Cursor, ChatGPT, Notion AI, etc.)
- Governance or privacy modes
- Workspace / repository linking
- Team or shared twins
- Calendar integration
- Passive screen or audio capture
- Mobile app
- Authentication or cloud sync
- Rich text editor — markdown textarea only
- Notifications or scheduled reminders

---

## 20. Build order

Build in this sequence. Each step has a gate — a test you run before proceeding. Do not skip ahead.

### Phase 1 — Foundation (week 1)

#### Step 1 — Tauri shell + folder scaffold (~4h)

Bootstrap the Tauri app. On first launch, create `~/twin/` with:
- `CLAUDE.md` (template)
- `people.yaml` (empty)
- `inbox/`
- `sessions/` + `writeback-schema.yaml`
- `projects/` + one seed project with all required files pre-populated (YAML format)

Write `fs.ts` with basic read/write functions for all file types. YAML parsing via `eemeli/yaml`. Frontmatter parsing via `gray-matter`.

**Gate:** Can the app read a task from `tasks.yaml` and a note from the filesystem, and log their parsed content with correct types and IDs?

---

#### Step 2 — Work graph construction (~6h)

Write `buildGraph()`. Parse all file types into typed entities with ULIDs. Derive relationships from ID references. Store file mtimes for conflict detection. Log the graph to console. No UI yet.

**Gate:** Does the graph correctly represent the seed project's tasks, decisions, deliveries, and people as typed entities with relationships between them? Are IDs consistent across entity references?

---

#### Step 3 — State Updater + Validator (~6h)

Write the delta operation types (all ID-based). Write the Validator — rule checks including ULID format validation, no LLM. Write the State Updater with mtime-based conflict detection — one function per operation type. No UI yet.

**Gate:** Apply a `create_task` delta — does the new entry appear in `tasks.yaml` with a generated ULID? Apply `mark_blocked` by task ID — do the correct fields update? Does Validator correctly reject `mark_unblocked` on a task that isn't blocked? Does the State Updater detect and surface a simulated external edit?

---

### Phase 2 — AI agents + capture (week 2)

#### Step 4 — Resolver agent (~6h)

Wire the Resolver prompt against the Anthropic API with retry logic and error handling. Test against 10 real captures. Evaluate categorical confidence calibration. Build the delta review UI: observation cards with evidence quotes, accept/edit/discard. Build manual classification fallback for when API fails.

**Gate:** Paste a real capture. Does Resolver correctly identify it as task or blocker? Is the proposed delta right with correct entity ID references? Does the review screen make errors easy to correct? Does a simulated API failure fall back to manual classification gracefully?

---

#### Step 5 — Capture + inbox (~4h)

Global keyboard shortcut. Capture strip writes to `inbox/`. Resolver runs in background. Inbox triage view uses Resolver output when available, manual controls when not.

**Gate:** Capture from another app in under 5 seconds. Triage 5 items in under 2 minutes using Resolver proposals.

---

#### Step 6 — Project sidebar + task / delivery / note views (~6h)

Read `~/twin/projects/` directory. Render project names in sidebar. Note list per project. Task list from YAML — inline status editing writes via State Updater. Delivery list from YAML — same.

**Gate:** Edit a task status in the UI. Does `tasks.yaml` update correctly via State Updater? Does the graph re-derive? Do IDs remain stable through the edit?

---

### Phase 3 — Planning + dispatch (week 3)

#### Step 7 — Planner + Prioritiser + focus view (~8h)

Wire the Planner (action recommendation). Wire the Prioritiser (daily brief + proactive proposals). Focus view calls Prioritiser on load. Render priority brief and proactive proposals panel. Proposals are dismissible. Planner provides objective suggestions for dispatch. Token counter visible in UI.

**Gate:** Does the Prioritiser correctly identify the most urgent item? Does it surface a proactive proposal when a task has been waiting on someone for 2+ days? Does the Planner recommend the right dispatch target for "decide the data framework"? Does a Prioritiser API failure still show the data-driven open items list?

---

#### Step 8 — Composer + dispatch view (~6h)

Objective input. Composer assembles ContextPack with entity ID mapping. Brief preview with source checklist. Copy button. Pack saved to `~/twin/sessions/`. Write project CLAUDE.md for Code and Cowork dispatches (triggers regen if stale).

**Gate:** State objective "decide the data framework." Does Composer select the right sources? Does the brief include an ID-to-title mapping? Is the brief useful when pasted into Claude Chat without further explanation?

---

#### Step 9 — Session manifests + Reconciler (~6h)

File watcher detects `*-manifest.yaml` files. Reconciler processes them with fuzzy ID resolution. Delta review UI reused from Resolver. State Updater applies approved deltas.

**Gate:** Manually write a manifest file matching the schema — one entry with correct task ID, one with title only. Does Reconciler parse both and propose the right deltas? Does the title-only entry get fuzzy-matched correctly? Do the deltas apply cleanly?

---

### Phase 4 — Conversation + polish (week 4)

#### Step 10 — Conversation notes + people model (~4h)

`people.yaml` read/write via `fs.ts`. People picker component. Conversation note UI: three text areas, people picker, agreed→decisions checkbox. On save, write file and optionally append to `decisions.md` with generated ULID.

**Gate:** Record a 3-minute conversation in under 2 minutes. Does it appear in the project notes folder with correct frontmatter and correct entries in `decisions.md` with IDs?

---

#### Step 11 — Conversation import + Chat writeback (~6h)

Import panel: large textarea, project selector, Extract button. Resolver extraction call (conversation import mode). Review screen: cards by type. Confirm applies deltas via State Updater.

Chat writeback paths: clipboard auto-detect prompt, quick summary text area in session panel.

**Gate:** Paste a 20-message Claude Chat conversation. Are the extracted decisions and tasks accurate with correct entity references? Can you review and confirm in under 90 seconds? Does the quick summary path work in under 30 seconds?

---

#### Step 12 — Note editor + chat assistant (~4h)

Full note editor with frontmatter controls. Chat pane using Composer for context pack. "Save to note" from assistant messages.

**Gate:** Open a note. Does the chat assistant know the project context without being told?

---

#### Step 13 — CLAUDE.md generation (~3h)

Wire the generation prompt. Trigger on dispatch (when stale) and on explicit request. Write to project folder.

**Gate:** Mark CLAUDE.md as stale. Dispatch a session. Does CLAUDE.md regenerate before the brief is assembled, with correct entity IDs in the output?

---

#### Step 14 — Error handling audit + edge cases (~4h)

Systematically test every error scenario from section 18. Simulate API failures, malformed files, concurrent edits, unknown entity references. Verify graceful degradation in each case.

**Gate:** Does Twin survive a full day of use with the API key temporarily revoked? Does it recover cleanly when the key is restored?

---

#### Step 15 — Real-world test day (day)

Use Twin for a full working day. Capture everything with `Cmd+Shift+Space`. Run focus brief in the morning. Dispatch to Chat, Code, and Cowork at least once each. Write a manifest after Code and Cowork sessions. Test the Chat quick-summary writeback. Note what fails, what is missing, what is better than expected. Do not fix anything during the test day — write all observations as inbox captures.

---

## 21. Definition of done

The prototype is complete when all of the following are true:

1. You open Twin on Monday morning and the priority brief tells you what to work on — without opening any other tool first.
2. You capture a thought from another app in under 5 seconds using `Cmd+Shift+Space`.
3. You clear a 5-item inbox in under 2 minutes using Resolver proposals.
4. You dispatch a Code session. The brief includes entity IDs and is useful — Claude Code starts working without asking clarifying questions.
5. You dispatch a Cowork session. You point Cowork at `~/twin/projects/[slug]/` and it produces a useful first draft from the notes already in that folder.
6. You dispatch a Chat session and have a conversation that doesn't require re-explaining your situation.
7. After a Chat session, you use the quick summary to write back in under 30 seconds, or paste the full conversation and approve extracted items in under 90 seconds.
8. After a Claude Code session, you write a manifest and Twin's Reconciler proposes the correct deltas in under 60 seconds of review. Task references resolve by ID.
9. After a Cowork session, Twin detects the output file and offers to update the delivery status correctly.
10. You record a colleague conversation as a conversation note in under 2 minutes and the agreed items appear in `decisions.md` with stable IDs.
11. The Prioritiser surfaces at least one accurate proactive proposal during the test day — something it noticed that you had not consciously flagged.
12. The work graph reflects the current state of your active project without you having manually updated any file — the graph was built from files that agents and Twin wrote.
13. Every change to a canonical file is traceable to a specific delta operation with entity IDs and a source.
14. All data survives quitting and reopening the app — everything is in files.
15. You could hand a colleague your `~/twin/projects/[slug]/` folder and they would have enough context to continue the work.
16. An API outage does not prevent you from capturing, triaging, or manually editing tasks and notes. Twin degrades gracefully.

---

## 22. Open questions

| Question | Options | Recommendation |
|---|---|---|
| How does the Chat brief get into Claude Chat? | Clipboard copy / browser extension pre-fill | Clipboard for v1. Investigate Claude Desktop system prompt injection for v2. |
| Should Resolver run synchronously on capture or always async? | Sync (blocks capture) / Async (capture first, interpret after) | Always async. Never block the capture. |
| How to handle a manifest that references tasks not in the graph? | Reject / Add to unresolved / Create the task | Fuzzy-match by title first. If no match, add to unresolved with `needs_user_input: true`. |
| Should Prioritiser proactive proposals have an expiry? | No expiry / expire after N days / expire after condition changes | Expire when the underlying condition changes. Re-show if it recurs. |
| Should captures auto-assign to active project or always go to inbox? | Always inbox / default to active project | Default to active project. Inbox for captures when no project is active. |
| Should decisions.md be parsed by Twin for display, or append-only? | Parse for structured display / append-only | Append-only for v1. Parsing adds complexity with minimal benefit. |
| Scope of the Prioritiser's proactive proposals — per-project or global? | Per active project / across all active projects | Across all active projects — cross-project awareness is the Prioritiser's main value. |
| How should Twin handle ULID generation for entities created by agents? | Agent generates / Twin generates on import / Both allowed | Twin generates on import. Agents can include IDs but Twin treats them as suggestions and may reassign. |
| What is the maximum token budget per API call? | Fixed limit / model-dependent / user-configurable | Model-dependent defaults (e.g., 4K output for Resolver, 2K for Planner). User-configurable in v2. |
| Should the writeback schema include a human-readable task list? | IDs only / IDs + titles / full task details | IDs + titles (the entity_id_map). Full details bloat the manifest unnecessarily. |

---

## 23. Success metrics

Qualitative for v1. No analytics, no dashboards. Evaluate after 2 weeks of real use.

**Daily habit formation:** Do you open Twin before anything else in the morning? If yes within 2 weeks, the focus brief earns its place.

**Capture consistency:** Is the inbox never more than 10 items? If yes, the shortcut and capture strip are frictionless enough.

**Dispatch quality:** After dispatching to Code or Cowork, count how many clarifying questions the agent asks that Twin's brief should have answered. These should approach zero as the Composer and brief formats are refined.

**Reconciler accuracy:** Of the deltas the Reconciler proposes after a session, what fraction do you accept without editing? Target above 80% after the first week. Track ID-based vs fuzzy-matched resolutions separately — ID-based should be near 100%.

**Chat writeback adoption:** What fraction of Chat sessions get written back via any path (quick summary, clipboard, or full import)? Target above 70%. If below 50%, the friction is still too high.

**Proactive proposal accuracy:** Of the Prioritiser's proactive proposals, what fraction are genuinely useful (you would have wanted to know)? Target above 70%.

**Context leak reduction:** Are you re-explaining your situation to Claude less often than before? Informal yes/no after 2 weeks validates or invalidates the core hypothesis.

**Model currency:** At any moment, does `~/twin/projects/[slug]/CLAUDE.md` accurately describe the current project state without you having manually updated it? If yes, the writeback loops are working.

**API cost:** What is the daily token spend during normal use? Track this from week 1 to establish a baseline and identify any runaway patterns early.

---

*End of spec v1.0*
*Revised from v0.4 based on architectural review (2026-03-23)*
*Key changes: ULID identity on all entities, YAML for structured data, categorical confidence, Planner/Prioritiser split, Chat writeback improvements, error handling, realistic build timeline*
*Next step: `tauri create twin && mkdir ~/twin && implement fs.ts && buildGraph()`*
