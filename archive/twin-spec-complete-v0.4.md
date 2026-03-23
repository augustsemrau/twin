# Twin — Complete Prototype Specification
**Version:** 0.4  
**Date:** 2026-03-17  
**Status:** Pre-build  
**Architecture:** Filesystem-canonical, graph-derived, Tauri desktop app  

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
18. MVP feature list
19. Build order
20. Definition of done
21. Open questions
22. Success metrics

---

## 1. What this document is

This spec defines the first working prototype of Twin — a personal context engine and agent orchestration layer for knowledge workers. The prototype's goal is not to be feature-complete. It is to validate one core hypothesis:

> **If Twin maintains a live, structured model of a user's work state and routes work to Claude Chat, Claude Code, and Claude Cowork through typed context packs and structured writeback contracts, those sessions will be meaningfully better — with near-zero overhead from the user.**

Everything in this spec is in service of testing that hypothesis. Features that don't directly test it are out of scope for v1.

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
Markdown files in `~/twin/` are the durable source of truth. Twin maintains a derived work graph in memory, built by parsing those files on launch and kept current by file watchers. The graph is never persisted separately — if lost, it is rebuilt from files in under 200ms. Any text editor, any agent, and any future tool can read and write the canonical state without Twin being present.

**Twin proposes actions, not just summaries.**  
Every output from Twin answers "what happens next?" not just "what is the current state?" A focus brief ends with prioritised next actions. A dispatch includes a writeback contract. A reconciliation produces proposed deltas, not a summary of what happened.

**All autonomous updates are expressed as structured deltas.**  
Twin never applies freeform mutations to canonical files. Every change — whether proposed by an internal agent or received from an external one — is expressed as a typed delta operation (`create_task`, `append_decision`, `mark_unblocked`, etc.) that Twin validates before applying. Every change is inspectable and reversible.

**External agents never mutate canonical state directly.**  
Claude Code and Cowork write outputs to the project folder. They do not edit `tasks.md` or `decisions.md` directly. Instead, they emit a session manifest file that Twin reads, validates, and applies as deltas. Canonical state stays under Twin's control.

**Context is objective-based, files are the override.**  
When the user dispatches a session, they state an objective. Twin's Planner assembles the minimal sufficient context pack automatically. The user can inspect and override selected sources, but does not have to think about file scopes by default.

**Autonomy is explicit, bounded, and inspectable.**  
Twin takes no autonomous action the user has not seen proposed. Proactive behaviours — drafting a follow-up, proposing downstream task updates after a decision — are always shown as proposals before being applied. No silent writes to canonical state.

**Capture must be near-zero friction.**  
If adding something to Twin takes more than 5 seconds, the habit breaks and the model goes stale. Capture is always one keystroke away from anywhere on the OS.

**The folder is the integration.**  
Claude Code and Cowork are pointed at `~/twin/projects/[slug]/`. No API integration required. The filesystem is the contract between Twin and every agent it dispatches to.

---

## 4. The folder structure

```
~/twin/
├── CLAUDE.md                              # Global context — role, expertise, style
├── people.md                              # Lightweight people model
│
├── inbox/                                 # Unprocessed captures, one file each
│   ├── 2026-03-17T09-14-thomas.md
│   └── 2026-03-17T11-02-polars.md
│
├── sessions/                              # One pair of files per dispatch session
│   ├── writeback-schema.yaml              # Schema agents use for manifests
│   ├── 2026-03-17T14-22-build-001-pack.md        # Context pack sent to agent
│   └── 2026-03-17T14-22-build-001-manifest.yaml  # Writeback from agent
│
└── projects/
    ├── municipality-platform/
    │   ├── CLAUDE.md                      # Project brief — generated by Twin
    │   ├── context.md                     # Background: client, goal, constraints
    │   ├── tasks.md                       # Task table with status and deadlines
    │   ├── deliveries.md                  # Delivery tracker
    │   ├── decisions.md                   # Append-only decision log
    │   └── notes/
    │       ├── 2026-03-17-tech-stack-decision.md
    │       ├── 2026-03-16-stakeholder-alignment.md
    │       └── 2026-03-14-meeting-jakob.md
    │
    └── internal-tooling/
        ├── CLAUDE.md
        ├── context.md
        ├── tasks.md
        ├── deliveries.md
        ├── decisions.md
        └── notes/
```

### Why this structure works for agents

When you point Claude Code at `~/twin/projects/municipality-platform/`, it reads `CLAUDE.md` (the generated brief), `tasks.md` (what is in flight and blocked), `decisions.md` (what has been decided), and `notes/` (the thinking behind everything). It does not need to be told what to read. The filenames and structure are self-describing.

When you point Cowork at the same folder, it reads the same files and produces different outputs — because it is a different agent with a different mandate, not because the context is different.

Git version control is free. Run `git init ~/twin/` and you get full history of every note, decision, and context change.

---

## 5. File formats

### 5.1 Note files (`notes/YYYY-MM-DD-[slug].md`)

Every note is a standalone markdown file with YAML frontmatter. The frontmatter is kept minimal — only what Twin needs to build the work graph without parsing the full body. The body is for humans and agents to read directly.

```markdown
---
title: Tech stack decision
type: thought
project: municipality-platform
twin_synced: true
linked_delivery: q2-pitch-deck
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
| `title` | string | Display title. Auto-generated from first line if absent. |
| `type` | enum | `thought \| meeting \| decision \| reference \| chat_learning \| conversation` |
| `project` | string | Project slug. Absent if note is in inbox. |
| `twin_synced` | bool | Include in AI context and work graph. Default `true`. |
| `linked_delivery` | string? | Delivery slug this note informs. Optional. |
| `people` | string[]? | Names — for conversation notes. Looked up in `people.md`. |
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

### 5.4 Tasks (`projects/[slug]/tasks.md`)

```markdown
# Tasks — municipality-platform

| Title | Status | Priority | Due | Blocked by | Waiting on |
|---|---|---|---|---|---|
| Finalise Q2 pitch structure | in_progress | high | 2026-03-21 | | |
| Architecture diagram | blocked | high | 2026-03-21 | Infra cost estimate | Thomas |
| TCO one-pager for Jakob | todo | high | 2026-03-18 | | |
| Stakeholder alignment doc | todo | medium | 2026-03-25 | | |
| Set up Polars dev environment | todo | low | | | |

_Status: todo | in_progress | blocked | done_
_Updated: 2026-03-17_
```

---

### 5.5 Deliveries (`projects/[slug]/deliveries.md`)

```markdown
# Deliveries — municipality-platform

| Title | Slug | Type | Status | Due | Brief |
|---|---|---|---|---|---|
| Q2 pitch deck | q2-pitch-deck | deck | in_progress | 2026-03-21 | Architecture proposal, 3 options, risk section |
| TCO one-pager | tco-one-pager | doc | draft | 2026-03-18 | Single-page TCO comparison for Jakob |
| Tech stack ADR | tech-stack-adr | doc | draft | 2026-03-25 | Architecture decision record for Polars + DuckDB |

_Type: deck | doc | spec | code | report | email | other_
_Status: draft | in_review | delivered | archived_
_Updated: 2026-03-17_
```

---

### 5.6 Decisions log (`projects/[slug]/decisions.md`)

Append-only. Never edited, only extended. Both humans and agents append here.

```markdown
# Decisions — municipality-platform

## 2026-03-17 — Data framework decision deferred

**Decision:** No final decision on Polars vs Spark yet.  
**Rationale:** Blocked on infra cost estimate from Thomas. Decide by Friday EOD.  
**Unblocks:** Architecture diagram, Q2 pitch section 2.  
**Decided by:** August  

---

## 2026-03-14 — On-premise inference confirmed

**Decision:** All LLM inference will run on-prem on the client's H100 cluster.  
**Rationale:** Client data governance policy prohibits cloud inference.  
**Unblocks:** Infrastructure cost modelling, vendor selection.  
**Decided by:** August + client IT team  

---
```

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

Generated and maintained by Twin. Regenerated whenever the underlying files change significantly (debounced, 30 seconds after last change). Do not edit directly.

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
- Architecture diagram — waiting on Thomas (infra cost estimate, expected Thursday EOD)

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
_Source files: context.md · tasks.md · deliveries.md · decisions.md · notes/_  
_Do not edit this file — it is regenerated by Twin._  
_Append decisions to decisions.md. Edit tasks in tasks.md._
```

---

### 5.9 People (`~/twin/people.md`)

Global, lightweight. Not a CRM — just enough for Twin to reason about who is involved in what.

```markdown
# People

| Name | Role | Projects | Notes |
|---|---|---|---|
| Thomas | Infrastructure lead | municipality-platform | Client-side, key technical contact |
| Jakob | IT Director | municipality-platform | Client stakeholder, risk-averse, vendor lock-in concern |
| Rasmus | Consultant | municipality-platform, internal-tooling | Trustworks colleague, reviews exec summaries |
```

**How Twin uses people.md:**
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

session_id: string            # from the brief you received
summary: string               # 2-3 sentences: what happened
target: chat | code | cowork

decisions:
  - title: string
    decision: string
    rationale: string         # optional
    unblocks: string          # optional — task title this decision unblocks

tasks_created:
  - title: string
    priority: high | medium | low
    due_date: YYYY-MM-DD      # optional
    waiting_on: string        # optional

tasks_updated:
  - title: string             # must match existing task title exactly
    status: todo | in_progress | blocked | done
    blocked_by: string        # optional
    waiting_on: string        # optional

artifacts:
  - path: string              # relative to project folder
    delivery_slug: string     # optional
    description: string

open_questions:
  - string

blockers:
  - title: string
    blocked_by: string
    waiting_on: string        # optional

confidence: 0.0–1.0
```

---

## 6. The work graph

The work graph is Twin's in-memory, derived representation of the project state. It is built by parsing the canonical markdown files on launch and updated incrementally as files change. It is never persisted separately — if lost, it is rebuilt from files.

The graph exists because reasoning over typed entities and typed relationships is more reliable than reasoning over raw markdown text. The internal agents operate over the graph, not over file contents directly.

### Typed entities

```typescript
type EntityRef = {
  file: string        // relative path from ~/twin/
  line?: number       // line number for table rows
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
  title: string
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  priority: 'high' | 'medium' | 'low'
  due_date: string | null
  blocked_by: string | null
  waiting_on: string | null
  project: string
  delivery: string | null
  ref: EntityRef
}

type DeliveryEntity = {
  kind: 'delivery'
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
  title: string
  decision: string
  rationale: string | null
  unblocks: string | null
  date: string
  decided_by: string
  project: string
  ref: EntityRef
}

type NoteEntity = {
  kind: 'note'
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
  name: string
  role: string | null
  projects: string[]
  ref: EntityRef
}

type OpenQuestionEntity = {
  kind: 'open_question'
  question: string
  project: string
  source_note: string | null
  ref: EntityRef
}

type SessionEntity = {
  kind: 'session'
  session_id: string
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
  | { op: 'update_task_status';     task_title: string; project: string; status: TaskEntity['status'] }
  | { op: 'mark_blocked';           task_title: string; project: string; blocked_by: string; waiting_on?: string }
  | { op: 'mark_unblocked';         task_title: string; project: string }
  | { op: 'append_decision';        payload: Omit<DecisionEntity, 'kind' | 'ref'> }
  | { op: 'create_delivery';        payload: Omit<DeliveryEntity, 'kind' | 'ref'> }
  | { op: 'update_delivery_status'; delivery_slug: string; project: string; status: DeliveryStatus }
  | { op: 'create_note';            payload: Omit<NoteEntity, 'kind' | 'ref'>; body: string }
  | { op: 'add_open_question';      question: string; project: string; source_note?: string }
  | { op: 'resolve_question';       question: string; project: string }
  | { op: 'link_note_delivery';     note_filename: string; delivery_slug: string }
  | { op: 'upsert_person';          payload: Omit<PersonEntity, 'kind' | 'ref'> }
```

### Derived relationships

The graph tracks relationships between entities derived from their content:

- A task with `waiting_on: Thomas` → related to the person entity named Thomas
- A note with `linked_delivery: q2-pitch-deck` → related to that delivery
- A decision that mentions "unblocks: Architecture diagram" → related to that task
- Two tasks in the same project with the same `delivery` slug → siblings

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

Twin has five internal agents. Each runs as a called function, not a background process. They are invoked by events — user actions, file watcher triggers — and return structured outputs. No agent writes to canonical files directly. All writes go through Validator then State Updater.

The agents share no mutable state between invocations. Each receives the current work graph snapshot as input. This makes them testable in isolation.

---

### Agent 1 — Resolver

**Purpose:** Convert raw events (captures, conversation imports, file appearances) into typed observations. The entry point for all new information.

**Triggers:** New inbox file written, conversation import submitted, new file detected in project folder.

**Inputs:** Raw text + current work graph + active project slug (if known).

**Output schema:**
```typescript
type ResolverOutput = {
  candidate_project: string | null
  confidence: number                    // 0.0–1.0
  needs_user_confirmation: boolean      // true if confidence < 0.7
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
- If confidence < 0.7, set needs_user_confirmation: true.
- Every proposed_observation must include an evidence quote from the input.
- proposed_delta may be null if you cannot confidently determine the right operation.
- Never write to files. Return ResolverOutput JSON only. No prose.
```

**Confidence behaviour:**
- ≥ 0.85: auto-apply allowed — user sees a notification and can undo
- 0.70–0.84: propose to user — one-click accept
- < 0.70: present for manual review with evidence highlighted

---

### Agent 2 — State Updater

**Purpose:** Apply a validated list of delta operations to canonical markdown files. The only agent that writes to files. No LLM call — purely mechanical.

**Trigger:** User approves a set of validated deltas.

**Behaviour per operation:**

| Operation | File action |
|---|---|
| `create_task` | Append row to `tasks.md` |
| `update_task_status` | Find row by title, update status cell |
| `mark_blocked` / `mark_unblocked` | Update blocked_by and waiting_on cells |
| `append_decision` | Append formatted entry to `decisions.md` |
| `create_delivery` | Append row to `deliveries.md` |
| `update_delivery_status` | Update status cell in `deliveries.md` |
| `create_note` | Write new file to `projects/[slug]/notes/` |
| `add_open_question` | Append to `## Open questions` in relevant note |
| `link_note_delivery` | Update `linked_delivery` frontmatter field |
| `upsert_person` | Add or update row in `people.md` |

**After each write:** Notifies the graph to re-derive affected entities. Triggers CLAUDE.md regeneration for affected projects (debounced, 30 seconds). If an operation fails (entity not found), returns an error — never silently skips.

---

### Agent 3 — Planner

**Purpose:** Given a user objective and the current work graph, decide what to do next. This is where agentic behaviour lives — Twin decides, not the user.

**Triggers:** User states an objective. Also runs after every Reconciler cycle to propose follow-up actions. Runs on focus view load.

**Inputs:** User objective + work graph + last 5 session records + active project slug.

**Output schema:**
```typescript
type PlannerOutput = {
  recommended_action:
    | { type: 'dispatch_chat';   objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_code';   objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_cowork'; delivery_slug: string; context_sources: EntityRef[] }
    | { type: 'ask_user';        question: string }
    | { type: 'propose_deltas';  deltas: DeltaOperation[]; rationale: string }
    | { type: 'no_action';       reason: string }
  confidence: number
  alternatives: Array<{ action: string; rationale: string }>
  proactive_proposals: Array<{
    proposal: string
    trigger_reason: string
    proposed_delta: DeltaOperation | null
  }>
}
```

**Proactive checks the Planner runs on every invocation:**

| Condition | Proposed action |
|---|---|
| Task `waiting_on` a person ≥ 2 days with no update | Draft follow-up to that person |
| Decision appended → tasks mention the unblocked item | Mark those tasks unblocked, elevate priority |
| Delivery status → `in_review` | Propose review checklist note |
| Open question resolved via import | Mark resolved, propose next dispatch |
| Delivery due in ≤ 2 days, status still `draft` | Elevate in focus, propose dispatch_cowork |
| Chat session resolves a blocked task's open question | Propose mark_unblocked + next dispatch |

**System prompt:**
```
You are Twin Planner.

Given a user objective and their current work state, decide the best next action.
You may recommend dispatching to Chat, Code, or Cowork. You may propose state
deltas. You may ask one clarifying question. You may propose no action.

Always check for proactive_proposals — situations where the work state implies
a next action the user has not asked for.

Rules:
- Recommend the minimum action that moves the objective forward.
- Do not dispatch if the state is unclear — ask one question instead.
- Proactive proposals must cite trigger_reason explicitly.
- Never invent tasks or decisions not in the current graph.
- Return PlannerOutput JSON only. No prose.
```

---

### Agent 4 — Composer

**Purpose:** Render a complete, bounded context pack for a specific dispatch target and objective. Every dispatched brief is produced by the Composer.

**Trigger:** Planner recommends a dispatch action and user confirms.

**Inputs:** Dispatch target + objective + selected entity refs + work graph + global context.

**Output:**
```typescript
type ContextPack = {
  session_id: string            // generated ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string        // full brief, ready to paste or write to file
  selected_sources: EntityRef[] // exactly what was included, for inspection
  writeback_contract: WritebackContract
  created_at: string
}

type WritebackContract = {
  session_id: string
  expected_outputs: Array<{
    type: 'decision' | 'task_update' | 'artifact' | 'open_question'
    description: string
  }>
  writeback_file: string        // ~/twin/sessions/[session_id]-manifest.yaml
  schema_version: string        // "1.0"
}
```

The writeback contract is embedded at the bottom of every brief:

```markdown
---
## Session writeback instructions

Session ID: twin-2026-03-17T14-22-build-001
Write your session manifest to:
  ~/twin/sessions/twin-2026-03-17T14-22-build-001-manifest.yaml

Schema: ~/twin/sessions/writeback-schema.yaml

Expected outputs for this session:
- Decisions made about the data framework
- Tasks created or updated during implementation
- Any new blockers surfaced

---
```

**Brief formats per target — see section 8.**

---

### Agent 5 — Reconciler

**Purpose:** Turn a session manifest from an external agent into proposed state deltas. Runs automatically when a manifest file appears in `~/twin/sessions/`.

**Trigger:** File watcher detects a new `*-manifest.yaml` in `~/twin/sessions/`.

**Inputs:** Session manifest + original ContextPack for that session_id + current work graph.

**Output:**
```typescript
type ReconcilerOutput = {
  session_id: string
  proposed_deltas: DeltaOperation[]
  follow_up_proposals: PlannerOutput['proactive_proposals']
  confidence: number
  unresolved: Array<{
    item: string
    reason: string
    needs_user_input: boolean
  }>
}
```

**System prompt:**
```
You are Twin Reconciler.

Given a session manifest from an external agent and the original context pack,
extract structured state deltas for the Twin work graph.

Rules:
- Only extract what is explicitly stated in the manifest.
- Cross-reference against the original context pack to detect contradictions.
- If a manifest item is ambiguous, add it to unresolved with needs_user_input: true.
- Propose follow_up_proposals for obvious next actions implied by the session.
- Return ReconcilerOutput JSON only. No prose.
```

User is notified: "Session reconciled — 3 deltas proposed." They review and approve via the same delta review UI used everywhere in Twin.

---

### Agent 5b — Validator

**Purpose:** Check proposed delta operations for correctness before State Updater applies them. No LLM call — rule-based only.

**Checks:**
- Task title exists in graph before `update_task_status` or `mark_blocked`
- Project slug is valid before any project-scoped operation
- Decision title is not a duplicate (warn, do not block)
- Delivery slug exists before `update_delivery_status`
- Person name is non-empty before `upsert_person`
- No circular unblocking

**Output:** Validated delta list with failed operations flagged with reason. Failed operations are shown to the user — never silently dropped.

---

## 8. The three dispatch targets

All three dispatch flows share the same entry point:

1. User states an objective (typed or selected from Planner suggestions)
2. Planner recommends a target and selects context sources
3. User reviews and confirms (or overrides sources)
4. Composer assembles the ContextPack and brief
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
[open questions from the graph related to this objective]

## Key constraints
[from context.md and reference notes]

---
## Session writeback instructions
[writeback contract — see section 7, Agent 4]
```

**Writeback — conversation import:**

After the Chat session, the user opens the conversation import panel, pastes the conversation text, and clicks Extract. The Resolver runs the extraction pass. The review screen shows discrete cards for decisions, tasks, learnings, and open questions. User ticks and confirms. State Updater applies the approved deltas.

Chat sessions do not produce a machine-written manifest — the Resolver handles extraction from pasted text instead.

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
[twin_visible tasks with status=in_progress or todo, ordered by priority and due date]

## Architecture decisions already made
[relevant entries from decisions.md — technical decisions only]

## Open technical questions
[tasks with status=blocked, notes with unanswered questions]

## Blocked items
[tasks with waiting_on or blocked_by]

## Deliveries in progress
[deliveries with type=spec or type=code]

## Pick up here
[one sentence: what to start doing immediately]

---
_Full context available in this folder:_
_tasks.md · deliveries.md · decisions.md · notes/_

## Session writeback instructions
[writeback contract]
```

**Writeback:** Claude Code writes a manifest to `~/twin/sessions/[session_id]-manifest.yaml`. File watcher triggers Reconciler. The Code brief also instructs Claude Code:

```
At the end of this session, append any decisions to decisions.md using this format:
## [date] — [decision title]
**Decision:** ...
**Rationale:** ...
**Unblocks:** ...

Then write your full session manifest to the path in the writeback instructions.
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
[relevant entries from decisions.md]

## Format requirements
[length, structure, format, what to avoid]

## Who I am
[role and relevant expertise]

---
_All source files are in this folder. Read them before starting._
_Save outputs to this folder when complete._

## Session writeback instructions
[writeback contract]
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

**AI priority brief** — generated by the Planner on first open each day, or on demand. Reads all twin-synced notes and tasks across active projects via the work graph. Produces:
- One direct paragraph: the actual state of work right now — specific, names projects, deadlines, blockers
- 2–4 prioritised items with concrete reasoning and a next action each
- Blocked items: named, with who/what is blocking and suggested follow-up
- Overdue or pending decisions: named explicitly

**Proactive proposals panel** — shown below the priority brief when Planner has identified actionable proposals:

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
[TaskEntity[] for all active projects, with status, due_date, blocked_by, waiting_on]

Active deliveries:
[DeliveryEntity[] for all active projects]

Recent decisions (last 7 days):
[DecisionEntity[] across active projects]

Twin-synced notes (titles and first 200 chars):
[NoteEntity[] where twin_synced=true, most recent first]

Produce:
1. One paragraph (3-5 sentences): what is the actual state of work right now?
   Name projects, deadlines, blockers. Be specific, not generic.
2. 2-4 priority items. Each: one sentence of reasoning + one concrete next action.
3. Blocked items: name each, who/what is blocking, suggest follow-up.
4. Pending decisions: name them and state why they are blocking.

Rules: be direct. Do not hedge. Prioritise ruthlessly — if not urgent and not
blocked, leave it out. Return plain prose, no JSON.
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

---

## 12. Inbox triage

Reads all files in `~/twin/inbox/` and presents them chronologically. Goal: clear the inbox in under 2 minutes.

**For each item:**
- Raw capture text (large, readable)
- Resolver's interpretation: type badge, suggested title, suggested project, proposed delta
- Three actions: `Accept`, `Edit`, `Discard`

**Accept:** File moved to `projects/[slug]/notes/[date]-[slug].md` with full frontmatter. State Updater applies the proposed delta (e.g. appends task row to `tasks.md`).

**Edit:** Inline form with Resolver interpretation pre-filled. User adjusts. Confirm moves the file and applies the edited delta.

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
[active project's tasks, decisions, open questions, people]

Extract only what is clearly present. Do not invent or infer beyond the text.

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

**On confirm:** State Updater creates a `chat_learning` note with the full conversation as collapsible body, appends ticked decisions to `decisions.md`, appends ticked tasks to `tasks.md`.

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
| Project — tasks | Task table, filterable by status |
| Project — deliveries | Delivery table with status and due dates |
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
  ☑ tasks.md — blocked items only
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
| Markdown table parsing | Custom `parseMarkdownTable()` | No good library for bidirectional read/write |
| Markdown rendering | `marked` | Lightweight, no dependencies |
| AI calls | `@anthropic-ai/sdk` | Official SDK, streaming support |
| IDs | `ulid` | Sortable by creation time |
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

  // Structured files
  readTasks(projectSlug: string): Promise<TaskEntity[]>
  writeTasks(projectSlug: string, tasks: TaskEntity[]): Promise<void>
  readDeliveries(projectSlug: string): Promise<DeliveryEntity[]>
  writeDeliveries(projectSlug: string, deliveries: DeliveryEntity[]): Promise<void>
  readDecisions(projectSlug: string): Promise<DecisionEntity[]>
  appendDecision(projectSlug: string, entry: DecisionEntity): Promise<void>
  readPeople(): Promise<PersonEntity[]>
  writePeople(people: PersonEntity[]): Promise<void>

  // Generated files
  writeProjectCLAUDE(projectSlug: string, content: string): Promise<void>
  writeGlobalCLAUDE(content: string): Promise<void>

  // Sessions
  writeSessionPack(pack: ContextPack): Promise<void>
  readSessionManifest(sessionId: string): Promise<SessionManifest>
  listSessions(limit?: number): Promise<SessionEntity[]>
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

// Work graph (see section 6 for full entity definitions)
type WorkGraph = {
  entities: WorkGraphEntity[]
  relationships: Array<{
    from: { kind: WorkGraphEntity['kind']; id: string }
    to:   { kind: WorkGraphEntity['kind']; id: string }
    type: 'blocks' | 'unblocks' | 'informs' | 'produces' | 'involves' | 'belongs_to'
  }>
  built_at: number
}

// Delta operations (see section 6 for full definition)
// (DeltaOperation union type — 12 variants)

// Agent outputs (see section 7 for full definitions)
type ResolverOutput = { ... }
type PlannerOutput = { ... }
type ReconcilerOutput = { ... }

// Session types
type ContextPack = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string
  selected_sources: EntityRef[]
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
    unblocks?: string
  }>
  tasks_created: Array<{
    title: string
    priority: 'high' | 'medium' | 'low'
    due_date?: ISODate
    waiting_on?: string
  }>
  tasks_updated: Array<{
    title: string
    status: TaskStatus
    blocked_by?: string
    waiting_on?: string
  }>
  artifacts: Array<{
    path: string
    delivery_slug?: string
    description: string
  }>
  open_questions: string[]
  blockers: Array<{
    title: string
    blocked_by: string
    waiting_on?: string
  }>
  confidence: number
}

// Note types
type Note = {
  filename: string
  title: string
  type: NoteType
  project: string | null
  twin_synced: boolean
  linked_delivery?: string
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

Twin regenerates the project CLAUDE.md whenever any of the following changes (debounced, 30 seconds after last change):
- A task status changes
- A delivery status changes
- A new decision is appended
- A note is marked twin_synced
- User explicitly triggers regeneration

### Generation prompt

```
Given the following project files, generate a concise, structured CLAUDE.md brief
for an AI agent session. The brief tells an agent what it needs to know to start
working on this project without asking clarifying questions.

context.md:
[full content]

tasks.md:
[full content]

deliveries.md:
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
## Blocked items
## Deliveries in progress  [table]
## Key constraints
## Pick up here

End with:
---
_Source files: context.md · tasks.md · deliveries.md · decisions.md · notes/_
_Do not edit this file — it is regenerated by Twin._
_Append decisions to decisions.md. Edit tasks in tasks.md._
```

---

## 18. MVP feature list

### Must have — prototype gates

| Feature | Why it's required |
|---|---|
| `~/twin/` folder scaffold on first launch | Foundation for everything |
| Work graph construction from files | All internal agents operate over this |
| State Updater + Validator | Safe, traceable writes to canonical files |
| Resolver — capture and import pipeline | Makes sparse input intelligent |
| Planner — objective-based dispatch | Core of the agentic claim |
| Composer — context pack generation | Consistent, traceable briefs |
| Reconciler — session manifest processing | Closes the writeback loop |
| Global keyboard shortcut (`Cmd+Shift+Space`) | Without it capture friction kills the habit |
| Capture strip + inbox file creation | Core capture mechanic |
| Inbox triage view with Resolver proposals | Where captures become structured data |
| Conversation import — paste + extract + review | Chat sessions produce persistent context |
| Conversation note type + structured UI | Captures human conversation context |
| People model (`people.md`) + picker | Required for conversation notes |
| Project CRUD + folder creation | Context boundary for everything |
| Note editor with frontmatter controls | Primary surface for longer thinking |
| Twin toggle per note | Explicit context opt-in |
| Task table read/write per project | Required for Planner to reason about priority |
| Delivery table read/write per project | Gives tasks a "why" |
| Decisions log append | Closes the writeback loop |
| Focus view with priority brief + proactive proposals | Core value proposition |
| Objective input at dispatch start | Replaces scope-first as primary dispatch driver |
| Dispatch to Chat — ContextPack + copy | Validates Chat dispatch flow |
| Dispatch to Code — ContextPack + write to folder | Validates Code dispatch flow |
| Dispatch to Cowork — ContextPack + write to folder | Validates Cowork dispatch flow |
| Session pack saved to `sessions/` | Traceability — what was sent |
| Session manifest detection + Reconciler | Closes Code and Cowork loops |
| CLAUDE.md generation per project | The filesystem integration |
| File watcher for agent writebacks | Detects manifests and output files |
| Snapshot history (last 10 sessions) | Re-use and review past sessions |
| Writeback schema (`writeback-schema.yaml`) | Agents need this to write manifests |

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

## 19. Build order

Build in this sequence. Each step has a gate — a test you run before proceeding. Do not skip ahead.

### Step 1 — Tauri shell + folder scaffold (day 1, ~3h)

Bootstrap the Tauri app. On first launch, create `~/twin/` with:
- `CLAUDE.md` (template)
- `people.md` (empty table)
- `inbox/`
- `sessions/` + `writeback-schema.yaml`
- `projects/` + one seed project with all required files pre-populated

Write `fs.ts` with basic read/write functions. Test by reading the seed project and logging to console.

**Gate:** Can the app read a note from the filesystem and log its parsed frontmatter?

---

### Step 2 — Work graph construction (day 1–2, ~4h)

Write `buildGraph()`. Parse all file types into typed entities. Derive relationships. Log the graph to console. No UI yet.

**Gate:** Does the graph correctly represent the seed project's tasks, decisions, deliveries, and people as typed entities with relationships between them?

---

### Step 3 — State Updater + Validator (day 2, ~3h)

Write the delta operation types. Write the Validator — rule checks, no LLM. Write the State Updater — one function per operation type. No UI yet.

**Gate:** Apply a `create_task` delta — does the new row appear in `tasks.md`? Apply `mark_blocked` — do the correct cells update? Does Validator correctly reject `mark_unblocked` on a task that isn't blocked?

---

### Step 4 — Resolver agent (day 2–3, ~4h)

Wire the Resolver prompt against the Anthropic API. Test against 10 real captures. Evaluate confidence calibration. Build the delta review UI: observation cards with evidence quotes, accept/edit/discard.

**Gate:** Paste a real capture. Does Resolver correctly identify it as task or blocker? Is the proposed delta right? Does the review screen make errors easy to correct?

---

### Step 5 — Capture + inbox (day 3, ~3h)

Global keyboard shortcut. Capture strip writes to `inbox/`. Resolver runs in background. Inbox triage view uses Resolver output.

**Gate:** Capture from another app in under 5 seconds. Triage 5 items in under 2 minutes using Resolver proposals.

---

### Step 6 — Project sidebar + note / task / delivery views (day 3–4, ~4h)

Read `~/twin/projects/` directory. Render project names in sidebar. Note list per project. Task table — inline status editing writes via State Updater. Delivery table — same.

**Gate:** Edit a task status in the UI. Does `tasks.md` update correctly via State Updater? Does the graph re-derive?

---

### Step 7 — Planner + focus view (day 4–5, ~4h)

Wire the Planner. Focus view calls Planner on load. Render priority brief and proactive proposals panel. Proposals are dismissible. Planner also provides objective suggestions for dispatch.

**Gate:** Does the Planner correctly identify the most urgent item? Does it surface a proactive proposal when a task has been waiting on someone for 2+ days?

---

### Step 8 — Composer + dispatch view (day 5–6, ~4h)

Objective input. Composer assembles ContextPack. Brief preview with source checklist. Copy button. Pack saved to `~/twin/sessions/`. Write project CLAUDE.md for Code and Cowork dispatches.

**Gate:** State objective "decide the data framework." Does Composer select the right sources? Is the brief useful when pasted into Claude Chat without further explanation?

---

### Step 9 — Session manifests + Reconciler (day 6–7, ~4h)

File watcher detects `*-manifest.yaml` files. Reconciler processes them. Delta review UI reused from Resolver. State Updater applies approved deltas.

**Gate:** Manually write a manifest file matching the schema. Does Reconciler parse it and propose the right deltas? Do the deltas apply cleanly?

---

### Step 10 — Conversation notes + people model (day 7, ~3h)

`people.md` read/write via `fs.ts`. People picker component. Conversation note UI: three text areas, people picker, agreed→decisions checkbox. On save, write file and optionally append to `decisions.md`.

**Gate:** Record a 3-minute conversation in under 2 minutes. Does it appear in the project notes folder with correct frontmatter and correct entries in `decisions.md`?

---

### Step 11 — Conversation import (day 7–8, ~4h)

Import panel: large textarea, project selector, Extract button. Resolver extraction call (conversation import mode). Review screen: cards by type. Confirm applies deltas via State Updater.

**Gate:** Paste a 20-message Claude Chat conversation. Are the extracted decisions and tasks accurate? Can you review and confirm in under 90 seconds?

---

### Step 12 — Note editor + chat assistant (day 8, ~3h)

Full note editor with frontmatter controls. Chat pane using Composer for context pack. "Save to note" from assistant messages.

**Gate:** Open a note. Does the chat assistant know the project context without being told?

---

### Step 13 — CLAUDE.md generation (day 8, ~2h)

Wire the generation prompt. Trigger on relevant file changes (debounced). Write to project folder.

**Gate:** Make a change to `tasks.md`. Does `CLAUDE.md` regenerate within 30 seconds with the updated state?

---

### Step 14 — Real-world test day (day 9)

Use Twin for a full working day. Capture everything with `Cmd+Shift+Space`. Run focus brief in the morning. Dispatch to Chat, Code, and Cowork at least once each. Write a manifest after Code and Cowork sessions. Note what fails, what is missing, what is better than expected. Do not fix anything during the test day — write all observations as inbox captures.

---

## 20. Definition of done

The prototype is complete when all of the following are true:

1. You open Twin on Monday morning and the priority brief tells you what to work on — without opening any other tool first.
2. You capture a thought from another app in under 5 seconds using `Cmd+Shift+Space`.
3. You clear a 5-item inbox in under 2 minutes using Resolver proposals.
4. You dispatch a Code session. The brief is useful — Claude Code starts working without asking clarifying questions.
5. You dispatch a Cowork session. You point Cowork at `~/twin/projects/[slug]/` and it produces a useful first draft from the notes already in that folder.
6. You dispatch a Chat session and have a conversation that doesn't require re-explaining your situation.
7. After a Claude Code session, you write a manifest and Twin's Reconciler proposes the correct deltas in under 60 seconds of review.
8. After a Cowork session, Twin detects the output file and offers to update the delivery status correctly.
9. After a Chat session, you paste the conversation into the import panel and the important decisions and tasks are extracted correctly — approving them takes under 90 seconds.
10. You record a colleague conversation as a conversation note in under 2 minutes and the agreed items appear in `decisions.md`.
11. The Planner surfaces at least one accurate proactive proposal during the test day — something it noticed that you had not consciously flagged.
12. The work graph reflects the current state of your active project without you having manually updated any file — the graph was built from files that agents and Twin wrote.
13. Every change to a canonical file is traceable to a specific delta operation with a source and timestamp.
14. All data survives quitting and reopening the app — everything is in files.
15. You could hand a colleague your `~/twin/projects/[slug]/` folder and they would have enough context to continue the work.

---

## 21. Open questions

| Question | Options | Recommendation |
|---|---|---|
| How does the Chat brief get into Claude Chat? | Clipboard copy / browser extension pre-fill | Clipboard for v1. Investigate Claude Desktop system prompt injection for v2. |
| Should Resolver run synchronously on capture or always async? | Sync (blocks capture) / Async (capture first, interpret after) | Always async. Never block the capture. |
| Should CLAUDE.md regenerate on every file change or debounced? | Every change / debounced (30s) | Debounced — regeneration is an API call. |
| How to handle a manifest that references tasks not in the graph? | Reject / Add to unresolved / Create the task | Add to unresolved with `needs_user_input: true`. |
| Should Planner proactive proposals have an expiry? | No expiry / expire after N days / expire after condition changes | Expire when the underlying condition changes. Re-show if it recurs. |
| Should captures auto-assign to active project or always go to inbox? | Always inbox / default to active project | Default to active project. Inbox for captures when no project is active. |
| Should decisions.md be parsed by Twin for display, or append-only? | Parse for structured display / append-only | Append-only for v1. Parsing adds complexity with minimal benefit. |
| Scope of the Planner's proactive proposals — per-project or global? | Per active project / across all active projects | Across all active projects — cross-project awareness is the Planner's main value. |

---

## 22. Success metrics

Qualitative for v1. No analytics, no dashboards. Evaluate after 2 weeks of real use.

**Daily habit formation:** Do you open Twin before anything else in the morning? If yes within 2 weeks, the focus brief earns its place.

**Capture consistency:** Is the inbox never more than 10 items? If yes, the shortcut and capture strip are frictionless enough.

**Dispatch quality:** After dispatching to Code or Cowork, count how many clarifying questions the agent asks that Twin's brief should have answered. These should approach zero as the Composer and brief formats are refined.

**Reconciler accuracy:** Of the deltas the Reconciler proposes after a session, what fraction do you accept without editing? Target above 80% after the first week.

**Proactive proposal accuracy:** Of the Planner's proactive proposals, what fraction are genuinely useful (you would have wanted to know)? Target above 70%.

**Context leak reduction:** Are you re-explaining your situation to Claude less often than before? Informal yes/no after 2 weeks validates or invalidates the core hypothesis.

**Model currency:** At any moment, does `~/twin/projects/[slug]/CLAUDE.md` accurately describe the current project state without you having manually updated it? If yes, the writeback loops are working.

---

*End of spec v0.4*  
*Constituted from: base spec v0.2 + patch v0.2→v0.3 + patch v0.3→v0.4*  
*Next step: `tauri create twin && mkdir ~/twin && implement fs.ts && buildGraph()`*
