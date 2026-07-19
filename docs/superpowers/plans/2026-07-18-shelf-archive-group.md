# Shelf archive grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `仅分组` shelf type that groups cached shelf items by the WeRead Shelf API's `archive` lists, preserves multi-list membership, sorts each group using the existing bookshelf sort setting, and places ungrouped items last.

**Architecture:** Extend the typed Shelf API response and the persisted shelf cache with optional archive metadata. Keep filtering and grouping pure in `src/utils/shelf-state.ts`: existing types retain year grouping, while `grouped` uses archive order and appends an ungrouped group. Wire the cached archive metadata and new filter option into `ShelfView` without adding a network request.

**Tech Stack:** TypeScript 5.9, Vitest 4, ESLint with `eslint-plugin-obsidianmd`, esbuild, Obsidian API types.

## Global Constraints

- Use npm scripts for tests, linting, and builds.
- Use TDD: write each behavior test, run it to observe the expected failure, then implement the smallest change that passes it.
- Do not add a network request; `archive` comes from the existing `/shelf/sync` response.
- Preserve current year grouping for `全部图书` and `只有书籍`.
- A book in multiple archive lists appears once in each matching group.
- Archive groups use API response order; `未分组` is always last.
- Existing caches without archive metadata remain readable and treat all items as ungrouped.
- Do not bump the cache version; the new archive field is additive and optional.

---

### Task 1: Add archive-aware pure shelf grouping

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/shelf-state.ts`
- Test: `tests/shelf-state.test.ts`

**Interfaces:**
- Consumes: existing `ShelfItem`, `ShelfFilterState`, and `YearGroup` behavior.
- Produces: `ItemTypeFilter` value `'grouped'`, `ShelfArchive`, optional `ShelfCache.archives`, and `filterAndGroupShelf(items, filters, noteTextByBookId, archives?)`.

- [ ] **Step 1: Write failing archive grouping tests**

In `tests/shelf-state.test.ts`, import `ShelfArchive` with `ShelfItem`, define the archive fixture, and add these tests before changing production code:

```ts
const archives: ShelfArchive[] = [
	{ name: '正在阅读', bookIds: ['book-1', 'book-1', 'book-3'] },
	{ name: '收藏', bookIds: ['book-1', 'book-3'] },
];

it('groups items by archive, repeats multi-group books, and puts ungrouped items last', () => {
	const groups = filterAndGroupShelf(
		allItems,
		{ query: '', type: 'grouped', status: 'all', sort: 'activity' },
		new Map(),
		archives,
	);

	expect(groups.map((group) => group.label)).toEqual(['正在阅读', '收藏', '未分组']);
	expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
		['book-1', 'book-3'],
		['book-1', 'book-3'],
		['audio-1', 'book-2', 'audio-2'],
	]);
});

it('filters before archive grouping and sorts each archive by title when requested', () => {
	const groups = filterAndGroupShelf(
		allItems,
		{ query: '', type: 'grouped', status: 'all', sort: 'title' },
		new Map(),
		archives,
	);

	expect(groups.find((group) => group.label === '收藏')?.items.map((item) => item.title)).toEqual([
		'Completed',
		'The Book',
	]);

	const filteredGroups = filterAndGroupShelf(
		allItems,
		{ query: 'Alpha', type: 'grouped', status: 'all', sort: 'activity' },
		new Map(),
		archives,
	);

	expect(filteredGroups).toEqual([
		{ key: '未分组', label: '未分组', items: [unreadBook] },
	]);
});
```

- [ ] **Step 2: Run the focused tests and verify the failure is about missing archive behavior**

Run:

```bash
npm run test -- tests/shelf-state.test.ts
```

Expected: the existing tests run, and the two new tests fail because `type: 'grouped'` still follows year grouping and the fourth `archives` argument is ignored.

- [ ] **Step 3: Add the archive domain types**

Modify `src/types.ts` with these additive declarations:

```ts
export type ItemTypeFilter = 'all' | 'books' | 'grouped';

export interface ShelfArchive {
	name: string;
	bookIds: string[];
}

export interface ShelfCache {
	version: 1;
	items: ShelfItem[];
	lastSuccessfulSyncAt: number;
	archives?: ShelfArchive[];
}
```

Keep `ShelfFilterState` unchanged apart from consuming the expanded `ItemTypeFilter`.

- [ ] **Step 4: Implement the minimal archive branch in the pure grouping function**

Update the imports and signature in `src/utils/shelf-state.ts`, then branch after the existing filtering pipeline:

```ts
import type {
	AudiobookListeningState,
	BookReadingState,
	ShelfArchive,
	ShelfFilterState,
	ShelfItem,
	YearGroup,
} from '../types';

export function filterAndGroupShelf(
	items: readonly ShelfItem[],
	filters: ShelfFilterState,
	noteTextByBookId: ReadonlyMap<string, string>,
	archives: readonly ShelfArchive[] = [],
): YearGroup[] {
	const filteredItems = items
		.filter((item) => matchesType(item, filters.type))
		.filter((item) => matchesStatus(item, filters.status))
		.filter((item) =>
			matchesShelfSearch(item, filters.query, noteTextByBookId.get(item.id) ?? ''),
		);

	if (filters.type === 'grouped') {
		return groupByArchives(filteredItems, archives, filters.sort);
	}

	return groupByActivityYear(filteredItems, filters.sort);
}
```

Add the extracted year-group helper and the archive helper:

```ts
function groupByActivityYear(
	items: readonly ShelfItem[],
	sort: ShelfFilterState['sort'],
): YearGroup[] {
	const groups = new Map<string, ShelfItem[]>();
	for (const item of items) {
		const groupKey = getActivityYearKey(item);
		const groupItems = groups.get(groupKey) ?? [];
		groupItems.push(item);
		groups.set(groupKey, groupItems);
	}

	return [...groups.entries()]
		.sort(([leftKey], [rightKey]) => compareGroupKeys(leftKey, rightKey))
		.map(([key, groupItems]) => ({
			key,
			label: key,
			items: sortGroupItems(groupItems, sort),
		}));
}

function groupByArchives(
	items: readonly ShelfItem[],
	archives: readonly ShelfArchive[],
	sort: ShelfFilterState['sort'],
): YearGroup[] {
	const groupedItemIds = new Set<string>();
	const groups: YearGroup[] = [];

	for (const archive of archives) {
		const bookIds = new Set(archive.bookIds);
		const groupItems = items.filter((item) => bookIds.has(item.id));
		if (groupItems.length === 0) {
			continue;
		}

		for (const item of groupItems) {
			groupedItemIds.add(item.id);
		}
		groups.push({
			key: archive.name,
			label: archive.name,
			items: sortGroupItems(groupItems, sort),
		});
	}

	const ungroupedItems = items.filter((item) => !groupedItemIds.has(item.id));
	if (ungroupedItems.length > 0) {
		groups.push({
			key: '未分组',
			label: '未分组',
			items: sortGroupItems(ungroupedItems, sort),
		});
	}

	return groups;
}
```

Update `matchesType` only so `'grouped'` behaves like `'all'` for item membership; the `filterAndGroupShelf` branch determines its grouping mode:

```ts
function matchesType(item: ShelfItem, type: ShelfFilterState['type']): boolean {
	if (type === 'books') {
		return item.kind === 'book';
	}
	return true;
}
```

- [ ] **Step 5: Run the focused tests and the complete unit suite**

Run:

```bash
npm run test -- tests/shelf-state.test.ts
npm test
```

Expected: the focused tests and all existing tests pass. The existing year-grouping tests must remain unchanged and green.

- [ ] **Step 6: Commit the pure grouping change**

```bash
git add src/types.ts src/utils/shelf-state.ts tests/shelf-state.test.ts
git commit -m "feat: group shelf items by archives"
```

### Task 2: Sync and cache Shelf API archive metadata

**Files:**
- Modify: `src/api/weread-client.ts`
- Modify: `src/services/shelf-sync-service.ts`
- Test: `tests/shelf-sync-service.test.ts`

**Interfaces:**
- Consumes: `ShelfArchive` and optional `ShelfCache.archives` from Task 1.
- Produces: `RawShelfArchive`, optional `RawShelfResponse.archive`, and synchronized cache archive metadata.

- [ ] **Step 1: Add a failing sync assertion and API fixture**

Extend the default `FakeWereadApi` shelf fixture in `tests/shelf-sync-service.test.ts` with:

```ts
archive: [
	{ name: '正在阅读', bookIds: ['book-1'] },
	{ name: '收藏', bookIds: ['book-1'] },
],
```

Add this assertion to the existing `normalizes and caches books and audiobooks` test immediately after the item assertions:

```ts
expect(result.cache.archives).toEqual([
	{ name: '正在阅读', bookIds: ['book-1'] },
	{ name: '收藏', bookIds: ['book-1'] },
]);
```

- [ ] **Step 2: Run the sync test and verify the archive assertion fails**

Run:

```bash
npm run test -- tests/shelf-sync-service.test.ts
```

Expected: the existing synchronization assertions pass, while the new archive assertion fails because the current cache contains no archive metadata.

- [ ] **Step 3: Type the Shelf API archive response**

Add this type beside the existing raw shelf types in `src/api/weread-client.ts`:

```ts
export interface RawShelfArchive {
	name: string;
	bookIds: string[];
}
```

Extend `RawShelfResponse` as follows, leaving `books` and `albums` required:

```ts
export interface RawShelfResponse {
	books: RawShelfBook[];
	albums: RawShelfAlbum[];
	archive?: RawShelfArchive[];
}
```

- [ ] **Step 4: Persist archive data during shelf synchronization**

Add `archive` to the cache object in `ShelfSyncService.sync()` and copy each ID array so cache data is independent of the raw response:

```ts
		const cache: ShelfCache = {
			version: 1,
			items: [...bookResults.map((result) => result.item), ...audiobooks],
			lastSuccessfulSyncAt: this.now(),
			archives: (shelf.archive ?? []).map((archive) => ({
				name: archive.name,
				bookIds: [...archive.bookIds],
			})),
		};
```

- [ ] **Step 5: Run sync, state, and full tests**

Run:

```bash
npm run test -- tests/shelf-sync-service.test.ts tests/shelf-state.test.ts
npm test
```

Expected: archive metadata is present after synchronization, old cache fixtures without `archives` remain valid, and all tests pass.

- [ ] **Step 6: Commit the API and cache change**

```bash
git add src/api/weread-client.ts src/services/shelf-sync-service.ts tests/shelf-sync-service.test.ts
git commit -m "feat: cache shelf archive metadata"
```

### Task 3: Wire the grouped filter into the shelf view

**Files:**
- Modify: `src/views/shelf-view.ts:232-244`

**Interfaces:**
- Consumes: `ShelfCache.archives` and `filterAndGroupShelf(..., archives?)` from Tasks 1 and 2.
- Produces: the `仅分组` option and archive-group rendering in the existing shelf view.

- [ ] **Step 1: Confirm the pure grouped behavior is green before changing the view**

Run:

```bash
npm run test -- tests/shelf-state.test.ts
```

Expected: PASS, establishing the behavior contract for the view wiring.

- [ ] **Step 2: Add the `仅分组` option and pass cached archives to the grouping helper**

Add the option to the existing “书籍类型” list in `renderControls`:

```ts
			[
				{ value: 'all', label: '全部图书' },
				{ value: 'books', label: '只有书籍' },
				{ value: 'grouped', label: '仅分组' },
			],
```

Update `renderGroups` to pass the optional cache field:

```ts
	private renderGroups(root: HTMLElement, cache: ShelfCache): void {
		const groups = filterAndGroupShelf(
			cache.items,
			this.filters,
			this.dependencies.getNoteText(),
			cache.archives ?? [],
		);
		if (groups.length === 0) {
			root.createDiv({ cls: 'weread-shelf__empty', text: '没有匹配的书籍。' });
			return;
		}

		for (const group of groups) {
			const section = root.createDiv({ cls: 'weread-shelf__section' });
			const heading = this.filters.type === 'grouped'
				? group.label
				: /^\d{4}$/.test(group.key) ? `${group.label} 年` : group.label;
			section.createEl('h3', { text: heading });
			const grid = section.createDiv({ cls: 'weread-shelf__grid' });
			for (const item of group.items) {
				this.renderCard(grid, item);
			}
		}
	}
```

The `filters.type` check prevents an archive named like `2026` from receiving the year suffix; existing numeric year groups retain their current title formatting.

- [ ] **Step 3: Run lint, typecheck, tests, and production build**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass, ESLint exits with code 0, TypeScript emits no errors, and esbuild produces the normal `dist/main.js` output.

- [ ] **Step 4: Commit the view wiring**

```bash
git add src/views/shelf-view.ts
git commit -m "feat: add grouped shelf filter"
```

### Task 4: Final requirement verification

**Files:**
- Verify: `src/api/weread-client.ts`
- Verify: `src/types.ts`
- Verify: `src/services/shelf-sync-service.ts`
- Verify: `src/utils/shelf-state.ts`
- Verify: `src/views/shelf-view.ts`
- Verify: `tests/shelf-state.test.ts`
- Verify: `tests/shelf-sync-service.test.ts`

- [ ] **Step 1: Re-read the approved design against the implementation diff**

Check each requirement directly in the diff:

```text
[ ] `仅分组` is present under `书籍类型`.
[ ] `archive[].name` is rendered as the group label.
[ ] `archive[].bookIds` associates items by item ID.
[ ] A multi-archive item is rendered in every matching group.
[ ] Archive order comes from the API response.
[ ] `未分组` is last and contains only items with no archive membership.
[ ] Each group uses the configured activity/title sort.
[ ] Search and status filters run before grouping.
[ ] Existing year grouping is unchanged for `all` and `books`.
[ ] Old caches without archives remain readable.
```

- [ ] **Step 2: Run the complete verification command set**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check HEAD~3..HEAD
git status --short
```

Expected: tests, lint, and build exit with code 0; the diff check has no output; and the worktree contains only expected generated build output and committed source changes.

- [ ] **Step 3: Review the final diff for generated artifacts**

Confirm `main.js`, `dist/`, and other generated files remain ignored or uncommitted according to the repository instructions, and that only source, tests, and approved documentation are part of the feature commits.
