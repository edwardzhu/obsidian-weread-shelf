# Shelf first-load performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an empty-cache shelf open immediately with a visible synchronization progress bar while reducing first-sync network wait time and preventing duplicate concurrent shelf syncs.

**Architecture:** Add a typed progress callback to `ShelfSyncService.sync()` and run each book's independent progress/info requests concurrently. Add a small `ShelfSyncCoordinator` that shares one active sync promise and fans progress updates out to all callers. `ShelfView` renders controls and a loading state before awaiting the first sync, while existing cached loads retain their current behavior.

**Tech Stack:** TypeScript 5.9, Vitest 4, Obsidian API, esbuild, existing npm scripts.

## Global Constraints

- Preserve the existing shelf data model and cache format.
- Do not add network requests; only change request scheduling and UI feedback.
- Keep progress and status filtering behavior unchanged.
- Use npm scripts for tests, linting, and builds.
- Follow TDD: add and observe failing tests before production changes.

---

### Task 1: Report sync progress and parallelize per-book enrichment

**Files:**
- Modify: `src/services/shelf-sync-service.ts`
- Test: `tests/shelf-sync-service.test.ts`

**Interfaces:**
- Produces `ShelfSyncProgress`, `ShelfSyncProgressListener`, and `ShelfSyncService.sync(onProgress?)`.
- Progress phases are `fetching`, `enriching`, `saving`, and `complete` with `completed` and `total` counters.

- [ ] **Step 1: Add failing tests**

Add tests that assert progress reaches fetching/enriching/saving/complete and that book progress and info requests overlap. Extend the fake API with an optional `getBookInfoOverride` so the overlap test can fail when info starts only after progress finishes.

- [ ] **Step 2: Run the focused sync tests and observe the expected failures**

Run `npm run test -- tests/shelf-sync-service.test.ts`.

- [ ] **Step 3: Implement the progress callback and concurrent requests**

Use `Promise.allSettled` inside `enrichBook` to preserve independent fallback/error handling while starting `getBookProgress` and `getBookInfo` together. Report one enrichment completion after each book result, report saving before repository persistence, and complete after save.

- [ ] **Step 4: Run focused and complete tests**

Run `npm run test -- tests/shelf-sync-service.test.ts` and `npm test`.

- [ ] **Step 5: Commit Task 1**

Run `git add src/services/shelf-sync-service.ts tests/shelf-sync-service.test.ts` and commit with `feat: report shelf sync progress`.

### Task 2: Deduplicate active shelf syncs

**Files:**
- Create: `src/services/shelf-sync-coordinator.ts`
- Test: `tests/shelf-sync-coordinator.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- `ShelfSyncCoordinator` accepts a `ShelfSyncTask` and exposes `sync(onProgress?)`.
- Multiple callers share the active promise and each registered progress listener receives updates.

- [ ] **Step 1: Write failing coordinator tests**

Cover one active task for two callers, forwarding progress to both callers, and allowing a later call to start after the first task settles.

- [ ] **Step 2: Run the new coordinator test and observe failure**

Run `npm run test -- tests/shelf-sync-coordinator.test.ts`.

- [ ] **Step 3: Implement the coordinator and wire it into `WereadShelfPlugin.syncShelf`**

Create one coordinator in the plugin and route both runtime startup refreshes and view-triggered syncs through it. Keep the existing `ShelfSyncService` construction as the actual task factory.

- [ ] **Step 4: Run coordinator, runtime, and full tests**

Run `npm run test -- tests/shelf-sync-coordinator.test.ts tests/plugin-runtime.test.ts tests/shelf-sync-service.test.ts` and `npm test`.

- [ ] **Step 5: Commit Task 2**

Run `git add src/services/shelf-sync-coordinator.ts tests/shelf-sync-coordinator.test.ts src/main.ts` and commit with `perf: deduplicate shelf syncs`.

### Task 3: Render an immediate first-load progress bar

**Files:**
- Modify: `src/views/shelf-view.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`

**Interfaces:**
- `ShelfViewDependencies.syncShelf` accepts an optional `ShelfSyncProgressListener`.
- Empty-cache refresh renders controls and a loading area before awaiting sync; cached refreshes still render shelf content directly.

- [ ] **Step 1: Add the loading state and progress rendering**

Track `isLoading` and the latest `ShelfSyncProgress`, render an indeterminate native `<progress>` during fetching/saving, and render a determinate bar with `completed/total` during enrichment. Use concise Chinese labels such as `正在获取书架…`, `正在加载书籍 3/20`, and `正在保存书架…`.

- [ ] **Step 2: Wire progress listeners and add loading styles**

Pass the callback from `ShelfView` through `WereadShelfPlugin.syncShelf`, and add scoped loading/progress CSS without changing card or group layout.

- [ ] **Step 3: Run lint, tests, and build**

Run `npm test`, `npm run lint`, and `npm run build`.

- [ ] **Step 4: Commit Task 3**

Run `git add src/views/shelf-view.ts src/main.ts src/styles.css` and commit with `feat: show initial shelf sync progress`.

### Task 4: Final verification

**Files:**
- Verify: `src/services/shelf-sync-service.ts`
- Verify: `src/services/shelf-sync-coordinator.ts`
- Verify: `src/main.ts`
- Verify: `src/views/shelf-view.ts`
- Verify: `src/styles.css`
- Verify: `tests/shelf-sync-service.test.ts`
- Verify: `tests/shelf-sync-coordinator.test.ts`

- [ ] **Step 1: Run the complete verification commands**

Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check HEAD~3..HEAD`.

- [ ] **Step 2: Review the final diff**

Confirm there are no new network calls, existing cache browsing remains unchanged, the initial UI paints before the first sync completes, and generated artifacts remain uncommitted.
