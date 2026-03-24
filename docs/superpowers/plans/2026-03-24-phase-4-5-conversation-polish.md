# Phase 4+5 — Conversation, Writeback, Polish & Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining feature set: Chat writeback (4 paths), conversation notes with people picker, note editor with chat assistant, decision lifecycle (supersede UI), advanced graph features, project archival, CLAUDE.md generation, and error handling audit.

**Spec reference:** `twin-spec-v1.1.md` — sections 10.1 (Chat writeback), 6.2 (conversation notes), 14 (inbox), 16 (note editor), 6.6 (decision lifecycle), 8 (visual graph), 21 (archival), 19 (CLAUDE.md gen), 20 (error handling)

---

## Task 1: Chat Writeback — 4 Paths (Step 11)

**Files:** Create `src/components/SessionEndModal.tsx`, `src/components/ConversationImport.tsx`, modify `src/components/SessionBanner.tsx`, `src/hooks/useSessionTracker.ts`, `src/App.tsx`

Build all 4 Chat writeback paths from spec section 10.1:

1. **Session-end prompt modal** — When user clicks "Mark done" on session banner, show modal with quick summary textarea + checkboxes (decisions made / new tasks / nothing actionable). "Save" runs Resolver on summary. "Nothing actionable" marks session complete without API call.

2. **Clipboard auto-detect** — On app focus after a Chat dispatch, check clipboard for multi-line text. If detected, show "Import this conversation?" banner. Uses `tauri-plugin-clipboard` (`readText()`).

3. **Quick summary inline** — Text field in the session banner. Enter submits to Resolver.

4. **Full conversation import** — `ConversationImport.tsx`: large textarea, project selector, Extract button. Resolver runs extraction. Review screen reuses `DeltaReview`. This may already be partially built in Phase 2's `InboxTriage` — reuse the same Resolver + DeltaReview flow.

Track which writeback path is used per session via `ActiveSession.writeback_path`.

## Task 2: Conversation Notes + People Picker (Step 12)

**Files:** Create `src/components/ConversationNoteEditor.tsx`, `src/components/PeoplePicker.tsx`, modify `src/App.tsx`

- **PeoplePicker** — Dropdown/autocomplete reading from `people.yaml`. Shows existing people. "Add new person" option creates inline. Multi-select for conversations.

- **ConversationNoteEditor** — Structured form matching spec section 16 (conversation note UI):
  - People picker (multi-select)
  - Date picker
  - "What did you discuss?" textarea
  - "What was agreed?" textarea + checkbox "Append to decisions.yaml"
  - "Open questions?" textarea
  - On save: write note file with `type: conversation`, optionally create `append_decision` deltas for agreed items

## Task 3: Note Editor + Chat Assistant (Step 13)

**Files:** Create `src/components/NoteEditor.tsx`, `src/components/NoteChat.tsx`, modify `src/App.tsx`

- **NoteEditor** — Split view. Left: markdown textarea with frontmatter controls (title, type selector, twin_synced toggle, linked_delivery picker). Right: `NoteChat` pane.

- **NoteChat** — Scoped chat assistant grounded in the current note + project context. Uses Composer to build context pack. Calls Anthropic API for responses. "Save to note" button appends assistant message to the note body. Conversations are ephemeral (not persisted).

## Task 4: Decision Lifecycle UI (Step 14)

**Files:** Modify `src/components/ProjectTaskList.tsx` (or create `src/components/DecisionList.tsx`), modify `src/App.tsx`

- **DecisionList** — Shows all decisions for a project. Active decisions in normal text, superseded in grey/strikethrough.
- **Supersede action** — Button on each active decision: "Mark superseded". Opens prompt for which new decision supersedes it (or creates a new one).
- Uses existing `supersede_decision` delta + validator (already handles same-batch validation from bug fix).

## Task 5: Advanced Graph Features (Step 15)

**Files:** Modify `src/components/GraphView.tsx`, create `src/components/GraphControls.tsx`

- **Filter controls** — Toggle entity kinds, filter by status, filter by relationship type
- **Search by title** — Highlights matching nodes
- **Right-click context menu** — "Dispatch from here" (pre-fills objective), "Open in editor"
- **Minimap** — G6 minimap plugin (already configured in Phase 1, verify it works)

## Task 6: Data Lifecycle + Archival (Step 16)

**Files:** Modify `src/components/Sidebar.tsx`, modify `src/App.tsx`, modify `src/lib/fs.ts`

- **Archive project** — Right-click or button on project in sidebar. Calls `archiveProject(slug)` from fs.ts (moves to `~/twin/archive/`). Graph excludes archived projects.
- **Restore project** — In settings or archive view, move folder back.
- **Session archival** — Sessions older than 30 days auto-move to `~/twin/archive/sessions/`.

## Task 7: CLAUDE.md Generation (Step 17)

**Files:** Create `src/lib/claude-generator.ts`, `src/lib/claude-generator.test.ts`

- **`generateProjectCLAUDE(projectSlug, graph): Promise<string>`** — Uses the generation prompt from spec section 19. Calls Haiku with project context. Filters to active decisions only. Returns the generated markdown.
- **Stale flag** — Track per-project whether CLAUDE.md is stale. Set stale on: task status change, delivery status change, decision append/supersede, note twin_synced change.
- **Trigger on dispatch** — Composer checks staleness, regenerates before brief assembly.
- **`writeProjectCLAUDE(slug, content)`** — Already exists in fs.ts.

## Task 8: Error Handling Audit (Step 18)

**Files:** Various fixes

Systematically test every error scenario from spec section 20:
- API key revoked → app still works for capture, triage, manual editing
- Malformed YAML in tasks.yaml → graph skips with warning
- Malformed note frontmatter → note appears with warning icon
- Concurrent external file edit → state updater detects and warns
- Run `pnpm test` after each fix
