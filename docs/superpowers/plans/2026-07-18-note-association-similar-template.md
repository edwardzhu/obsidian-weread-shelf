# Note association, similar-note discovery, and template selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the shelf card note action open valid associations directly, offer safe connections to similar notes, and provide blank or configured-template creation choices.

**Architecture:** Add a pure candidate-ranking utility over Markdown note paths, let `main.ts` scope discovery to the configured notes folder, and extend the existing `CreateNoteModal` for candidate connection and creation choices. Use `NoteService.associateExistingNote()` for selected candidates so a disappeared file cannot become a newly created or invalid association.

**Tech Stack:** TypeScript, Obsidian `Modal`/`Setting`, existing `NoteStore`, Vitest.

## Global Constraints

- Search only the configured `notesFolder` and its subfolders.
- Match normalized filename stems against the normalized book title using exact and contains-based matching.
- Show at most five candidates, with exact matches ranked before partial matches and paths as the final tie-breaker.
- A valid association opens directly without showing a modal.
- Connecting an existing candidate writes the association and `weread-book-id` frontmatter without changing note content.
- A disappeared candidate must fail safely and must not create a replacement or persist an invalid association.
- New notes always offer a no-template choice; configured templates come from the existing `templateFolder` setting and recursive Markdown listing.
- Keep batch note synchronization behavior working.
- Do not change WeRead network behavior, shelf synchronization, or persisted settings shape.
- Preserve unrelated working-tree changes, including the existing deletion of `src/ui/shelf-toolbar.ts` and existing untracked plan documents.

---

### Task 1: Add deterministic similar-note candidate matching

**Files:**
- Create: `src/utils/note-candidates.ts`
- Test: `tests/note-candidates.test.ts`

**Interfaces:**
- Consumes: `StoredNote` paths from `src/storage/obsidian-note-store.ts` and a book title.
- Produces: `findSimilarNotePaths(notes, title, limit?)` returning candidate paths in deterministic rank order.

- [ ] **Step 1: Write failing tests for exact, partial, and bounded matching**

Create tests using note paths such as `Reading/The Book.md`, `Reading/The Book - notes.md`, `Reading/Other.md`, and a note outside the intended folder to document that the utility only ranks the notes it receives. Assert exact normalized matches precede partial matches, whitespace/case differences normalize, non-matches are excluded, and a limit of five is enforced.

```ts
it('ranks normalized exact matches before contains matches', () => {
	const notes = [
		{ path: 'Reading/The Book - notes.md' },
		{ path: 'Reading/the  book.md' },
		{ path: 'Reading/Other.md' },
	];

	expect(findSimilarNotePaths(notes, ' The   BOOK ')).toEqual([
		'Reading/the  book.md',
		'Reading/The Book - notes.md',
	]);
});

it('returns no more than five partial matches in path order', () => {
	const notes = Array.from({ length: 6 }, (_, index) => ({
		path: `Reading/Book ${index}.md`,
	}));

	expect(findSimilarNotePaths(notes, 'Book')).toEqual(
		notes.slice(0, 5).map((note) => note.path),
	);
});
```

- [ ] **Step 2: Run the focused tests and verify the expected missing-module failure**

Run: `npx vitest run tests/note-candidates.test.ts`

Expected: the test file fails because `src/utils/note-candidates.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal candidate utility**

Add the following public function and helpers:

```ts
import type { StoredNote } from '../storage/obsidian-note-store';

export function findSimilarNotePaths(
	notes: readonly Pick<StoredNote, 'path'>[],
	title: string,
	limit = 5,
): string[] {
	if (limit <= 0) return [];
	const normalizedTitle = normalizeNoteName(title);
	if (normalizedTitle === '') return [];

	return notes
		.map((note) => ({
			path: note.path,
			name: normalizeNoteName(getFileStem(note.path)),
		}))
		.filter(({ path, name }) => path.toLowerCase().endsWith('.md') && name !== '')
		.map((candidate) => ({
			...candidate,
			rank: candidate.name === normalizedTitle ? 0
				: candidate.name.includes(normalizedTitle) || normalizedTitle.includes(candidate.name) ? 1
				: 2,
		}))
		.filter((candidate) => candidate.rank < 2)
		.sort((left, right) => left.rank - right.rank || left.path.localeCompare(right.path))
		.slice(0, limit)
		.map((candidate) => candidate.path);
}

function getFileStem(path: string): string {
	const fileName = path.slice(path.lastIndexOf('/') + 1);
	return fileName.toLowerCase().endsWith('.md') ? fileName.slice(0, -3) : fileName;
}

function normalizeNoteName(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run tests/note-candidates.test.ts`

Expected: all candidate-ranking tests pass.

- [ ] **Step 5: Commit the self-contained utility**

```bash
git add src/utils/note-candidates.ts tests/note-candidates.test.ts
git commit -m "feat: find similar note candidates"
```

### Task 2: Make existing-note association safe and testable

**Files:**
- Modify: `src/services/note-service.ts`
- Test: `tests/note-service.test.ts`

**Interfaces:**
- Consumes: the existing `NoteService.associateExistingNote(bookId, path)` API.
- Produces: validation that a selected candidate exists before association, frontmatter tagging without body changes, and a clear error for a missing candidate.

- [ ] **Step 1: Add a failing test for candidate association safety**

Add tests that seed a note with handwritten content, call `associateExistingNote('book-1', path)`, and assert the association is stored, `weread-book-id` is added, and the body remains unchanged. Add a second assertion that associating a missing path rejects and leaves the association store unchanged.

```ts
it('associates an existing note without changing its body', async () => {
	const fakeStore = new FakeNoteStore([
		{ path: 'Reading/Existing.md', content: '# Keep me\n', frontmatter: {} },
	]);
	const associations = new MemoryAssociations();
	const service = new NoteService(new FakeWereadApi(), fakeStore, associations, () => 'Reading');

	await service.associateExistingNote('book-1', 'Reading/Existing.md');

	expect(associations.getPath('book-1')).toBe('Reading/Existing.md');
	expect(await fakeStore.read('Reading/Existing.md')).toEqual({
		path: 'Reading/Existing.md',
		content: '---\nweread-book-id: book-1\n---\n# Keep me\n',
		frontmatter: { 'weread-book-id': 'book-1' },
	});
});

it('does not associate a candidate that disappeared', async () => {
	const associations = new MemoryAssociations();
	const service = new NoteService(new FakeWereadApi(), new FakeNoteStore(), associations, () => 'Reading');

	await expect(service.associateExistingNote('book-1', 'Reading/Missing.md'))
		.rejects.toThrow('Missing note: Reading/Missing.md');

	expect(associations.getPath('book-1')).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-file test fails**

Run: `npx vitest run tests/note-service.test.ts`

Expected: the existing-note body test passes with current behavior, while the missing-file test fails because `associateExistingNote()` currently writes the association before validating the note.

- [ ] **Step 3: Validate the note before mutating association state**

Update `associateExistingNote()` to read the path first, throw `Missing note: ${path}` when the note is absent, then set the association and frontmatter. Keep `ensureNote()` and its existing selected-path creation semantics unchanged for batch and existing callers.

```ts
async associateExistingNote(bookId: string, path: string): Promise<void> {
	if (await this.noteStore.read(path) === null) {
		throw new Error(`Missing note: ${path}`);
	}
	await this.associations.setPath(bookId, path);
	await this.noteStore.setFrontmatter(path, { 'weread-book-id': bookId });
}
```

- [ ] **Step 4: Run the note-service tests and verify all pass**

Run: `npx vitest run tests/note-service.test.ts`

Expected: all existing batch/creation tests and the new association tests pass.

- [ ] **Step 5: Commit the safe association behavior**

```bash
git add src/services/note-service.ts tests/note-service.test.ts
git commit -m "fix: validate existing notes before association"
```

### Task 3: Wire candidate discovery into the shelf workflow

**Files:**
- Modify: `src/main.ts:155-176, 203-216`
- Test: `tests/note-candidates.test.ts` (extend only if needed for integration-facing inputs)

**Interfaces:**
- Consumes: `noteStore.listMarkdown()`, `findSimilarNotePaths()`, `NoteService.associateExistingNote()`, and `CreateNoteModal`.
- Produces: the shelf action's valid-association fast path, notes-folder-scoped candidate list, safe candidate connection, and Notice-backed error handling.

- [ ] **Step 1: Add the candidate loading seam before changing the workflow**

Add a private helper in `WereadShelfPlugin`:

```ts
private async findCandidatePaths(item: ShelfItem): Promise<string[]> {
	const notes = await this.noteStore.listMarkdown(this.dataStore.getSettings().notesFolder);
	return findSimilarNotePaths(notes, item.title);
}
```

Import `findSimilarNotePaths` from `src/utils/note-candidates.ts`.

- [ ] **Step 2: Pass candidates to the existing creation modal**

In `openOrCreateNote()`, keep the current valid association check first. For the fallback flow, load candidates and templates, then construct the request with `candidatePaths` instead of `[]`:

```ts
const candidatePaths = await this.findCandidatePaths(item);
const templates = await this.loadTemplates();
new CreateNoteModal(
	this.app,
	{ book: item, candidatePaths, purpose: 'single' },
	templates,
	async (choice, existingPath) => {
		if (existingPath !== undefined) {
			await this.createNoteService().associateExistingNote(item.id, existingPath);
			await this.noteIndex.refreshBook(item.id, existingPath);
			await this.openMarkdown(existingPath);
		} else {
			const note = await this.createNoteService().ensureNote(item, choice);
			await this.noteIndex.refreshBook(item.id, note.path);
			await this.openMarkdown(note.path);
		}
		await this.refreshShelfViews();
	},
).open();
```

This makes candidate selection association-only; it cannot recreate a disappeared candidate.

- [ ] **Step 3: Add Notice handling around discovery and selection failures**

Wrap candidate/template loading in `try/catch` and show `无法查找可用笔记：${getErrorMessage(error)}`. Wrap the modal callback body in `try/catch` and show `笔记操作失败：${getErrorMessage(error)}`. Keep modal closing in `CreateNoteModal`'s existing `finally` path.

- [ ] **Step 4: Run type checking and the relevant service tests**

Run: `npx vitest run tests/note-candidates.test.ts tests/note-service.test.ts` and `npx tsc --noEmit`.

Expected: both test files pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the workflow wiring**

```bash
git add src/main.ts
git commit -m "feat: offer similar notes before creation"
```

### Task 4: Update and test the note-selection modal

**Files:**
- Modify: `src/ui/create-note-modal.ts`
- Modify: `tests/__mocks__/obsidian.ts`
- Create: `tests/create-note-modal.test.ts`

**Interfaces:**
- Consumes: `NoteCreationRequest.candidatePaths`, `TemplateChoice`, and the existing modal callback.
- Produces: Chinese candidate/creation actions, explicit no-template choice, and no-op close behavior.

- [ ] **Step 1: Add modal test infrastructure and failing interaction tests**

Extend the Obsidian test mock with a minimal `Modal` exposing `contentEl`, `open()`, and `close()`, and a `Setting` mock that records each setting name and button text/callback. Add tests that instantiate `CreateNoteModal` with one candidate and one template, invoke `onOpen()`, and assert:

```ts
expect(renderedSettingNames).toContain('Reading/Existing.md');
expect(renderedButtonTexts).toContain('连接并打开');
expect(renderedSettingNames).toContain('不使用模板');
expect(renderedSettingNames).toContain('模板：Reading/template.md');
```

Invoke the candidate and blank callbacks and assert the modal callback receives `{ kind: 'blank' }` plus the candidate path for the candidate action, and `{ kind: 'blank' }` without a path for the blank action. Call `onClose()` and assert the fake content element is emptied without invoking the callback.

- [ ] **Step 2: Run the focused modal tests and verify they fail on the old English labels/behavior**

Run: `npx vitest run tests/create-note-modal.test.ts`

Expected: the test fails because the current modal labels use English text and the test mock does not yet expose the required interaction hooks.

- [ ] **Step 3: Implement the modal labels and explicit actions**

Keep the existing callback contract and change the single-note UI to:

```ts
contentEl.createEl('h2', { text: '选择或创建笔记' });

new Setting(contentEl)
	.setName(`候选笔记：${path}`)
	.addButton((button) => {
		button.setButtonText('连接并打开').onClick(() => this.choose({ kind: 'blank' }, path));
	});

new Setting(contentEl)
	.setName('不使用模板')
	.addButton((button) => {
		button.setButtonText('新建').onClick(() => this.choose({ kind: 'blank' }));
	});

new Setting(contentEl)
	.setName(`模板：${template.path}`)
	.addButton((button) => {
		button.setButtonText('使用模板').onClick(() =>
			this.choose({ kind: 'template', source: template.content }),
		);
	});
```

Keep the batch title and callback behavior compatible with `syncAllNotesFromCommand()`.

- [ ] **Step 4: Run modal and existing note tests**

Run: `npx vitest run tests/create-note-modal.test.ts tests/note-service.test.ts`

Expected: the new modal tests and all note-service tests pass.

- [ ] **Step 5: Commit the modal behavior**

```bash
git add src/ui/create-note-modal.ts tests/__mocks__/obsidian.ts tests/create-note-modal.test.ts
git commit -m "feat: add note connection and template choices"
```

### Task 5: Full verification and handoff

**Files:**
- Verify: `src/main.ts`, `src/services/note-service.ts`, `src/ui/create-note-modal.ts`, `src/utils/note-candidates.ts`, and their tests.

- [ ] **Step 1: Run all relevant tests**

Run: `npx vitest run --exclude tests/shelf-toolbar.test.ts`

Expected: all relevant test files pass. The excluded toolbar test is a known workspace baseline issue because `src/ui/shelf-toolbar.ts` is already deleted while the old test still imports it.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Expected: exit code 0; the existing ESLint ignore deprecation warning may appear without lint errors.

Run: `npm run build`

Expected: exit code 0 with a successful TypeScript check and plugin bundle.

- [ ] **Step 3: Check the final diff and status**

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only the intended feature files are changed in addition to the pre-existing working-tree changes and plan documents.

- [ ] **Step 4: Report the implementation and any baseline test limitation**

Include the changed file links, relevant test counts, lint/build results, and the stale toolbar-test limitation if it remains unresolved. Do not claim the unexcluded full suite passes unless `npm test` exits successfully.
