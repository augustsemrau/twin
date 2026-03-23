import { exists, mkdir, writeTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import {
  twinHome,
  projectPath,
  inboxPath,
  sessionsPath,
  archivePath,
  peoplePath,
  globalClaudePath,
  projectNotesPath,
} from './paths'

// ---------------------------------------------------------------------------
// Fixture content — embedded as strings (no fs.readFileSync in Tauri)
// ---------------------------------------------------------------------------

const GLOBAL_CLAUDE_MD = `# Global context

## Role & expertise
[Your role and background]

## Current toolchain
[Your tools and stack]

## Working style
[Your preferences]

## Communication preferences
[How you like to communicate]

## Instructions for all sessions
- Read CLAUDE.md in the project folder before starting any task
- Ask clarifying questions before executing if the task is ambiguous
- Append decisions to decisions.yaml after the session
- Flag blockers and risks explicitly
`

const PEOPLE_YAML = `# People
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
`

const WRITEBACK_SCHEMA_YAML = `# Twin session writeback schema v1.0
# Write your session manifest to ~/twin/sessions/[session_id]-manifest.yaml

session_id: ULID
summary: string
target: chat | code | cowork

decisions:
  - title: string
    decision: string
    rationale: string
    unblocks: ULID[]
    supersedes: ULID

tasks_created:
  - title: string
    priority: high | medium | low
    due_date: YYYY-MM-DD
    waiting_on: string

tasks_updated:
  - id: ULID
    status: todo | in_progress | blocked | done
    blocked_by: string
    waiting_on: string

artifacts:
  - path: string
    delivery_id: ULID
    description: string

open_questions:
  - id: ULID
    question: string

blockers:
  - title: string
    blocked_by: string
    waiting_on: string

confidence: high | medium | low
`

const CONTEXT_MD = `# Municipality Data Platform

## Client
Danish municipality — public sector data platform modernisation.

## Goal
Replace fragmented data infrastructure with a unified pipeline and inference layer.
On-prem H100 GPUs. Strict data governance (no cloud inference).

## Key constraints
- All LLM inference on-prem (data governance)
- Stakeholder Jakob (IT director) is risk-averse
- Friday EOD hard deadline for Q2 pitch
`

const TASKS_YAML = `# Tasks — municipality-platform
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
`

const DELIVERIES_YAML = `# Deliveries — municipality-platform
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
`

const DECISIONS_YAML = `# Decisions — municipality-platform
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
    unblocks: []
    decision: Evaluate both cloud and on-prem inference.
    rationale: >
      Initial assumption before client data governance constraints were known.
`

const NOTE_TECH_STACK_DECISION_MD = `---
id: 01JBQG0A1B
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
`

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

export async function seedTwinFolder(): Promise<void> {
  const home = await twinHome()

  // Guard: return early if ~/twin/ already exists
  if (await exists(home)) return

  // Create directory structure
  await mkdir(home, { recursive: true })
  await mkdir(await inboxPath(), { recursive: true })
  await mkdir(await sessionsPath(), { recursive: true })
  await mkdir(await archivePath(), { recursive: true })

  const projectSlug = 'municipality-platform'
  await mkdir(await projectPath(projectSlug), { recursive: true })
  await mkdir(await projectNotesPath(projectSlug), { recursive: true })

  // Write top-level files
  await writeTextFile(await globalClaudePath(), GLOBAL_CLAUDE_MD)
  await writeTextFile(await peoplePath(), PEOPLE_YAML)
  await writeTextFile(
    await join(await sessionsPath(), 'writeback-schema.yaml'),
    WRITEBACK_SCHEMA_YAML,
  )

  // Write project files
  const projPath = await projectPath(projectSlug)
  await writeTextFile(await join(projPath, 'context.md'), CONTEXT_MD)
  await writeTextFile(await join(projPath, 'tasks.yaml'), TASKS_YAML)
  await writeTextFile(await join(projPath, 'deliveries.yaml'), DELIVERIES_YAML)
  await writeTextFile(await join(projPath, 'decisions.yaml'), DECISIONS_YAML)

  // Write notes
  const notesPath = await projectNotesPath(projectSlug)
  await writeTextFile(
    await join(notesPath, '2026-03-17-tech-stack-decision.md'),
    NOTE_TECH_STACK_DECISION_MD,
  )
}
