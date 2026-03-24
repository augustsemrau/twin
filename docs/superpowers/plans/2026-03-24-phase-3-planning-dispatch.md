# Phase 3 — Planning + Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Planner, Prioritiser, Composer, and Reconciler agents. Build the focus view with priority briefs and proactive proposals. Build the dispatch view with quick-dispatch (Cmd+D) and full dispatch paths. Build session tracking with manifest detection and reconciliation.

**Architecture:** Four new AI agents (Planner uses Haiku, Prioritiser uses Sonnet, Composer uses Sonnet, Reconciler uses Haiku). The focus view calls the Prioritiser on load. Dispatch starts with the Planner recommending a target, then the Composer assembles a context pack. The Reconciler watches for manifest files and proposes deltas. All agents use the shared anthropic-client with token tracking.

**Tech Stack:** Existing: @anthropic-ai/sdk, fs.ts, validator, state-updater, graph-builder, DeltaReview. New: @leeoniya/ufuzzy for Reconciler fuzzy matching. Clipboard API for copy-to-clipboard.

**Spec reference:** `twin-spec-v1.1.md` — sections 9 (Agents 3, 3b, 4, 5), 10 (dispatch targets), 12 (focus view)

---

## File Structure (new/modified)

```
src/
├── types/
│   └── agents.ts              # Add PlannerOutput, PrioritiserOutput, ReconcilerOutput
│
├── lib/
│   ├── planner.ts             # Planner agent: objective → recommended action
│   ├── planner.test.ts
│   ├── prioritiser.ts         # Prioritiser agent: graph → daily brief + proposals
│   ├── prioritiser.test.ts
│   ├── composer.ts            # Composer: assemble context packs per dispatch target
│   ├── composer.test.ts
│   ├── reconciler.ts          # Reconciler: manifest → proposed deltas
│   └── reconciler.test.ts
│
├── components/
│   ├── FocusView.tsx          # Focus view: brief + proposals + open items
│   ├── ProposalCard.tsx       # Single proactive proposal with accept/dismiss
│   ├── DispatchBar.tsx        # Quick dispatch (Cmd+D) spotlight-style bar
│   ├── DispatchView.tsx       # Full dispatch: objective → planner → sources → preview
│   ├── BriefPreview.tsx       # Markdown preview of generated context pack
│   ├── SourceChecklist.tsx    # Entity source selection with checkboxes
│   └── SessionBanner.tsx      # Active session tracking banner
│
├── hooks/
│   └── useSessionTracker.ts   # Track active sessions, detect manifests
│
└── App.tsx                    # Wire new views + Cmd+D shortcut
```

---

## Task 1: Agent Types + Planner

**Files:**
- Modify: `src/types/agents.ts` (add PlannerOutput, PrioritiserOutput, ReconcilerOutput)
- Create: `src/lib/planner.ts`
- Create: `src/lib/planner.test.ts`

- [ ] **Step 1: Add agent output types to agents.ts**

Add to `src/types/agents.ts`:
```typescript
import type { EntityRef } from './entities'

export type PlannerOutput = {
  recommended_action:
    | { type: 'dispatch_chat'; objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_code'; objective: string; context_sources: EntityRef[] }
    | { type: 'dispatch_cowork'; delivery_id: ULID; context_sources: EntityRef[] }
    | { type: 'ask_user'; question: string }
    | { type: 'propose_deltas'; deltas: DeltaOperation[]; rationale: string }
    | { type: 'no_action'; reason: string }
  confidence: Confidence
  alternatives: Array<{ action: string; rationale: string }>
}

export type PrioritiserOutput = {
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

export type ReconcilerOutput = {
  session_id: ULID
  proposed_deltas: DeltaOperation[]
  follow_up_proposals: PrioritiserOutput['proactive_proposals']
  confidence: Confidence
  unresolved: Array<{
    item: string
    reason: string
    needs_user_input: boolean
  }>
}
```

- [ ] **Step 2: Write planner tests**

Test `buildPlannerPrompt` and `parsePlannerResponse` (pure functions). Similar pattern to resolver.test.ts.

- [ ] **Step 3: Implement planner.ts**

Two layers: pure functions (`buildPlannerPrompt`, `parsePlannerResponse`) and async (`runPlanner`). Uses Haiku. System prompt copied from spec section 9 (Agent 3). User message includes objective + graph context + last 5 sessions.

- [ ] **Step 4: Run tests, commit**

---

## Task 2: Prioritiser Agent

**Files:**
- Create: `src/lib/prioritiser.ts`
- Create: `src/lib/prioritiser.test.ts`

- [ ] **Step 1: Write prioritiser tests**

Test `buildPrioritiserPrompt`, `parsePrioritiserResponse`. Verify the prompt includes all active projects, tasks with IDs, deliveries, recent decisions, and the current date.

- [ ] **Step 2: Implement prioritiser.ts**

Uses Sonnet (higher quality for the daily brief). System prompt from spec section 9 (Agent 3b). Includes proactive check logic for: waiting_on ≥ 2 days, delivery due ≤ 2 days still draft, decision active ≥ 30 days.

The proactive checks are partially rule-based (detect the conditions from the graph) and partially LLM-generated (the Prioritiser suggests actions). The rule-based conditions should be checked BEFORE the API call and passed as context to the LLM.

- [ ] **Step 3: Run tests, commit**

---

## Task 3: Focus View

**Files:**
- Create: `src/components/FocusView.tsx`
- Create: `src/components/ProposalCard.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement ProposalCard**

Single proactive proposal card with Accept/Dismiss buttons. Shows: proposal text, trigger reason, entity references.

- [ ] **Step 2: Implement FocusView**

The landing screen. Components:
- Date + state header (today's date, active projects count, inbox count)
- AI priority brief (calls Prioritiser on mount, cached for session)
- Proactive proposals panel (from Prioritiser output)
- Open items list (tasks across active projects, sorted: overdue → due today → high priority)
- Loading state while Prioritiser runs
- Fallback: if API fails, show open items list without the AI brief

- [ ] **Step 3: Wire into App.tsx as the default view**

`activeView === 'focus'` renders FocusView. It should be the landing page.

- [ ] **Step 4: Test manually via `pnpm tauri dev`**

Verify: Focus view loads, Prioritiser generates a brief (may take 5-10s), open items list shows tasks. If API key works, the brief should mention the municipality-platform project.

- [ ] **Step 5: Commit**

---

## Task 4: Composer Agent

**Files:**
- Create: `src/lib/composer.ts`
- Create: `src/lib/composer.test.ts`

- [ ] **Step 1: Write composer tests**

Test `buildContextPack` (pure function that assembles the brief markdown). Test all three brief formats: Chat, Code, Cowork. Verify entity ID mapping is included. Verify writeback contract is appended.

- [ ] **Step 2: Implement composer.ts**

The Composer is mostly template-driven, not LLM-driven. It reads from the graph and assembles markdown using the brief templates from spec section 10 (10.1 Chat, 10.2 Code, 10.3 Cowork).

Key function: `buildContextPack(target, objective, sources, graph, globalContext): ContextPack`
- Generates a session ULID
- Reads the global CLAUDE.md content
- Reads selected entity content from the graph
- Assembles the brief markdown per the target's template
- Builds the entity ID map
- Appends the writeback contract
- Returns the complete ContextPack

Also: `saveContextPack(pack: ContextPack)` — writes to `~/twin/sessions/[session_id]-pack.md`

- [ ] **Step 3: Run tests, commit**

---

## Task 5: Dispatch UI (Quick + Full)

**Files:**
- Create: `src/components/DispatchBar.tsx`
- Create: `src/components/DispatchView.tsx`
- Create: `src/components/BriefPreview.tsx`
- Create: `src/components/SourceChecklist.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement SourceChecklist**

Entity source selection. Shows entities as checkbox items grouped by type (tasks, deliveries, decisions, notes). Each item shows title + type badge. Pre-selected based on Planner's `context_sources`.

- [ ] **Step 2: Implement BriefPreview**

Markdown preview panel for the generated context pack. Uses markdown-it to render. Shows the full brief with syntax highlighting for code blocks. Copy-to-clipboard button at the top.

- [ ] **Step 3: Implement DispatchBar (Cmd+D)**

Spotlight-style overlay:
- Text input for objective
- Suggested objectives from Planner (based on graph state)
- Target buttons: Chat / Code / Cowork
- On Enter or target click: run Planner → Composer → copy to clipboard → show brief preview
- Quick path: < 30 seconds total

Register `Cmd+D` shortcut in App.tsx (in-app shortcut, not global).

- [ ] **Step 4: Implement DispatchView (full path)**

Full dispatch page:
- Objective input
- Planner recommendation display (target + confidence)
- Source checklist (with Planner's selections pre-checked)
- Target override buttons
- "Generate Brief" button → Composer runs → BriefPreview shows
- "Copy to Clipboard" and "Write to Project" buttons

- [ ] **Step 5: Wire into App.tsx**

- `Cmd+D` anywhere opens DispatchBar as an overlay
- Sidebar "Dispatch" option opens DispatchView
- After dispatch: save ContextPack to sessions, start session tracking

- [ ] **Step 6: Test manually via `pnpm tauri dev`**

Verify: Cmd+D opens dispatch bar. Type an objective. Planner recommends a target. Brief is generated with correct entity IDs. Copy to clipboard works.

- [ ] **Step 7: Commit**

---

## Task 6: Reconciler Agent + Session Tracking

**Files:**
- Create: `src/lib/reconciler.ts`
- Create: `src/lib/reconciler.test.ts`
- Create: `src/hooks/useSessionTracker.ts`
- Create: `src/components/SessionBanner.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write reconciler tests**

Test `buildReconcilerPrompt`, `parseReconcilerResponse`, and `fuzzyMatchTask`. The fuzzy matcher uses @leeoniya/ufuzzy for title matching.

Test cases:
- Manifest with correct task IDs → deltas reference those IDs
- Manifest with title only → fuzzy match finds the right task
- Manifest with unknown title → added to unresolved
- Malformed manifest → safe default with low confidence

- [ ] **Step 2: Implement reconciler.ts**

Uses Haiku. System prompt from spec section 9 (Agent 5).

`fuzzyMatchTask(title: string, tasks: TaskEntity[]): { match: TaskEntity | null, confidence: Confidence }`
- Uses uFuzzy for short-phrase matching
- Exact match → high confidence
- Single fuzzy match → medium confidence
- Multiple or no matches → null, low confidence

`runReconciler(manifest, contextPack, graph)` → ReconcilerOutput

- [ ] **Step 3: Implement useSessionTracker hook**

Tracks active sessions:
- After dispatch: adds session to active list
- File watcher monitors `~/twin/sessions/` for `*-manifest.yaml` files
- When manifest detected: runs Reconciler, shows proposed deltas via DeltaReview
- Tracks writeback status per session

- [ ] **Step 4: Implement SessionBanner**

Persistent banner shown when a session is active:
```
Session 01JBQ... active (Code) — "Decide the data framework"
[Quick summary] [Import conversation] [Mark done]
```

For Chat sessions: shows the 4 writeback path options.
For Code/Cowork: shows "Waiting for manifest..." or "Manifest received — N deltas proposed"

- [ ] **Step 5: Wire into App.tsx**

- SessionBanner appears at the top of main content when a session is active
- After reconciliation: show DeltaReview with proposed deltas
- Accept applies deltas, marks session as reconciled

- [ ] **Step 6: Test manually**

1. Dispatch a session (generates a context pack)
2. Manually write a manifest file to `~/twin/sessions/[session_id]-manifest.yaml`
3. Twin detects it, Reconciler proposes deltas
4. Accept the deltas — verify they apply correctly

- [ ] **Step 7: Run all unit tests, commit**

---

## Task 7: Integration Testing + Smoke Test

**Files:**
- Modify: various (bug fixes from testing)

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
pnpm exec tsc --noEmit
```

- [ ] **Step 2: Manual smoke test via `pnpm tauri dev`**

Test the complete flow:
1. Open app → Focus view loads with Prioritiser brief
2. Cmd+D → type objective → Planner recommends → brief generated → copied
3. Click "Work graph" → graph renders with all entities
4. Navigate to project tasks → inline edit a status
5. Capture a thought via capture strip → appears in inbox
6. Triage the inbox item → accept or classify
7. Check that graph updates after each action

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 3 complete — planning, dispatch, and reconciliation

Planner: objective → recommended dispatch target (Haiku)
Prioritiser: daily focus brief + proactive proposals (Sonnet)
Composer: context pack assembly for Chat/Code/Cowork
Reconciler: manifest → proposed deltas with fuzzy ID matching
FocusView: priority brief, proposals, open items
DispatchBar: Cmd+D quick dispatch (< 30 seconds)
DispatchView: full dispatch with source selection
SessionBanner: active session tracking + manifest detection

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 Gate

**Gate criteria (from spec section 23):**

1. Prioritiser identifies the most urgent item and surfaces proactive proposals
2. Planner recommends the right dispatch target for a given objective
3. API failure shows the data-driven open items list (no crash)
4. Quick dispatch completes in under 30 seconds
5. Brief includes correct entity ID mapping
6. Chat brief is useful when pasted without further explanation
7. Manifest with correct IDs is reconciled automatically
8. Manifest with title-only is fuzzy-matched
9. Session banner appears after dispatch
