# Shelf Sync Summary Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show forced shelf-sync progress in the cached shelf summary, keep the existing shelf visible during sync, and give the sync button the same dimensions and stronger theme-aware styling as the settings button.

**Architecture:** Keep synchronization progress in `ShelfView.syncProgress`. When a cached shelf is being refreshed, render a small progress block inside the existing stats summary once, then update only its label and native progress element for each progress event. When no cache exists, retain the current lightweight loading rendering. Consolidate the settings and sync button dimensions and use Obsidian's accent variables for readable normal and hover states.

**Tech Stack:** TypeScript, Obsidian DOM helpers, native `<progress>`, Vitest, CSS custom properties.

## Global Constraints

- Preserve the cached shelf while a forced sync is running.
- Do not rebuild the shelf cards on every per-book progress event.
- Show `正在加载书籍 x/y` through the existing `getShelfSyncProgressViewModel()` output when the enrichment phase is determinate.
- Use a determinate progress bar when `total > 0`; otherwise leave the native progress bar indeterminate.
- Remove the summary progress block after both successful and failed syncs.
- Keep the existing no-API-Key guard and its user-facing notice unchanged.
- Make both settings and sync buttons exactly 30×30px with zero padding and 16px icons.
- Use `var(--interactive-accent)`, `var(--interactive-accent-hover)`, and `var(--text-on-accent)` for button colors.
- Do not add dependencies or change the sync service/network behavior.

## File Map

- Modify `src/views/shelf-view.ts`: own summary progress element references, create the summary progress block, and update it without a full shelf render.
- Modify `styles.css`: style the summary progress block and consolidate the settings/sync button dimensions and colors.
- Modify `tests/shelf-view.test.ts`: verify cached progress updates are incremental and the summary progress elements are created and updated.

### Task 1: Add failing view tests for cached summary progress

**Files:**
- Modify: `tests/shelf-view.test.ts`

**Interfaces:**
- Consumes: `ShelfView`, `ShelfSyncProgress`, `ShelfSyncResult`, and `ShelfCache` from the existing source modules.
- Produces: regression coverage that the implementation in Tasks 2 and 3 must satisfy.

- [ ] **Step 1: Add a test that renders a summary progress block for a cached shelf**

Extend the existing `ShelfView` test setup with a small fake DOM element factory that supports `createDiv`, `createEl`, `createSpan`, `empty`, `removeAttribute`, and mutable `textContent`, `max`, and `value` fields. Instantiate a view with a non-empty API key, set its private state to `cache = result.cache` and `isLoading = true`, then invoke `renderStats` through a typed test-only cast. Assert that the parent contains a child with class `weread-shelf__summary-progress`, a label with class `weread-shelf__summary-progress-label`, and a `<progress>` element.

```ts
it('renders sync progress inside the cached shelf summary', () => {
	const view = createView('wrk-test');
	const parent = createFakeElement();
	const internals = view as unknown as {
		cache: ShelfCache | null;
		isLoading: boolean;
		renderStats: (parent: HTMLElement, cache: ShelfCache) => void;
	};
	internals.cache = result.cache;
	internals.isLoading = true;

	internals.renderStats(parent as HTMLElement, result.cache);

	expect(parent.createdDivClasses).toContain('weread-shelf__summary-progress');
	expect(parent.createdDivClasses).toContain('weread-shelf__summary-progress-label');
	expect(parent.createdProgressCount).toBe(1);
});
```

- [ ] **Step 2: Add a test that updates only the summary progress elements**

Create fake label and progress elements, inject them into the view's private summary element references, and call `updateSyncProgress()` with an enriching update. Assert the label becomes `正在加载书籍 3/10`, `max` becomes `10`, and `value` becomes `3`; spy on `renderContent` and assert it is not called while a cache exists.

```ts
it('updates cached summary progress without rebuilding shelf content', () => {
	const view = createView('wrk-test');
	const label = { textContent: '' } as HTMLElement;
	const progress = createFakeProgressElement();
	const renderContent = vi.fn();
	const internals = view as unknown as {
		cache: ShelfCache | null;
		contentAreaEl: HTMLElement | null;
		isLoading: boolean;
		renderContent: () => void;
		summarySyncProgressLabelEl: HTMLElement | null;
		summarySyncProgressBarEl: HTMLProgressElement | null;
		updateSyncProgress: (progress: ShelfSyncProgress) => void;
	};
	internals.cache = result.cache;
	internals.contentAreaEl = {} as HTMLElement;
	internals.isLoading = true;
	internals.renderContent = renderContent;
	internals.summarySyncProgressLabelEl = label;
	internals.summarySyncProgressBarEl = progress;

	internals.updateSyncProgress({ phase: 'enriching', completed: 3, total: 10 });

	expect(label.textContent).toBe('正在加载书籍 3/10');
	expect(progress.max).toBe(10);
	expect(progress.value).toBe(3);
	expect(renderContent).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the focused tests and verify they fail for the missing summary UI**

Run: `npx vitest run tests/shelf-view.test.ts`

Expected: the existing no-API-Key and no-full-rerender tests pass, while the new summary progress test fails because `ShelfView` has no summary progress elements yet.

### Task 2: Implement summary progress updates without full DOM rebuilds

**Files:**
- Modify: `src/views/shelf-view.ts:39-174`

**Interfaces:**
- Consumes: `ShelfSyncProgress`, `getShelfSyncProgressViewModel()`, and the existing `renderStats()`/`updateSyncProgress()` flow.
- Produces: private `summarySyncProgressLabelEl: HTMLElement | null` and `summarySyncProgressBarEl: HTMLProgressElement | null` references, plus the `renderSummarySyncProgress()` and `updateSummarySyncProgress()` methods used only by `ShelfView`.

- [ ] **Step 1: Add private references for the summary progress elements**

Add these fields beside `contentAreaEl`:

```ts
private summarySyncProgressLabelEl: HTMLElement | null = null;
private summarySyncProgressBarEl: HTMLProgressElement | null = null;
```

- [ ] **Step 2: Render the summary progress block when cached sync starts**

At the end of `renderStats()`, after the five stat items, add:

```ts
if (this.isLoading) {
	this.renderSummarySyncProgress(parent);
}
```

Implement `renderSummarySyncProgress(parent)` so it creates `weread-shelf__summary-progress`, a label with `weread-shelf__summary-progress-label`, and a native `<progress>` with `weread-shelf__summary-progress-bar` and the current view-model label as `aria-label`. Store the label and progress references, then call `updateSummarySyncProgress()` once to apply the current phase.

- [ ] **Step 3: Add the incremental progress updater**

Implement `updateSummarySyncProgress()` with the existing view model:

```ts
private updateSummarySyncProgress(): void {
	const label = this.summarySyncProgressLabelEl;
	const progress = this.summarySyncProgressBarEl;
	if (label === null || progress === null) {
		return;
	}

	const viewModel = getShelfSyncProgressViewModel(this.syncProgress);
	label.textContent = viewModel.label;
	progress.setAttribute('aria-label', viewModel.label);
	if (viewModel.determinate && viewModel.total > 0) {
		progress.max = viewModel.total;
		progress.value = viewModel.completed;
	} else {
		progress.removeAttribute('value');
	}
}
```

- [ ] **Step 4: Route cached progress events to the incremental updater**

Replace `updateSyncProgress()` with this behavior:

```ts
private updateSyncProgress(progress: ShelfSyncProgress): void {
	this.syncProgress = progress;
	if (this.cache !== null) {
		this.updateSummarySyncProgress();
		return;
	}
	if (this.isLoading && this.contentAreaEl !== null) {
		this.renderContent();
	}
}
```

This keeps the first-load progress behavior, while cached forced syncs update only two DOM nodes per event.

- [ ] **Step 5: Clear stale references whenever content is rebuilt**

At the beginning of `renderContent()`, after `area.empty()`, set both summary element references to `null`. This ensures the final render after success or failure cannot retain detached DOM references.

- [ ] **Step 6: Run focused tests and verify they pass**

Run: `npx vitest run tests/shelf-view.test.ts`

Expected: all `ShelfView` tests pass, including the summary progress and no-full-rerender regressions.

### Task 3: Style the summary progress and unify button visuals

**Files:**
- Modify: `styles.css:38-79, 240-260`

**Interfaces:**
- Consumes: the class names emitted by `ShelfView`: `weread-shelf__summary-progress`, `weread-shelf__summary-progress-label`, `weread-shelf__summary-progress-bar`, `weread-shelf__settings-button`, and `weread-shelf__sync-button`.
- Produces: theme-aware summary progress styling and a consistent 30×30px action-button treatment.

- [ ] **Step 1: Consolidate settings and sync button dimensions and colors**

Replace the separate settings/sync rules with shared selectors:

```css
.weread-shelf__settings-button,
.weread-shelf__sync-button {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 30px;
	width: 30px;
	height: 30px;
	padding: 0;
	border-radius: 6px;
	background-color: var(--interactive-accent);
	color: var(--text-on-accent);
}

.weread-shelf__settings-button:hover,
.weread-shelf__sync-button:hover {
	background-color: var(--interactive-accent-hover);
	color: var(--text-on-accent);
}

.weread-shelf__settings-button svg,
.weread-shelf__sync-button svg {
	width: 16px;
	height: 16px;
}
```

- [ ] **Step 2: Add a compact summary progress block**

Add the following styles near the existing stats rules:

```css
.weread-shelf__summary-progress {
	display: flex;
	align-items: center;
	gap: 10px;
	flex: 1 1 220px;
	min-width: 220px;
	color: var(--text-muted);
	font-size: var(--font-ui-small);
}

.weread-shelf__summary-progress-label {
	white-space: nowrap;
}

.weread-shelf__summary-progress-bar {
	width: min(240px, 100%);
	height: 6px;
	accent-color: var(--interactive-accent);
}
```

- [ ] **Step 3: Run focused tests and inspect the generated CSS selectors**

Run: `npx vitest run tests/shelf-toolbar.test.ts tests/shelf-view.test.ts`

Expected: both test files pass. Confirm the CSS uses only existing Obsidian theme variables and no hard-coded color that would reduce dark-theme contrast.

### Task 4: Full verification and handoff

**Files:**
- Verify: `src/views/shelf-view.ts`, `styles.css`, `tests/shelf-view.test.ts`

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all test files pass with zero failed tests.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Expected: exit code 0; the repository's existing `.eslintignore` deprecation warning may appear, but no lint errors.

Run: `npm run build`

Expected: exit code 0 and the plugin bundle is generated in the configured ignored output directory.

- [ ] **Step 3: Check the final diff**

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only the intended source/style/test changes are present, and the existing user-owned plan files remain untouched.
