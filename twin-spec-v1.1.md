# Twin — Complete Prototype Specification
**Version:** 1.1
**Date:** 2026-03-23
**Status:** Pre-build
**Architecture:** Filesystem-canonical, graph-derived, Tauri desktop app
**Supersedes:** v1.0 (2026-03-23), v0.4 (2026-03-17)

---

## Table of contents

1. What this document is
2. Product definition
3. Competitive positioning
4. Core design principles
5. The folder structure
6. File formats
7. The work graph
8. The visual graph
9. Internal agent runtime
10. The three dispatch targets
11. The scope and objective model
12. The focus view
13. Capture
14. Inbox triage
15. Conversation import
16. The Twin app — views and navigation
17. Tech stack
18. TypeScript types
19. CLAUDE.md generation
20. Error handling and degraded states
21. Data lifecycle and archival
22. MVP feature list
23. Build order
24. Definition of done
25. Open questions
26. Success metrics
27. Risk register

---

## 1. What this document is

This spec defines the first working prototype of Twin — a personal context engine and agent orchestration layer for knowledge workers. The prototype's goal is not to be feature-complete. It is to validate one core hypothesis:

> **If Twin maintains a live, structured model of a user's work state and routes work to Claude Chat, Claude Code, and Claude Cowork through typed context packs and structured writeback contracts, those sessions will be meaningfully better — with near-zero overhead from the user.**

Everything in this spec is in service of testing that hypothesis. Features that don't directly test it are out of scope for v1.

### Implementation context

This prototype will be built using Claude Code as the primary implementation tool. The spec is intentionally detailed and comprehensive — every type, every prompt, every UI state — because that detail directly translates to implementation speed and correctness when working with AI-assisted development. Scope is not the constraint; clarity is.

### Changes from v1.0

| Area | v1.0 | v1.1 | Rationale |
|---|---|---|---|
| Dispatch friction | 10+ step flow for Chat sessions | Streamlined flows with quick-dispatch shortcuts | The friction tax of dispatch/writeback was underestimated. Reduce steps or the habit breaks. |
| Chat writeback | Three paths, clipboard auto-detect | Four paths including session-end prompt. Explicit risk flag. | Chat writeback is the biggest threat to the core hypothesis. Instrument and measure from day 1. |
| Decision lifecycle | Append-only, no status | `active \| superseded` status + supersession chain | After a month, stale decisions pollute context packs. |
| Data lifecycle | Not addressed | Archival mechanism + staleness detection | The work graph must stay current. Old data degrades AI quality. |
| Visual graph | Not addressed | Interactive force-directed graph view (section 8) | The work graph is Twin's core data structure — users should see and explore it. |
| Competitive context | Not addressed | Section 3: positioning against Augment Intent, Obsidian+MCP, etc. | Clarifies what Twin is and isn't. |
| Risk register | Not addressed | Section 27: explicit risks with mitigations | Honest about what might not work. |
| Build timeline | ~4 weeks | ~6-8 weeks with phase gates | Prompt tuning is iterative. Previous estimates were too aggressive. |

### Changes from v0.4

| Area | v0.4 | v1.0+ | Rationale |
|---|---|---|---|
| Structured data format | Markdown tables | YAML files | Markdown tables are fragile to round-trip. YAML is unambiguous. |
| Entity identity | Match by title string | ULID on every entity | Title matching breaks on typos, renames, and LLM paraphrase. |
| Confidence model | Numeric 0.0–1.0 | Categorical `high` / `medium` / `low` | LLMs are poorly calibrated for numeric scores. |
| CLAUDE.md regeneration | On every state change | On dispatch and on explicit request | Regeneration is an API call. Per-change is wasteful. |
| Planner scope | Single agent | Planner + Prioritiser | Too much responsibility for a single LLM call. |
| Concurrent edits | Not addressed | File-level optimistic locking via mtime | "Any editor can write" requires conflict handling. |
| Error handling | Not addressed | Dedicated section with degraded state behaviors | Happy path only is insufficient. |

### What is explicitly deferred to v2

- Support for non-Claude agents (Cursor, ChatGPT, Notion AI, Gemini, etc.)
- Import from external tools (Obsidian vaults, Notion, Linear, Todoist)
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

### What Twin is NOT

Twin is not a note-taking app, a task manager, or a project management tool — even though it has notes, tasks, and projects. These are **data surfaces for the work graph**, not standalone features competing with Notion, Obsidian, or Linear. The note editor exists to feed the graph. The task list exists so the Planner can reason about priority. The value is in the graph and the dispatch loop, not in the individual surfaces.

If the note editor is mediocre but the context packs are excellent, Twin is succeeding. If the note editor is polished but context packs are no better than manually typing your situation into Claude, Twin has failed.

---

## 3. Competitive positioning

### The landscape (March 2026)

| Product | What it does | What Twin adds |
|---|---|---|
| **Augment Intent** | Desktop agent orchestration for code | Code-only. No personal context, no work graph, no understanding/delivery modes. |
| **Obsidian + MCP** | Vault as agent context via community plugins | DIY integration. No dispatch model, no writeback contracts, no context pack assembly. |
| **Second Brain I/O** | Capture + recall + MCP server | No structured graph, no dispatch, no delta model. Recall only, not orchestration. |
| **Lore** | Session handoff extraction | Minimal. No live graph, no proactive proposals, no multi-mode dispatch. |
| **Claude Code Tasks** | DAG-based task persistence within Claude Code | Within one agent only. No cross-mode awareness, no personal context, no decisions/deliveries. |
| **Mem0 / Zep** | Memory infrastructure for AI agents | Developer infrastructure, not user-facing. No UI, no work graph, no dispatch. |
| **Cursor Rules** | Per-project AI instructions | Static rules per project. No cross-project context, no writeback, no live state. |

### Twin's moat

The filesystem-canonical architecture is the primary moat. If `~/twin/` is where the user's work state lives, Twin remains valuable regardless of what Anthropic ships natively. Claude Code Tasks, improved Cowork, and MCP are all steps toward session continuity — but they operate *within* individual agents. Twin operates *across* agents and *across* projects.

### Platform risk

Anthropic is building upward toward Twin's space. If Anthropic ships native cross-session, cross-agent context management, Twin's dispatch layer becomes less valuable. The mitigation: the work graph and focus view provide value independent of dispatch. Even if dispatch friction drops to zero natively, the structured model of "what am I working on, what's blocked, what should I do next" remains useful.

---

## 4. Core design principles

**Filesystem-canonical, graph-derived.**
YAML and markdown files in `~/twin/` are the durable source of truth. Twin maintains a derived work graph in memory, built by parsing those files on launch and kept current by file watchers. The graph is never persisted separately — if lost, it is rebuilt from files in under 200ms. Any text editor, any agent, and any future tool can read and write the canonical state without Twin being present.

**Structured data in YAML, prose in markdown.**
Structured, machine-read data (tasks, deliveries, people) is stored as YAML — unambiguous, trivially parseable, and safely round-trippable. Prose content (notes, decisions, context) remains in markdown for human readability and agent compatibility. Comments in YAML files use the "above, not inline" convention for reliable round-trips with `eemeli/yaml`.

**Every entity has a stable identity.**
Tasks, deliveries, open questions, sessions, decisions, and people all carry a ULID. References between entities use IDs, not display strings. Titles are for humans; IDs are for machines.

**Dispatch must be fast or it won't happen.**
The friction tax of any workflow determines whether it becomes a habit. Every dispatch flow has a "quick path" that completes in under 30 seconds. The full review path exists for when the user wants control. Default to fast, offer thorough.

**Twin proposes actions, not just summaries.**
Every output from Twin answers "what happens next?" not just "what is the current state?"

**All autonomous updates are expressed as structured deltas.**
Twin never applies freeform mutations to canonical files. Every change is a typed delta operation that Twin validates before applying. Every change is inspectable and reversible.

**External agents never mutate canonical state directly.**
Claude Code and Cowork write outputs to the project folder. They emit session manifests that Twin reads, validates, and applies as deltas. Canonical state stays under Twin's control.

**Autonomy is explicit, bounded, and inspectable.**
Twin takes no autonomous action the user has not seen proposed. No silent writes to canonical state.

**Capture must be near-zero friction.**
If adding something to Twin takes more than 5 seconds, the habit breaks and the model goes stale.

**The folder is the integration.**
Claude Code and Cowork are pointed at `~/twin/projects/[slug]/`. No API integration required.

**Graceful degradation over silent failure.**
When an API call fails, a file is malformed, or a manifest references unknown entities, Twin surfaces the problem and continues operating with reduced capability.

**Data has a lifecycle.**
Work state is not append-only forever. Decisions get superseded, projects get archived, stale entities get cleaned from context packs. The graph must stay current to stay useful.

---

## 5. The folder structure

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
├── archive/                               # Archived projects and old sessions
│   └── old-project/
│
└── projects/
    ├── municipality-platform/
    │   ├── CLAUDE.md                      # Project brief — generated by Twin
    │   ├── context.md                     # Background: client, goal, constraints
    │   ├── tasks.yaml                     # Task list with status and deadlines
    │   ├── deliveries.yaml                # Delivery tracker
    │   ├── decisions.yaml                 # Decision log with lifecycle status
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
        ├── decisions.yaml
        └── notes/
```

### Why this structure works for agents

When you point Claude Code at `~/twin/projects/municipality-platform/`, it reads `CLAUDE.md` (the generated brief), `tasks.yaml` (what is in flight and blocked), `decisions.yaml` (what has been decided), and `notes/` (the thinking behind everything). The filenames are self-describing.

Git version control is free. Run `git init ~/twin/` and you get full history of every note, decision, and context change.

---

## 6. File formats

### 6.1 Note files (`notes/YYYY-MM-DD-[slug].md`)

Every note is a standalone markdown file with YAML frontmatter.

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
| `people` | string[]? | Names — for conversation notes. |
| `date` | string? | Date of conversation — for conversation notes. |
| `created` | date | ISO date, set on creation, never changed. |
| `updated` | date | ISO date, updated on every save. |

**Note types:**

| Type | Description |
|---|---|
| `thought` | Raw idea, observation, or half-formed thinking |
| `meeting` | Notes from a meeting, call, or structured conversation |
| `decision` | A decision that was made — also appended to `decisions.yaml` |
| `reference` | Background material, constraints, client information |
| `chat_learning` | Written back from a Claude Chat or AI conversation session |
| `conversation` | Structured record of a real-world exchange with a colleague or client |

---

### 6.2 Conversation notes

A `conversation` note is a structured record of a real-world exchange. It captures what was relevant: what was discussed, what was agreed, and what remains open.

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

When a conversation note is saved with content in "What was agreed," Twin proposes appending each item to `decisions.yaml`. The user toggles per item.

---

### 6.3 Inbox captures (`inbox/[timestamp]-[slug].md`)

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

### 6.4 Tasks (`projects/[slug]/tasks.yaml`)

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

---

### 6.5 Deliveries (`projects/[slug]/deliveries.yaml`)

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

---

### 6.6 Decisions (`projects/[slug]/decisions.yaml`)

Decisions have a lifecycle: `active` → `superseded`. New decisions can explicitly supersede old ones. The Composer only includes `active` decisions in context packs by default.

```yaml
# Decisions — municipality-platform
# Updated: 2026-03-17

decisions:
  - id: 01JBQFA1K2
    title: Data framework decision deferred
    status: active
    date: 2026-03-17
    decided_by: August
    unblocks:
      - 01JBQF3B2M
    decision: No final decision on Polars vs Spark yet.
    rationale: >
      Blocked on infra cost estimate from Thomas. Decide by Friday EOD.

  - id: 01JBQFA2M3
    title: On-premise inference confirmed
    status: active
    date: 2026-03-14
    decided_by: August + client IT team
    unblocks:
      - 01JBQF3D4P
    decision: All LLM inference will run on-prem on the client's H100 cluster.
    rationale: >
      Client data governance policy prohibits cloud inference.

  - id: 01JBQFA0J1
    title: Cloud inference considered
    status: superseded
    superseded_by: 01JBQFA2M3
    date: 2026-03-10
    decided_by: August
    decision: Evaluate both cloud and on-prem inference.
    rationale: >
      Initial assumption before client data governance constraints were known.
```

**Why YAML instead of markdown for decisions:** Decisions carry structured metadata (id, status, superseded_by, unblocks) that was previously embedded in markdown using a bespoke `_id: ..._` convention requiring regex parsing. YAML makes all fields first-class, simplifies the `supersede_decision` delta operation, and is consistent with tasks.yaml and deliveries.yaml. Multi-line rationale uses YAML block scalars (`>`). The generated CLAUDE.md renders decisions in human-friendly prose.

**Lifecycle rules:**
- New decisions default to `active`
- When a decision supersedes another, the old decision gets `status: superseded` and `superseded_by: [new_id]`
- The Composer includes only `active` decisions in context packs unless the user explicitly includes superseded ones
- Superseded decisions remain in the file for audit trail — never deleted
- The `supersede_decision` delta operation atomically updates both the old and new entries

---

### 6.7 Global CLAUDE.md (`~/twin/CLAUDE.md`)

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
- Append decisions to decisions.yaml after the session — not to CLAUDE.md
- Flag blockers and risks explicitly
```

---

### 6.8 Project CLAUDE.md (`~/twin/projects/[slug]/CLAUDE.md`)

Generated and maintained by Twin. Regenerated on dispatch (if stale) and on explicit user request. Do not edit directly.

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
_Source files: context.md · tasks.yaml · deliveries.yaml · decisions.yaml · notes/_
_Do not edit this file — it is regenerated by Twin._
_Append decisions to decisions.yaml. Edit tasks in tasks.yaml._
```

---

### 6.9 People (`~/twin/people.yaml`)

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
- The Planner uses this when proposing follow-up drafts
- The visual graph shows people as nodes connected to their projects, tasks, and decisions

---

### 6.10 Session files (`~/twin/sessions/`)

**Context pack** (`[session_id]-pack.md`) — the full brief sent to the agent.

**Session manifest** (`[session_id]-manifest.yaml`) — structured writeback from the agent.

**Writeback schema** (`writeback-schema.yaml`) — included in every brief.

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
    supersedes: ULID            # optional — decision ID this supersedes

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

**Fallback for task references:** If an agent writes a `tasks_updated` entry without a valid ID, the Reconciler attempts fuzzy matching against existing task titles and presents the match for confirmation.

---

## 7. The work graph

The work graph is Twin's in-memory, derived representation of the project state. It is built by parsing the canonical files on launch and updated incrementally as files change. It is never persisted separately — if lost, it is rebuilt from files.

### Typed entities

```typescript
type ULID = string

type EntityRef = {
  file: string        // relative path from ~/twin/
  line?: number
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
  status: 'active' | 'superseded'
  superseded_by: ULID | null
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
  status: 'open' | 'resolved'
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

Every change to canonical state is expressed as one of these typed operations. All reference entities by ULID.

```typescript
type DeltaOperation =
  | { op: 'create_task';            payload: Omit<TaskEntity, 'kind' | 'ref'> }
  | { op: 'update_task_status';     task_id: ULID; project: string; status: TaskEntity['status'] }
  | { op: 'mark_blocked';           task_id: ULID; project: string; blocked_by: string; waiting_on?: string }
  | { op: 'mark_unblocked';         task_id: ULID; project: string }
  | { op: 'append_decision';        payload: Omit<DecisionEntity, 'kind' | 'ref'> }
  | { op: 'supersede_decision';     old_id: ULID; new_id: ULID; project: string }
  | { op: 'create_delivery';        payload: Omit<DeliveryEntity, 'kind' | 'ref'> }
  | { op: 'update_delivery_status'; delivery_id: ULID; project: string; status: DeliveryStatus }
  | { op: 'create_note';            payload: Omit<NoteEntity, 'kind' | 'ref'>; body: string }
  | { op: 'add_open_question';      payload: Omit<OpenQuestionEntity, 'kind' | 'ref'> }
  | { op: 'resolve_question';       question_id: ULID; project: string }
  | { op: 'link_note_delivery';     note_id: ULID; delivery_id: ULID }
  | { op: 'upsert_person';          payload: Omit<PersonEntity, 'kind' | 'ref'> }
  | { op: 'archive_project';        project_slug: string }
```

### Derived relationships

The graph tracks typed relationships between entities:

```typescript
type RelationshipType =
  | 'blocks'        // task A blocks task B
  | 'unblocks'      // decision unblocks task
  | 'informs'       // note informs delivery
  | 'produces'      // session produces artifact
  | 'involves'      // task/decision involves person
  | 'belongs_to'    // entity belongs to project
  | 'supersedes'    // decision supersedes another
  | 'delivers'      // task contributes to delivery
  | 'raises'        // note raises open question

type Relationship = {
  from: { kind: WorkGraphEntity['kind']; id: string }
  to:   { kind: WorkGraphEntity['kind']; id: string }
  type: RelationshipType
}
```

Derivation rules:
- A task with `waiting_on: Thomas` → `involves` the person entity named Thomas
- A note with `linked_delivery: 01JBQF9M3P` → `informs` that delivery
- A decision with `unblocks: 01JBQF3B2M` → `unblocks` that task
- A task with `delivery: 01JBQF9M3P` → `delivers` that delivery
- A decision with `superseded_by: 01JBQFA2M3` → `supersedes` relationship
- Two tasks in the same project with the same `delivery` → siblings (derived from shared `delivers` relationship)

### Graph construction

```typescript
async function buildGraph(): Promise<WorkGraph> {
  const projects = await fs.listProjects()
  const entities: WorkGraphEntity[] = []

  for (const project of projects) {
    if (project.status === 'archived') continue  // skip archived projects
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

Reconstruction takes under 200ms for a typical twin folder (under 500 files). Archived projects are excluded from the graph entirely.

---

## 8. The visual graph

The work graph is Twin's core data structure. Making it visible and explorable serves three purposes:

1. **Orientation** — the user sees the shape of their work at a glance: which projects are dense with activity, which entities are isolated, where the clusters of blocking relationships are
2. **Discovery** — traversing the graph reveals non-obvious connections: a note that informs a delivery the user forgot about, a person who appears in multiple blocking chains, a decision that unblocked tasks across two projects
3. **Debugging** — when a context pack seems wrong or a proactive proposal is confusing, the user can trace the graph to see what Twin sees

### Graph visualisation approach

Use a force-directed graph rendered on an HTML5 Canvas via `@antv/g6` (AntV G6). G6 is chosen over D3-force or cytoscape.js because it provides:
- Built-in support for large graphs (1000+ nodes) with WebGL rendering
- Combo/group nodes (for grouping entities by project)
- Built-in minimap, zoom, pan, and fisheye lens
- Tree and radial layout modes alongside force-directed
- Edge bundling to reduce visual clutter
- First-class TypeScript support
- Active maintenance (Ant Group)

### Node types and visual encoding

Each entity kind has a distinct shape and colour:

| Entity kind | Shape | Colour | Size encoding |
|---|---|---|---|
| `project` | Rounded rectangle (combo/group) | Slate/neutral | Fixed — contains child nodes |
| `task` | Circle | Blue (todo), Amber (in_progress), Red (blocked), Green (done) | Fixed |
| `delivery` | Diamond | Purple | Scales with number of linked tasks |
| `decision` | Hexagon | Teal (active), Grey (superseded) | Fixed |
| `note` | Square | Light grey | Fixed |
| `person` | Circle with avatar ring | Orange | Scales with number of connections |
| `open_question` | Triangle | Yellow (open), Grey (resolved) | Fixed |
| `session` | Pill/stadium | Pink | Fixed |

### Edge types and visual encoding

| Relationship | Line style | Colour | Arrow |
|---|---|---|---|
| `blocks` | Solid, thick | Red | Directed → |
| `unblocks` | Dashed | Green | Directed → |
| `informs` | Solid, thin | Grey | Directed → |
| `delivers` | Solid, medium | Purple | Directed → |
| `involves` | Dotted | Orange | Undirected |
| `belongs_to` | (Implicit via combo grouping) | — | — |
| `supersedes` | Dashed | Grey | Directed → |
| `raises` | Solid, thin | Yellow | Directed → |

### Layout modes

**1. Force-directed (default):** All entities repel each other; relationships create attraction. Projects form natural clusters. Blocked chains become visible as connected subgraphs with red edges. Good for exploring the overall shape.

**2. Project-grouped:** Entities are grouped into combo nodes by project. Inter-project edges (a person involved in two projects, a decision that unblocks tasks in another project) become visible as cross-group connections. Good for understanding project boundaries.

**3. Timeline:** Entities are positioned on an x-axis by creation date. Relationships span across time. Good for understanding the chronological evolution of a project.

**4. Focus mode:** A single entity is selected and the graph shows only its N-hop neighbourhood (default: 2 hops). Everything else fades. Good for understanding the context around one specific task, decision, or person.

### Interaction

**Hover:** Shows a tooltip with entity details (title, status, dates, key fields).

**Click:** Selects the entity. The detail panel (right side) shows full entity content. For a note, this shows the full markdown. For a task, this shows all fields with inline edit controls.

**Double-click:** Enters focus mode centered on that entity.

**Right-click:** Context menu with actions: "Open in editor", "Dispatch from here" (pre-fills objective), "Show in list view", "Archive" (for projects/decisions).

**Filter controls (top bar):**
- Toggle entity kinds on/off (hide all notes, show only tasks and deliveries)
- Filter by project
- Filter by status (show only blocked, show only active decisions)
- Filter by date range
- Search by title (highlights matching nodes)

**Edge filter:** Toggle relationship types. Turn off `informs` and `involves` to see only blocking/unblocking chains. Turn off everything except `delivers` to see the delivery dependency tree.

### Graph view integration

The graph view is a top-level view in the sidebar, alongside "Today's focus" and "Inbox":

```
Twin
────────────────
○  Today's focus
○  Work graph
○  Inbox  [3]

PROJECTS
●  Municipality platform
○  Internal tooling
...
```

It is also accessible as a panel within any project view, showing only that project's subgraph.

### Performance considerations

- **Render budget:** G6 with WebGL handles 1000+ nodes at 60fps. A typical twin folder with 2-3 active projects, 20-30 tasks, 10-15 deliveries, 30+ notes, and 10+ people produces ~100 nodes — well within budget.
- **Incremental update:** When the work graph changes, the visual graph updates incrementally (add/remove/update individual nodes and edges) rather than re-laying-out the entire graph. G6 supports this natively.
- **Lazy rendering:** The graph view only runs the layout algorithm when the view is open. Switching away suspends rendering.

### Graph data transform

```typescript
function workGraphToG6(graph: WorkGraph): { nodes: G6Node[]; edges: G6Edge[]; combos: G6Combo[] } {
  const combos = graph.entities
    .filter(e => e.kind === 'project')
    .map(p => ({ id: p.slug, label: p.name }))

  const nodes = graph.entities
    .filter(e => e.kind !== 'project')
    .map(entity => ({
      id: entity.id,
      label: entityTitle(entity),
      type: shapeForKind(entity.kind),
      style: styleForEntity(entity),
      comboId: entityProject(entity) || undefined,
    }))

  const edges = graph.relationships.map(rel => ({
    source: rel.from.id,
    target: rel.to.id,
    label: rel.type,
    style: styleForRelationship(rel.type),
  }))

  return { nodes, edges, combos }
}
```

---

## 9. Internal agent runtime

Twin has six internal agents. Each runs as a called function, not a background process. They are invoked by events and return structured outputs. No agent writes to canonical files directly. All writes go through Validator then State Updater.

The agents share no mutable state between invocations. Each receives the current work graph snapshot as input.

### API call budget and model selection

| Agent | Model | Typical input | Typical output | Calls/day (est.) |
|---|---|---|---|---|
| Resolver | Haiku 4.5 | ~2,000 tokens | ~500 tokens | 5-15 |
| Planner | Haiku 4.5 | ~3,000 tokens | ~400 tokens | 3-8 |
| Prioritiser | Sonnet 4.5 | ~4,000 tokens | ~800 tokens | 1-3 |
| Composer | Sonnet 4.5 | ~3,000 tokens | ~2,000 tokens | 2-5 |
| Reconciler | Haiku 4.5 | ~2,000 tokens | ~500 tokens | 1-3 |
| CLAUDE.md gen | Haiku 4.5 | ~3,000 tokens | ~1,000 tokens | 1-3 |

**Estimated daily cost:** ~$0.10-0.30/day with prompt caching. ~$3-9/month. Prompt caching (1-hour TTL) applies to system prompts and recurring context pack structures, reducing input costs by ~60% on cache hits.

**Retry policy:** On transient errors (429, 500, 503), retry up to 3 times with exponential backoff (1s, 4s, 16s). On persistent failure, surface the error and continue with degraded functionality.

**Timeout:** 30 seconds per call.

**Token counter:** Running token count displayed in status bar.

---

### Agent 1 — Resolver

**Purpose:** Convert raw events (captures, conversation imports, file appearances) into typed observations.

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
    evidence: string
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
- `high`: auto-apply — user sees a notification and can undo within 10 seconds
- `medium`: propose to user — one-click accept
- `low`: present for manual review with evidence highlighted

---

### Agent 2 — State Updater

**Purpose:** Apply validated delta operations to canonical files. The only agent that writes to files. No LLM call — purely mechanical.

**Concurrency control:** Before writing any file, checks mtime against the value recorded when the graph was last built. If changed (external edit):
1. Re-reads and re-parses the file
2. Checks whether the delta still applies cleanly
3. If clean: applies to fresh content
4. If conflict: surfaces "File was modified externally — review before applying" with a diff view

**Behaviour per operation:**

| Operation | File action |
|---|---|
| `create_task` | Append entry to `tasks.yaml`, generate ULID |
| `update_task_status` | Find entry by ID, update status |
| `mark_blocked` / `mark_unblocked` | Update blocked_by and waiting_on by ID |
| `append_decision` | Append entry to `decisions.yaml`, generate ULID |
| `supersede_decision` | Set old decision to `superseded`, set `superseded_by` |
| `create_delivery` | Append entry to `deliveries.yaml`, generate ULID |
| `update_delivery_status` | Update status in `deliveries.yaml` by ID |
| `create_note` | Write new file to `projects/[slug]/notes/` |
| `add_open_question` | Append to note, generate ULID |
| `resolve_question` | Update status to `resolved` |
| `link_note_delivery` | Update `linked_delivery` frontmatter |
| `upsert_person` | Add or update in `people.yaml` |
| `archive_project` | Move project folder to `~/twin/archive/`, set status |

**After each write:** Notifies graph to re-derive. Marks project CLAUDE.md as stale.

---

### Agent 3 — Planner

**Purpose:** Given a user objective and the current work graph, decide what to do next.

**Triggers:** User states an objective. Also runs after every Reconciler cycle.

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

**Purpose:** Generate the daily focus brief and proactive proposals. Operates across all active projects.

**Triggers:** Focus view load (once per session, or on explicit refresh). Also runs after Reconciler cycles.

**Inputs:** Work graph (all active projects) + current date.

**Output schema:**
```typescript
type PrioritiserOutput = {
  brief: string
  priority_items: Array<{
    title: string
    project: string
    reasoning: string
    next_action: string
    entity_refs: ULID[]
  }>
  proactive_proposals: Array<{
    proposal: string
    trigger_reason: string
    proposed_delta: DeltaOperation | null
    entity_refs: ULID[]
  }>
}
```

**Proactive checks:**

| Condition | Proposed action |
|---|---|
| Task `waiting_on` a person ≥ 2 days | Draft follow-up to that person |
| Decision appended → tasks reference unblocked item | Mark tasks unblocked, elevate priority |
| Delivery status → `in_review` | Propose review checklist note |
| Open question resolved via import | Mark resolved, propose next dispatch |
| Delivery due in ≤ 2 days, status still `draft` | Elevate in focus, propose dispatch_cowork |
| Decision has been `active` ≥ 30 days with no referencing entity changes | Flag for review: still relevant? |

Proposals are never applied without confirmation. Dismissed proposals are not re-shown unless the underlying condition changes (detected by comparing entity state at dismissal time vs current state).

---

### Agent 4 — Composer

**Purpose:** Render a complete context pack for a dispatch target and objective.

**Trigger:** Planner recommends dispatch and user confirms, OR user triggers quick-dispatch.

**Inputs:** Dispatch target + objective + selected entity refs + work graph + global context.

**Decision filtering:** When assembling decisions for context packs, the Composer includes only `active` decisions by default. Superseded decisions are excluded unless they are explicitly selected by the user in the source review.

**Output:**
```typescript
type ContextPack = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string
  selected_sources: EntityRef[]
  entity_id_map: Record<ULID, string>  // id → title
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
```

**Side effect on dispatch:** Triggers CLAUDE.md regeneration if stale.

The writeback contract is embedded at the bottom of every brief with an ID-to-title mapping so agents can reference tasks by ID:

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

---

### Agent 5 — Reconciler

**Purpose:** Turn a session manifest into proposed state deltas.

**Trigger:** File watcher detects a new `*-manifest.yaml` in `~/twin/sessions/`.

**Inputs:** Session manifest + original ContextPack + current work graph.

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

**ID resolution strategy:**
1. Validate ID exists in graph
2. If title only: exact match → fuzzy match (Levenshtein ≤ 3, or substring)
3. One fuzzy match: propose with `medium` confidence
4. Multiple/no matches: add to `unresolved` with `needs_user_input: true`

---

### Agent 5b — Validator

**Purpose:** Rule-based correctness checks before State Updater applies deltas. No LLM call.

**Checks:**
- Entity ID exists in graph before any update operation
- Project slug is valid
- Decision ID is not a duplicate (warn, do not block)
- Delivery ID exists before `update_delivery_status`
- Person name is non-empty
- No circular blocking (task A blocks B blocks A)
- ULID format validation
- `supersede_decision` target exists and is currently `active`

Failed operations are shown to the user — never silently dropped.

---

## 10. The three dispatch targets

All three flows share the same entry point, but each has a **quick path** and a **full path**.

### Quick dispatch (< 30 seconds)

From any view, `Cmd+D` opens the dispatch bar (similar to Spotlight):

```
┌──────────────────────────────────────────────────┐
│  What do you want to accomplish?                  │
│  [ ____________________________________________ ] │
│                                                    │
│  Suggested:                                        │
│    ⌘1  Decide the data framework          → Chat  │
│    ⌘2  Draft the TCO one-pager           → Cowork │
│    ⌘3  Debug the ETL pipeline setup      → Code   │
│                                                    │
│  [ Chat ]  [ Code ]  [ Cowork ]                   │
└──────────────────────────────────────────────────┘
```

Selecting a suggestion or typing + pressing Enter:
1. Planner runs (< 3 seconds with Haiku)
2. Composer assembles the brief with auto-selected sources
3. Brief is copied to clipboard AND shown in a slide-over preview
4. User is done — switch to the target agent and paste

No source review, no confirmation dialogs. The full path exists for users who want control.

### Full dispatch path

1. User states an objective
2. Planner recommends a target and selects context sources
3. User reviews source checklist — individual items can be deselected/added
4. User overrides target if desired
5. Composer assembles ContextPack (triggers CLAUDE.md regen if stale)
6. Brief shown in preview panel
7. User copies brief (Chat) or Twin writes to project CLAUDE.md (Code/Cowork)
8. ContextPack saved to `~/twin/sessions/`

### Automatic writeback detection

After dispatch, Twin enters **session tracking mode** for that session ID:
- For Code/Cowork: file watcher monitors for `[session_id]-manifest.yaml`
- For Chat: Twin shows a persistent but non-blocking banner: "Session 01JBQ... active — [Quick summary] [Import conversation] [Mark done]"

---

### 10.1 Claude Chat — understanding

**When to use:** Working through a problem, evaluating options, making a decision.

**Brief structure:**
```markdown
## Context for this thinking session
_Session: [session_id] · Scope: project — [project name]_

**Who I am:** [role + expertise, 2 sentences]
**Objective:** [user's stated objective]

## What I already know
[twin_synced notes relevant to this objective — 3-5 bullet summaries]

## Decisions already made
[active decisions relevant to this objective, with IDs]

## What I'm uncertain about
[open questions from the graph, with IDs]

## Key constraints
[from context.md and reference notes]

---
## Session writeback instructions
[writeback contract with entity ID mapping]
```

**Writeback — four paths, ordered by friction:**

1. **Session-end prompt (lowest friction, ~10 seconds):** When the user clicks "Mark done" on the session banner (or Twin detects the Chat tab/window lost focus after >5 minutes), a modal appears:

   ```
   ┌─────────────────────────────────────────────┐
   │  What came out of this session?              │
   │                                               │
   │  [ Quick summary — 1-3 sentences ]           │
   │                                               │
   │  ☐ Decisions were made                        │
   │  ☐ New tasks identified                       │
   │  ☐ Nothing actionable — just thinking         │
   │                                               │
   │  [ Save ]  [ Import full conversation ]       │
   └─────────────────────────────────────────────┘
   ```

   If "Nothing actionable" is checked: session is marked `completed`, no Resolver call. If summary text is provided: Resolver extracts observations from the summary + original context pack. If checkboxes are checked: Resolver is primed to look for those specific types.

2. **Clipboard auto-detect (~15 seconds):** When Twin gains focus after a Chat dispatch with conversation-like content on clipboard, Twin offers "Import this conversation?" Clicking triggers the full Resolver extraction.

3. **Quick summary text (~20 seconds):** The session banner includes an inline text field. Type a few sentences and hit Enter. Resolver extracts.

4. **Full conversation import (~90 seconds):** Open import panel, paste full conversation, Extract, review cards, confirm.

**Measurement:** Twin tracks which writeback path is used for each Chat session (or if none is used). This is the most important metric for validating the core hypothesis. See section 27 (Risk register).

---

### 10.2 Claude Code — implementation

**When to use:** Writing code, running scripts, debugging, technical configuration.

**Brief structure:**
```markdown
## Role & expertise
[from global CLAUDE.md]

## Project context
[from context.md]

## Current focus
[tasks with status=in_progress or todo, ordered by priority, with IDs]

## Architecture decisions already made
[active decisions — technical only, with IDs]

## Open technical questions
[blocked tasks, unanswered questions, with IDs]

## Blocked items
[tasks with waiting_on or blocked_by, with IDs]

## Deliveries in progress
[deliveries with type=spec or type=code, with IDs]

## Pick up here
[one sentence: what to start doing immediately]

---
_Full context available in this folder:_
_tasks.yaml · deliveries.yaml · decisions.yaml · notes/_

## Session writeback instructions
[writeback contract with ID mapping]
```

**Writeback:** Claude Code writes a manifest to `~/twin/sessions/[session_id]-manifest.yaml`. The Code brief also instructs:
```
At the end of this session, write your full session manifest to the path in the
writeback instructions. Twin's Reconciler will extract decisions and apply them
to decisions.yaml — you do not need to edit decisions.yaml directly.
```

---

### 10.3 Claude Cowork — delivery

**When to use:** Producing a formatted output — deck, document, report, brief, communication.

**Brief structure:**
```markdown
## Delivery brief

**What to produce:** [delivery title] — [type]
**What done looks like:** [delivery.brief]
**Due:** [due_date]

## Audience & tone
[from context.md]

## Source materials
- notes/2026-03-17-tech-stack-decision.md
- notes/2026-03-16-stakeholder-alignment.md

## Decisions already made
[active decisions, with IDs]

## Format requirements
[length, structure, format, what to avoid]

## Who I am
[role and relevant expertise]

---
_All source files are in this folder. Read them before starting._

## Session writeback instructions
[writeback contract with ID mapping]
```

**Writeback:** File watcher detects new output files in the project folder. Twin prompts to link to a delivery and update status. Cowork also writes a manifest. Reconciler processes both.

---

## 11. The scope and objective model

### Objective-based dispatch (default)

Dispatch begins with an objective. The user types freely or picks a Planner suggestion. The objective drives target recommendation, source selection, and writeback expectations.

### Scope override

| Scope | What the AI receives | Use when |
|---|---|---|
| `me` | Global CLAUDE.md only | Starting something genuinely new |
| `project` | Global CLAUDE.md + full project context | Working within a known project |
| `note` | Global CLAUDE.md + one specific note | Clean-room conversation on one topic |

Before dispatch, the user sees a checklist of included entities. Individual items can be deselected.

---

## 12. The focus view

The focus view is the landing screen. It answers: what do I actually work on today?

### Components

**Date and state header** — today's date, active projects count, inbox count, API token spend.

**AI priority brief** — generated by the Prioritiser. One direct paragraph naming projects, deadlines, blockers. 2-4 prioritised items with reasoning and next actions.

**Proactive proposals panel:**
```
● Thomas hasn't responded in 3 days (infra cost estimate)
  → Draft follow-up?    [ Draft ] [ Dismiss ]

● Decision made: Polars confirmed
  → 2 tasks can now be unblocked. Apply?    [ Review (2) ] [ Dismiss ]

● Q2 pitch deck due in 2 days — still draft
  → Dispatch to Cowork?    [ Dispatch ] [ Dismiss ]

● "Cloud inference considered" decision is 30+ days old with no recent activity
  → Still relevant?    [ Keep ] [ Mark superseded ]
```

**Open items list** — all tasks across active projects, sorted: overdue → due today → high priority → medium. Shows title, project, due date, status, blocking info.

**Inbox badge** — count of unprocessed captures.

**Quick dispatch bar** — `Cmd+D` accessible from this view.

---

## 13. Capture

### Capture strip

Persistent at the bottom of focus and notes views. Placeholder: `Capture a thought, task, or decision… Enter to save`.

**On Enter:**
1. File written to `~/twin/inbox/[timestamp]-[slug].md` immediately
2. Input clears. Green border flash.
3. Resolver runs in background (non-blocking)

Nothing blocks the capture.

### Global keyboard shortcut

`Cmd+Shift+Space` opens a floating capture window from anywhere on the OS.

**macOS permissions note:** This requires Accessibility permission. On first launch, Twin guides the user through System Settings > Privacy & Security > Accessibility. On macOS Sequoia, this permission may need to be re-granted after updates. Twin checks permission status on launch using `tauri-plugin-macos-permissions` and shows a helpful prompt if revoked.

**Fallback:** If the user declines Accessibility permission, capture is still available from within the Twin window. The global shortcut is a convenience, not a hard requirement.

### Resolver interpretation (background)

After capture, Resolver runs against the new text and current work graph. Proposed deltas are written back as frontmatter. If the API call fails, the capture is preserved as-is — triage shows manual classification controls.

---

## 14. Inbox triage

Reads all files in `~/twin/inbox/` chronologically. Goal: clear the inbox in under 2 minutes.

**For each item:**
- Raw capture text (large, readable)
- Resolver's interpretation (if available): type badge, title, project, proposed delta
- If Resolver failed: manual classification controls (project picker, type selector, title field)
- Three actions: `Accept`, `Edit`, `Discard`

**Accept:** File moved to `projects/[slug]/notes/`. Delta applied via State Updater.

**Edit:** Inline form pre-filled with Resolver output. Confirm moves and applies.

**Discard:** Deletes the inbox file.

---

## 15. Conversation import

Accepts any pasted text — Claude Chat, ChatGPT, email, Slack. Resolver extracts. User reviews and approves.

### Import flow

1. Open import panel
2. Paste text
3. Select target project
4. Click Extract
5. Resolver returns structured extraction
6. Review screen with cards by type

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

**On confirm:** State Updater creates a `chat_learning` note, appends ticked decisions to `decisions.yaml`, appends ticked tasks to `tasks.yaml`.

---

## 16. The Twin app — views and navigation

### Sidebar

```
Twin
────────────────
○  Today's focus
○  Work graph
○  Inbox  [3]

PROJECTS
●  Municipality platform
○  Internal tooling
○  Personal / meta

+ New project

────────────────
[ me | project | note ]
Scope override

● Twin active  ·  $0.12 today
```

### Views

| View | Description |
|---|---|
| Today's focus | Priority brief + proactive proposals + open items + quick dispatch |
| Work graph | Interactive visual graph of all entities and relationships |
| Inbox | Triage view for unprocessed captures |
| Project — notes | Note list, sorted by updated |
| Project — tasks | Task list, filterable by status |
| Project — deliveries | Delivery list with status and due dates |
| Project — graph | Project-scoped subgraph |
| Note editor | Markdown editor left, scoped chat assistant right |
| Conversation note | Structured form: people picker, discussed/agreed/questions |
| Dispatch | Objective input → Planner → Composer → preview → send |
| Import | Paste → Resolver extraction → review → confirm |
| Sessions | History of dispatched sessions and reconciliation status |
| Settings | Global context editor, keyboard shortcut config, people management, archival |

### Note editor

Split view. Left: markdown textarea with title, type selector, twin toggle, linked delivery picker. Right: scoped chat assistant grounded in the current note and project context. Conversations are ephemeral. "Save to note" from assistant messages.

### Conversation note UI

When type is `conversation`, the left pane switches to a structured form:
```
People:  [ Thomas × ]  [ + Add person ▾ ]
Date:    [ 2026-03-17 ]

What did you discuss?
[ _____________________________________________ ]

What was agreed or decided?
[ _____________________________________________ ]
☑ Append agreed items to decisions.yaml

Open questions?
[ _____________________________________________ ]
```

### Dispatch view

Full path — see section 10. Quick path: `Cmd+D` from any view.

---

## 17. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| App shell | Tauri 2.x | Native macOS, full filesystem access, 3-8MB bundle, 20-40MB RAM |
| Frontend | React 18 + TypeScript + Vite | Fast dev cycle, strong typing |
| Styling | Tailwind CSS | Rapid iteration |
| Graph visualisation | `@antv/g6` v5 | WebGL rendering, combo nodes, minimap, fisheye, TypeScript-first |
| Frontmatter parsing | `gray-matter` | Battle-tested YAML frontmatter |
| YAML parsing | `yaml` (eemeli/yaml) | Round-trip with comment preservation |
| Markdown rendering | `markdown-it` | CommonMark compliant, safe defaults, rich plugin ecosystem |
| AI calls | `@anthropic-ai/sdk` | Official SDK, streaming, prompt caching |
| IDs | `ulid` | Sortable by creation time |
| Fuzzy matching | `uFuzzy` | Short-phrase matching for Reconciler task-title fallback (4kb, transparent scoring) |
| Clipboard monitoring | `tauri-plugin-clipboard` (CrossCopy) | Event-based clipboard change detection |
| macOS permissions | `tauri-plugin-macos-permissions` | Check Accessibility permission status |
| File watching | Tauri `fs` plugin (watch) | Detects agent writebacks |
| Global shortcut | Tauri `global-shortcut` plugin | OS-level capture hotkey |
| Filesystem | Tauri `fs` plugin | Read/write `~/twin/` |

### No backend, no database

All data lives in `~/twin/`. The only network calls are to the Anthropic API.

### The `fs.ts` layer

All filesystem operations go through one module:

```typescript
export const fs = {
  // Projects
  listProjects(): Promise<ProjectEntity[]>
  readProject(slug: string): Promise<ProjectEntity>

  // Notes
  listNotes(projectSlug: string): Promise<NoteEntity[]>
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

  // Decisions (YAML with lifecycle)
  readDecisions(projectSlug: string): Promise<DecisionEntity[]>
  readActiveDecisions(projectSlug: string): Promise<DecisionEntity[]>
  appendDecision(projectSlug: string, entry: DecisionEntity): Promise<void>
  supersedeDecision(projectSlug: string, oldId: ULID, newId: ULID): Promise<void>

  // Generated files
  writeProjectCLAUDE(projectSlug: string, content: string): Promise<void>
  writeGlobalCLAUDE(content: string): Promise<void>

  // Sessions
  writeSessionPack(pack: ContextPack): Promise<void>
  readSessionManifest(sessionId: ULID): Promise<SessionManifest>
  listSessions(limit?: number): Promise<SessionEntity[]>

  // Archival
  archiveProject(slug: string): Promise<void>
  archiveSessions(olderThan: ISODate): Promise<number>

  // File metadata
  getMtime(path: string): Promise<number>
}
```

---

## 18. TypeScript types

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
type DecisionStatus = 'active' | 'superseded'
type QuestionStatus = 'open' | 'resolved'
type DispatchTarget = 'chat' | 'code' | 'cowork'
type DispatchScope = 'me' | 'project' | 'note'
type Confidence = 'high' | 'medium' | 'low'

// Relationship types (see section 7)
type RelationshipType =
  | 'blocks' | 'unblocks' | 'informs' | 'produces'
  | 'involves' | 'belongs_to' | 'supersedes' | 'delivers' | 'raises'

// Work graph
type WorkGraph = {
  entities: WorkGraphEntity[]
  relationships: Relationship[]
  built_at: number
  file_mtimes: Record<string, number>
}

// Session types
type ContextPack = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  brief_markdown: string
  selected_sources: EntityRef[]
  entity_id_map: Record<ULID, string>
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
    supersedes?: ULID
  }>
  tasks_created: Array<{
    title: string
    priority: 'high' | 'medium' | 'low'
    due_date?: ISODate
    waiting_on?: string
  }>
  tasks_updated: Array<{
    id?: ULID
    title?: string              // fallback for fuzzy matching
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
  resolver_error?: string
}

type ConversationNote = Note & {
  type: 'conversation'
  people: string[]
  date: ISODate
  discussed: string
  agreed: string
  open_questions: string
}

// Session tracking
type ActiveSession = {
  session_id: ULID
  target: DispatchTarget
  objective: string
  dispatched_at: ISOTimestamp
  writeback_received: boolean
  writeback_path: 'session_end' | 'clipboard' | 'quick_summary' | 'full_import' | null
}
```

---

## 19. CLAUDE.md generation

Twin marks a project's CLAUDE.md as **stale** whenever:
- A task status changes
- A delivery status changes
- A new decision is appended
- A decision is superseded
- A note is marked twin_synced

**Regeneration happens on dispatch** (Composer triggers it if stale) **or on explicit request**. The generation prompt filters to active decisions only.

### Generation prompt

```
Given the following project files, generate a concise, structured CLAUDE.md brief
for an AI agent session. The brief tells an agent what it needs to know to start
working on this project without asking clarifying questions.

context.md:
[full content]

tasks.yaml:
[full content — IDs visible]

deliveries.yaml:
[full content]

decisions.yaml (active decisions only, last 10):
[active entries only]

Twin-synced notes (title + first 200 chars):
[NoteEntity[] where twin_synced=true]

Generate using exactly this structure:
# Project context — [name]
_Generated by Twin · [date]_

## Project overview
## Current focus
## Open decisions  (active only)
## Blocked items  (include task IDs)
## Deliveries in progress  [table]
## Key constraints
## Pick up here

End with:
---
_Source files: context.md · tasks.yaml · deliveries.yaml · decisions.yaml · notes/_
_Do not edit this file — it is regenerated by Twin._
_Append decisions to decisions.yaml. Edit tasks in tasks.yaml._
```

---

## 20. Error handling and degraded states

Twin is designed to run all day. Errors will happen. Principle: **surface the problem, preserve the data, continue operating.**

### API failures

| Scenario | Behaviour |
|---|---|
| Resolver fails during capture | Capture preserved in inbox without AI interpretation. Manual classification available. |
| Resolver fails during import | "AI extraction unavailable — try again or classify manually." |
| Planner fails on dispatch | "Could not generate recommendation — select target and sources manually." |
| Prioritiser fails on focus load | Focus view shows open items list (data-driven, no API). "Priority brief unavailable — tap to retry." |
| Composer fails | "Could not generate brief — try again." |
| CLAUDE.md generation fails | Stale flag remains. On next dispatch, retried. If still failing, last good version used with warning. |
| Rate limit (429) | Retry with backoff (1s, 4s, 16s). After 3 retries, surface error. |

### File system errors

| Scenario | Behaviour |
|---|---|
| `tasks.yaml` invalid YAML | Graph skips file with warning badge on project. |
| Note frontmatter malformed | Note appears with warning icon. Body still readable. |
| Manifest references unknown session | Added to `unresolved`. |
| External tool deletes watched file | Graph removes entity. Pending deltas fail with explanation. |
| File write conflict | See State Updater concurrency control (section 9). |

### Partial graph construction

If some files are unparseable, Twin:
1. Builds graph from parseable files
2. Shows notification: "N files could not be parsed"
3. Adds warning badges to affected projects
4. Never refuses to start

---

## 21. Data lifecycle and archival

### The staleness problem

After months of use, the `~/twin/` folder accumulates stale data: completed tasks, delivered deliveries, superseded decisions, finished projects. This degrades AI quality — context packs include irrelevant information, the Prioritiser wastes tokens on dead entities, the visual graph becomes cluttered.

### Automatic staleness detection

The Prioritiser flags entities for review based on these rules:

| Condition | Proposal |
|---|---|
| All tasks in a project are `done` for ≥ 7 days | "Archive project [name]?" |
| A delivery has been `delivered` or `archived` for ≥ 14 days | "Remove from active view?" |
| A decision has been `active` ≥ 30 days with no referencing entity changes | "Still relevant? Mark superseded?" |
| A `waiting_on` has not changed in ≥ 7 days | "Still waiting? Follow up or remove blocker?" |
| Sessions older than 30 days | Auto-archive (no prompt, non-destructive) |

### Project archival

`archive_project` delta operation:
1. Sets project status to `archived`
2. Moves the project folder from `~/twin/projects/[slug]/` to `~/twin/archive/[slug]/`
3. Removes all project entities from the graph
4. Project no longer appears in sidebar, focus view, or visual graph
5. Fully reversible — move folder back to `projects/` and Twin picks it up on next graph build

### Session archival

Sessions older than 30 days are moved to `~/twin/archive/sessions/`. The session history view shows archived sessions with a toggle.

### Context pack freshness

The Composer applies these filters when assembling context packs:
- Tasks: include `todo`, `in_progress`, `blocked` only. Exclude `done` unless completed within last 7 days.
- Decisions: include `active` only. Exclude `superseded`.
- Deliveries: include `draft`, `in_progress`, `in_review`. Exclude `delivered` and `archived`.
- Notes: include only `twin_synced: true`. Sort by `updated`, include most recent N (default: 10).
- Sessions: include last 5 sessions for the project.

---

## 22. MVP feature list

### Must have — prototype gates

| Feature | Why it's required |
|---|---|
| `~/twin/` folder scaffold on first launch | Foundation for everything |
| Work graph construction from YAML and markdown | All agents operate over this |
| Visual graph rendering (force-directed, G6) | Core differentiator — the user sees their work state |
| State Updater + Validator with concurrency control | Safe, traceable writes |
| Resolver — capture and import pipeline | Makes sparse input intelligent |
| Planner — objective-based dispatch | Core of the agentic claim |
| Prioritiser — focus brief and proactive proposals | Daily value proposition |
| Composer — context pack generation with ID mapping | Consistent, traceable briefs |
| Reconciler — session manifest processing with fuzzy ID resolution | Closes the writeback loop |
| Quick dispatch (`Cmd+D`) | Dispatch must be < 30 seconds or it won't happen |
| Global keyboard shortcut (`Cmd+Shift+Space`) | Capture friction kills the habit |
| Capture strip + inbox file creation | Core capture mechanic |
| Inbox triage with Resolver proposals + manual fallback | Where captures become structured data |
| Conversation import — paste + extract + review | Chat sessions produce persistent context |
| Chat writeback — session-end prompt + clipboard auto-detect + quick summary + full import | Four paths to close the Chat loop |
| Chat writeback tracking (which path used per session) | Critical metric for hypothesis validation |
| Conversation note type + structured UI | Captures human conversation context |
| People model (`people.yaml`) + picker | Required for conversation notes and graph |
| Project CRUD + folder creation | Context boundary for everything |
| Note editor with frontmatter controls | Primary surface for longer thinking |
| Twin toggle per note | Explicit context opt-in |
| Task list read/write (YAML) | Required for Planner reasoning |
| Delivery list read/write (YAML) | Gives tasks a "why" |
| Decision log with lifecycle (active/superseded) | Context packs need fresh decisions only |
| Focus view with priority brief + proactive proposals + staleness detection | Core value proposition |
| Dispatch to Chat — ContextPack + copy | Validates Chat dispatch flow |
| Dispatch to Code — ContextPack + write to folder | Validates Code dispatch flow |
| Dispatch to Cowork — ContextPack + write to folder | Validates Cowork dispatch flow |
| Session pack saved to `sessions/` | Traceability |
| Session manifest detection + Reconciler | Closes Code and Cowork loops |
| CLAUDE.md generation per project (on dispatch) | The filesystem integration |
| File watcher for agent writebacks | Detects manifests and output files |
| Project archival mechanism | Data lifecycle management |
| Error handling — API failures with graceful degradation | Tool must survive bad network days |
| Token usage counter in status bar | Cost visibility |
| macOS Accessibility permission check + guide | Global shortcut requires this |

### Nice to have

| Feature | Notes |
|---|---|
| Graph timeline layout mode | Chronological entity positioning |
| Graph focus mode | N-hop neighbourhood around selected entity |
| Scope override toggle | Advanced — objective-based is the default |
| Decisions log view in UI | Currently append-only via writeback |
| Note-to-delivery linking UI | Via frontmatter, but UI makes it easier |
| Auto-generated note titles | From first sentence of body |
| Git init on folder creation | Free version history |
| Context.md editor in UI | Currently edited manually or by Cowork |
| Sessions view with reconciliation status | Useful for debugging |
| Dark mode | CSS variables already support it |
| Session archival (30-day auto) | Non-blocking, improves long-term perf |

### Explicitly out of scope

- Non-Claude agents (Cursor, ChatGPT, Notion AI, etc.)
- Import from external tools (Obsidian, Notion, Linear) — v2
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

## 23. Build order

Build in this sequence. Each step has a gate. Do not skip ahead. Implementation is via Claude Code — each step maps to one or more Claude Code sessions with the relevant context pack.

### Phase 1 — Foundation (week 1-2)

#### Step 1 — Tauri shell + folder scaffold (~4h)

Bootstrap the Tauri app. On first launch, create `~/twin/` with all required files and seed data. Write `fs.ts` with YAML and markdown parsing. Configure Tauri capabilities for filesystem access.

**Gate:** Can the app read a task from `tasks.yaml` and a note with correct frontmatter parsing and IDs?

#### Step 2 — Work graph construction (~6h)

Write `buildGraph()`. Parse all file types into typed entities with ULIDs. Derive relationships. Store file mtimes. Test with seed data.

**Gate:** Does the graph correctly represent typed entities with relationships? Are IDs consistent? Are archived projects excluded?

#### Step 3 — State Updater + Validator (~6h)

Delta operations (all ID-based). Validator with ULID format checks. State Updater with mtime conflict detection. All 14 delta operation types.

**Gate:** All delta types work. Conflict detection surfaces external edits. Validator rejects invalid operations.

#### Step 4 — Visual graph — basic rendering (~8h)

Integrate G6. Transform `WorkGraph` → G6 format. Force-directed layout with combo nodes for projects. Node shapes and colours per entity kind. Edge styles per relationship type. Zoom, pan, hover tooltips. Click to select.

**Gate:** The seed project's entities render as a readable, interactive graph. Clicking a node shows its details.

### Phase 2 — AI agents + capture (week 3-4)

#### Step 5 — Resolver agent (~8h)

Wire Resolver prompt with Anthropic API. Retry logic and error handling. Test against 10+ real captures. Categorical confidence calibration. Delta review UI with evidence quotes. Manual classification fallback.

**Gate:** Real captures are correctly classified. API failure falls back gracefully. Confidence categories are meaningful.

#### Step 6 — Capture + inbox (~4h)

Global shortcut with Accessibility permission check. Capture strip writes to inbox. Resolver runs async. Inbox triage view.

**Gate:** Capture from another app in under 5 seconds. Triage 5 items in under 2 minutes.

#### Step 7 — Project sidebar + views (~6h)

Project list from filesystem. Note list, task list, delivery list per project. Inline status editing via State Updater. Graph re-derives on changes.

**Gate:** Edit a task status in UI. Does `tasks.yaml` update? Does the graph update? Do IDs remain stable?

### Phase 3 — Planning + dispatch (week 4-5)

#### Step 8 — Planner + Prioritiser + focus view (~10h)

Wire both agents with different models (Haiku for Planner, Sonnet for Prioritiser). Focus view with brief, proactive proposals, staleness detection. Token counter. Quick dispatch bar (`Cmd+D`).

**Gate:** Prioritiser identifies the most urgent item. Planner recommends the right dispatch target. API failure still shows the open items list. Staleness proposals appear for old entities.

#### Step 9 — Composer + dispatch (~8h)

Both quick path (< 30 seconds) and full path. Context pack assembly with entity ID mapping. Decision filtering (active only). Brief preview. Clipboard copy. CLAUDE.md regen on dispatch if stale.

**Gate:** Quick dispatch completes in under 30 seconds. Brief includes correct ID mapping. Chat brief is useful when pasted without further explanation.

#### Step 10 — Reconciler + session tracking (~8h)

File watcher for manifests. Reconciler with fuzzy ID resolution. Delta review UI reused from Resolver. Session tracking mode with banner for active sessions.

**Gate:** Manifest with correct IDs is reconciled automatically. Manifest with title-only is fuzzy-matched. Session banner appears after dispatch.

### Phase 4 — Conversation + writeback (week 5-6)

#### Step 11 — Chat writeback — all four paths (~8h)

Session-end prompt modal. Clipboard auto-detect (CrossCopy plugin). Quick summary inline. Full conversation import. Writeback path tracking per session.

**Gate:** Each writeback path works. Path selection is logged. Session-end prompt appears at the right time.

#### Step 12 — Conversation notes + people model (~4h)

`people.yaml` read/write. People picker. Conversation note UI with three text areas. Agreed → decisions checkbox with ULID generation.

**Gate:** Record a conversation in under 2 minutes. Agreed items appear in `decisions.yaml` with IDs.

#### Step 13 — Note editor + chat assistant (~4h)

Full editor with frontmatter controls. Chat pane with Composer context pack. "Save to note."

**Gate:** Chat assistant knows project context without being told.

### Phase 5 — Polish + lifecycle (week 6-7)

#### Step 14 — Decision lifecycle (~4h)

`supersede_decision` delta operation. UI for marking decisions superseded. Supersession chains in decisions.yaml. Composer filters to active only.

**Gate:** Superseding a decision updates both entries atomically. Context packs exclude superseded decisions.

#### Step 15 — Visual graph — advanced features (~6h)

Project-grouped layout. Filter controls (entity kind, status, relationship type). Search by title. Right-click context menu ("Dispatch from here", "Open in editor"). Edge filtering. Minimap.

**Gate:** Can filter to show only blocking chains. Can right-click a task and dispatch a session with that task as the objective.

#### Step 16 — Data lifecycle + archival (~4h)

Project archival (move to `~/twin/archive/`). Session archival (30-day auto). Context pack freshness filters. Prioritiser staleness proposals.

**Gate:** Archiving a project removes it from the graph and sidebar. Moving it back restores it.

#### Step 17 — CLAUDE.md generation (~3h)

Generation prompt with active-decisions-only filter. Stale flag mechanism. Trigger on dispatch.

**Gate:** Stale CLAUDE.md regenerates before brief assembly.

#### Step 18 — Error handling audit (~4h)

Test every scenario from section 20. Simulate API failures, malformed files, concurrent edits. Verify graceful degradation.

**Gate:** Twin survives with API key revoked. Recovers cleanly when restored.

### Phase 6 — Validation (week 7-8)

#### Step 19 — Integration testing (~4h)

End-to-end flows: capture → triage → dispatch → session → writeback → reconcile. All three dispatch targets. All four Chat writeback paths.

**Gate:** A full capture-to-reconcile loop completes without manual intervention for Code/Cowork.

#### Step 20 — Real-world test week

Use Twin for a full working week. Capture everything. Run focus brief each morning. Dispatch to all three targets. Test Chat writeback paths. Write all observations as inbox captures. **Do not fix anything during the test week.**

After the test week: triage observations, fix critical issues, re-test.

---

## 24. Definition of done

The prototype is complete when all of the following are true:

1. You open Twin on Monday morning and the priority brief tells you what to work on.
2. The visual graph shows your work state — you can trace blocking chains and see cross-project connections.
3. You capture a thought from another app in under 5 seconds using `Cmd+Shift+Space`.
4. You clear a 5-item inbox in under 2 minutes using Resolver proposals.
5. You dispatch a Code session via quick dispatch (`Cmd+D`) in under 30 seconds. The brief is useful — Claude Code starts without clarifying questions.
6. You dispatch a Cowork session. Cowork produces a useful first draft from the project folder.
7. You dispatch a Chat session. The conversation doesn't require re-explaining your situation.
8. After a Chat session, you write back via the session-end prompt in under 15 seconds.
9. After a Code session, the Reconciler proposes correct deltas. Task references resolve by ID.
10. After a Cowork session, Twin detects the output and offers to update the delivery status.
11. You record a colleague conversation in under 2 minutes. Agreed items appear in `decisions.yaml` with stable IDs.
12. The Prioritiser surfaces at least one accurate proactive proposal during the test week.
13. A decision you supersede no longer appears in context packs.
14. Archiving a project cleanly removes it from the graph, sidebar, and focus view.
15. Every change to a canonical file is traceable to a delta operation.
16. All data survives quit and reopen.
17. You could hand a colleague your `~/twin/projects/[slug]/` folder and they'd have enough context to continue.
18. An API outage does not prevent capturing, triaging, or manually editing.
19. Chat writeback adoption is tracked per session — you know the exact rate.

---

## 25. Open questions

| Question | Options | Recommendation |
|---|---|---|
| How does the Chat brief get into Claude Chat? | Clipboard copy / browser extension | Clipboard for v1. Browser extension for v2. |
| Should Resolver run sync or async on capture? | Sync / Async | Always async. Never block the capture. |
| How to handle manifests referencing unknown tasks? | Reject / Fuzzy match / Unresolved | Fuzzy match → user confirms. No match → unresolved. |
| Should proactive proposals expire? | No / After N days / On condition change | On condition change. |
| Should captures auto-assign to active project? | Always inbox / Default to active | Default to active project. Inbox when no project is active. |
| ULID generation for agent-created entities? | Agent generates / Twin generates / Both | Twin generates on import. Agent IDs are suggestions. |
| Maximum entities in visual graph before UX degrades? | 100 / 500 / 1000 | G6 handles 1000+ with WebGL. Archival keeps active graph under 200. |
| Should the graph view persist layout positions? | Reset on open / Persist | Persist within session, reset between sessions. |
| Import from external tools in v1? | Yes / Defer to v2 | Defer. Build the native loop first, then expand intake. |
| Should Twin auto-commit `~/twin/` changes to git? | Yes / Manual / On significant changes | Manual for v1. Auto-commit on significant changes for v2. |

---

## 26. Success metrics

Qualitative for v1. No analytics dashboards. Evaluate after 2 weeks of real use.

**Daily habit formation:** Do you open Twin before anything else in the morning? If yes within 2 weeks, the focus brief earns its place.

**Capture consistency:** Is the inbox never more than 10 items? If yes, capture friction is low enough.

**Dispatch quality:** Count clarifying questions from agents that Twin's brief should have answered. Should approach zero.

**Dispatch speed:** Does quick dispatch (`Cmd+D`) complete in under 30 seconds? If yes, the friction tax is manageable.

**Chat writeback rate:** What fraction of Chat sessions get written back via any path? Target above 60%. **This is the most critical metric.** Track per-path breakdown:
- Session-end prompt: target 40%+ of Chat sessions
- Quick summary: target 15%+
- Clipboard auto-detect: target 5%+
- Full import: target 10%+
- No writeback: below 40%

If no-writeback exceeds 50% after 2 weeks, the Chat loop is failing and the three-mode model may need revision.

**Reconciler accuracy:** Fraction of deltas accepted without editing. Target above 80%. Track ID-based vs fuzzy-matched separately.

**Proactive proposal accuracy:** Fraction of proposals that are genuinely useful. Target above 70%.

**Context leak reduction:** Are you re-explaining your situation to Claude less often? Informal yes/no after 2 weeks.

**Model currency:** Does CLAUDE.md accurately reflect current state without manual updates?

**Graph utility:** Do you open the visual graph at least once per day? What do you use it for? (Orientation / discovery / debugging / never)

**API cost:** Daily token spend. Baseline from week 1.

---

## 27. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Chat writeback adoption too low** — users skip the session-end prompt, don't paste conversations, the Chat loop never closes | High | Critical — invalidates the core hypothesis for the most common dispatch target | Four writeback paths ordered by friction. Session-end prompt is modal (hard to dismiss accidentally). Track per-session. If below 50% after 2 weeks, consider: (a) collapsing to two-mode model (Code + Cowork), (b) building a browser extension for v2, (c) accepting that Chat sessions are "fire and forget" and focusing Twin's value on Code/Cowork loops + focus view |
| **Prompt tuning takes longer than expected** — five agent prompts each need iterative refinement | High | Medium — delays build by 1-3 weeks | Budget extra time in phases 2-3. Prioritise Composer (the core value) and Resolver (the capture pipeline). Planner/Prioritiser can ship with imperfect prompts and be refined during the test week. |
| **Anthropic ships native cross-session context** — Claude Code and Chat get persistent memory, reducing the need for Twin's dispatch layer | Medium | High — narrows Twin's unique value | The work graph and focus view provide value independent of dispatch. The visual graph has no equivalent in any Anthropic roadmap. Pivot messaging from "context dispatch" to "personal work state engine." |
| **macOS Accessibility permission friction** — users decline or forget to re-grant permission on Sequoia | Medium | Low — global shortcut is convenience, not critical | In-app permission check with guide. Fallback to in-app capture. The capture strip works without Accessibility. |
| **Context pack quality is no better than manual** — generated briefs don't measurably improve AI sessions | Low | Critical — invalidates the entire project | Test this early (step 9). If briefs are not better than typing "I'm working on X and need Y", the Composer prompt needs fundamental rework, or the work graph isn't capturing the right data. |
| **Graph visualisation performance** — large graphs lag or become unreadable | Low | Medium — degrades UX but doesn't break functionality | G6 with WebGL handles 1000+ nodes. Archival keeps active graph small. Combo nodes group by project. Edge filtering reduces clutter. |
| **YAML round-trip comment drift** — `eemeli/yaml` moves trailing comments | Low | Low — cosmetic issue | Convention: comments above keys, not inline. Use `parseDocument()` for round-trips. |

---

*End of spec v1.1*
*Revised from v1.0 based on competitive analysis, technical feasibility research, and product critique (2026-03-23)*
*Key changes: reduced dispatch friction (quick dispatch, session-end prompt), visual graph (G6), decision lifecycle, data archival, competitive positioning, risk register, honest timeline*
*Next step: `tauri create twin && mkdir ~/twin && implement fs.ts && buildGraph()`*
