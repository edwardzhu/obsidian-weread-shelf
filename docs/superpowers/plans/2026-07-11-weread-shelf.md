# WeRead Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a desktop-only Obsidian plugin that automatically refreshes a WeRead shelf, supports search/filter/grouped cards, and exports personal WeRead highlights and thoughts into safely managed local notes.

**Architecture:** The plugin uses native Obsidian `ItemView` and DOM APIs. A typed gateway client feeds a cache-backed shelf synchronization service; pure utilities implement status mapping, filtering, grouping, templates, and managed Markdown blocks. A separate note service owns explicit note export and a local index contributes associated-note text to shelf search.

**Tech Stack:** TypeScript, Obsidian API, esbuild, Vitest, native browser `fetch`, native Obsidian DOM helpers.

## Global Constraints

- Target desktop Obsidian only; `manifest.json` must set `isDesktopOnly` to `true`.
- Use Node `v26.5.0` and npm; install Vitest as a dev dependency and run tests with `vitest run`.
- Do not add a runtime UI framework or runtime dependencies; remove the unused Svelte dependency.
- Bundle `src/main.ts` to root `main.js` with esbuild and externalize the `obsidian` module.
- Keep `src/main.ts` limited to lifecycle composition, command/view registration, settings loading, and cleanup.
- The only remote gateway is `POST https://i.weread.qq.com/api/agent/gateway` with a Bearer API Key and `skill_version: "1.0.4"` in every body.
- Automatic remote work is limited to shelf refresh after plugin load with a configured API Key; note export is always command- or card-action-driven.
- Do not infer a listener-complete state for audiobooks. `albumInfo.finish` means the serial content is complete, not that the user finished listening.
- Do not fabricate WeRead URLs. Open only a `deepLink` supplied by the API.
- Do not write outside the vault, overwrite text outside managed markers, collect telemetry, or transmit vault content to WeRead.
- Keep user-facing strings in concise sentence case; use Obsidian icons and tooltips for compact card commands.

---

## Planned File Structure

| Path | Responsibility |
| --- | --- |
| `manifest.json` | Stable community-plugin metadata. |
| `esbuild.config.mjs` | Cross-platform bundle configuration. |
| `vitest.config.mts` | Node-environment unit-test configuration. |
| `src/main.ts` | Plugin composition and lifecycle only. |
| `src/settings.ts` | Persisted settings, defaults, and settings tab. |
| `src/types.ts` | Shared normalized domain types. |
| `src/api/errors.ts` | Typed gateway failure classes. |
| `src/api/weread-client.ts` | Typed API requests and pagination. |
| `src/services/shelf-cache-repository.ts` | Plugin-data shelf cache adapter. |
| `src/services/shelf-sync-service.ts` | Shelf refresh, enrichment, and audiobook-update detection. |
| `src/services/note-index-service.ts` | Associated-note text index. |
| `src/services/note-service.ts` | Note creation, association, and remote export orchestration. |
| `src/storage/plugin-data-store.ts` | Atomic settings, association, and shelf-cache persistence over Obsidian plugin data. |
| `src/storage/obsidian-note-store.ts` | Vault/file-manager adapter used by the note service. |
| `src/ui/create-note-modal.ts` | Template/blank-note and collision-choice modal. |
| `src/views/shelf-view.ts` | Native `ItemView`, controls, groups, and cards. |
| `src/commands/index.ts` | Stable command registration. |
| `src/utils/shelf-state.ts` | Pure status, search, filter, sort, and grouping functions. |
| `src/utils/async.ts` | Bounded concurrency helper. |
| `src/utils/note-content.ts` | Template interpolation and managed-block rendering. |
| `src/utils/note-path.ts` | Filename normalization and collision suffix generation. |
| `styles.css` | Responsive native shelf view styling. |
| `tests/**/*.test.ts` | Node unit tests grouped by module. |

### Task 1: Establish the Plugin Toolchain and Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Create: `manifest.json`
- Create: `esbuild.config.mjs`
- Create: `vitest.config.mts`
- Create: `styles.css`
- Create: `src/main.ts`
- Create: `tests/toolchain.test.ts`

**Interfaces:**
- Produces the executable commands `npm run build`, `npm run lint`, `npm run test`, and `npm run test:watch`.
- Produces a minimal default-exported `WereadShelfPlugin extends Plugin` entry point used by all later tasks.

- [ ] **Step 1: Record the failing baseline build**

Run: `npm run build`

Expected: FAIL because the current script references unavailable `svelte-check` and `webpack`.

- [ ] **Step 2: Add the build and test configuration**

Replace the stale scripts and unused dependency in `package.json` with this shape, then run `npm install -D vitest` so the lockfile records the resolved version:

```json
{
  "main": "main.js",
  "scripts": {
    "build": "npm run lint && tsc --noEmit && node esbuild.config.mjs",
    "dev": "node esbuild.config.mjs --watch",
    "lint": "eslint . --ext .ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {},
  "devDependencies": {
    "esbuild": "^0.28.1",
    "obsidian": "^1.13.1",
    "typescript": "^7.0.2"
  }
}
```

The preceding `npm install -D vitest` command adds the concrete Vitest version and updates `package-lock.json`; retain the resulting entry rather than hand-editing it.

Set `tsconfig.json` to check source only and preserve strict settings:

```json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "lib": ["dom", "es2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `esbuild.config.mjs`:

```js
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'main.js',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: watch,
  external: ['obsidian'],
  logLevel: 'info'
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
```

Create `vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
```

Create `manifest.json`:

```json
{
  "id": "obsidian-weread-shelf",
  "name": "WeRead Shelf",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Sync your WeRead shelf and personal reading notes.",
  "isDesktopOnly": true
}
```

Append `.superpowers/` to `.gitignore`. Create an empty `styles.css`. Create `src/main.ts`:

```ts
import { Plugin } from 'obsidian';

export default class WereadShelfPlugin extends Plugin {
  async onload(): Promise<void> {}
}
```

- [ ] **Step 3: Write the smoke test before building**

Create `tests/toolchain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('executes Vitest in the Node environment', () => {
    expect(typeof globalThis.fetch).toBe('function');
  });
});
```

- [ ] **Step 4: Verify the toolchain**

Run: `npm run test`

Expected: PASS with one test.

Run: `npm run build`

Expected: PASS and produce an untracked `main.js`.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.json .gitignore manifest.json esbuild.config.mjs vitest.config.mts styles.css src/main.ts tests/toolchain.test.ts
git commit -m "chore: establish plugin toolchain"
```

### Task 2: Define Shelf Domain Types and Pure View-State Logic

**Files:**
- Create: `src/types.ts`
- Create: `src/utils/shelf-state.ts`
- Test: `tests/shelf-state.test.ts`

**Interfaces:**
- Produces `ShelfItem`, `ElectronicBook`, `Audiobook`, `ShelfFilterState`, `YearGroup`, and `ShelfCache` for all later modules.
- Produces `toBookReadingState`, `toAudiobookListeningState`, `filterAndGroupShelf`, and `matchesShelfSearch` for the sync service and view.

- [ ] **Step 1: Write failing domain tests**

Create `tests/shelf-state.test.ts` with fixture helpers and these assertions:

```ts
import { describe, expect, it } from 'vitest';
import type { ShelfItem } from '../src/types';
import {
  filterAndGroupShelf,
  toAudiobookListeningState,
  toBookReadingState
} from '../src/utils/shelf-state';

const book: ShelfItem = {
  id: 'book-1', kind: 'book', title: 'The Book', author: 'Author', coverUrl: '',
  category: 'History', progress: 45, readingState: 'inProgress', lastActivityAt: 1768003200,
  intro: 'A complete history'
};

const audio: ShelfItem = {
  id: 'audio-1', kind: 'audiobook', title: 'The Audio', author: 'Narrator', coverUrl: '',
  category: '', listeningState: 'unheard', sourceUpdateTime: 1767916800,
  hasUnreadUpdate: false
};

describe('shelf state', () => {
  it('maps only 100 percent to completed', () => {
    expect(toBookReadingState(0)).toBe('unread');
    expect(toBookReadingState(1)).toBe('inProgress');
    expect(toBookReadingState(99)).toBe('inProgress');
    expect(toBookReadingState(100)).toBe('completed');
  });

  it('does not infer audiobook completion from serial completion', () => {
    expect(toAudiobookListeningState(0)).toBe('unheard');
    expect(toAudiobookListeningState(1768003200)).toBe('listening');
  });

  it('searches metadata and associated-note text, then groups by activity year', () => {
    const groups = filterAndGroupShelf(
      [book, audio],
      { query: 'annotation', type: 'all', status: 'active', sort: 'activity' },
      new Map([['book-1', 'My annotation about this history']])
    );
    expect(groups).toEqual([{ key: '2026', label: '2026', items: [book] }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/shelf-state.test.ts`

Expected: FAIL because `src/types.ts` and `src/utils/shelf-state.ts` do not exist.

- [ ] **Step 3: Implement the exact shared types and pure helpers**

Create `src/types.ts` with the following public model:

```ts
export type BookReadingState = 'unread' | 'inProgress' | 'completed';
export type AudiobookListeningState = 'unheard' | 'listening';
export type ItemTypeFilter = 'all' | 'books' | 'audiobooks';
export type StatusFilter = 'all' | 'inProgress' | 'unread' | 'completed' | 'active';
export type ShelfSort = 'activity' | 'title';

export interface ShelfItemBase {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  category: string;
  deepLink?: string;
  lastActivityAt?: number;
}

export interface ElectronicBook extends ShelfItemBase {
  kind: 'book';
  progress: number;
  readingState: BookReadingState;
  intro: string;
}

export interface Audiobook extends ShelfItemBase {
  kind: 'audiobook';
  listeningState: AudiobookListeningState;
  sourceUpdateTime: number;
  hasUnreadUpdate: boolean;
}

export type ShelfItem = ElectronicBook | Audiobook;

export interface ShelfFilterState {
  query: string;
  type: ItemTypeFilter;
  status: StatusFilter;
  sort: ShelfSort;
}

export interface YearGroup {
  key: string;
  label: string;
  items: ShelfItem[];
}

export interface ShelfCache {
  version: 1;
  items: ShelfItem[];
  lastSuccessfulSyncAt: number;
}
```

Implement `src/utils/shelf-state.ts` with these signatures and rules:

```ts
export function toBookReadingState(progress: number): BookReadingState;
export function toAudiobookListeningState(lastActivityAt: number | undefined): AudiobookListeningState;
export function matchesShelfSearch(item: ShelfItem, query: string, associatedNoteText: string): boolean;
export function filterAndGroupShelf(
  items: readonly ShelfItem[],
  filters: ShelfFilterState,
  noteTextByBookId: ReadonlyMap<string, string>
): YearGroup[];
```

Normalize search text with `toLocaleLowerCase()`. A `completed` filter returns only `ElectronicBook` items with `readingState === 'completed'`; `active` returns non-completed electronic books plus all audiobooks. Use `Not started` for missing `lastActivityAt`, sort numeric years descending, and apply title sorting only inside each group when requested.

- [ ] **Step 4: Expand tests for all filter combinations**

Add tests proving `books`, `audiobooks`, `unread`, `inProgress`, `completed`, `active`, title sorting, and the final `Not started` group each return the documented records. Run:

```bash
npm run test -- tests/shelf-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/types.ts src/utils/shelf-state.ts tests/shelf-state.test.ts
git commit -m "feat: add shelf state utilities"
```

### Task 3: Implement the Typed WeRead Gateway Client

**Files:**
- Create: `src/api/errors.ts`
- Create: `src/api/weread-client.ts`
- Test: `tests/weread-client.test.ts`

**Interfaces:**
- Consumes: `ShelfItem`-adjacent raw data only; does not import Obsidian APIs.
- Produces `WereadApi` consumed by `ShelfSyncService` and `NoteService`.

- [ ] **Step 1: Write failing client tests with mocked fetch**

Create `tests/weread-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { WereadGatewayError, WereadUpgradeRequiredError } from '../src/api/errors';
import { WereadClient } from '../src/api/weread-client';

describe('WereadClient', () => {
  it('sends flat gateway parameters with authorization and skill version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ books: [], albums: [] })));
    const client = new WereadClient('wrk-test', fetchImpl);
    await client.getShelf();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://i.weread.qq.com/api/agent/gateway',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer wrk-test' }),
        body: JSON.stringify({ api_name: '/shelf/sync', skill_version: '1.0.4' })
      })
    );
  });

  it('rejects an API errcode and an upgrade instruction', async () => {
    const apiError = new WereadClient('key', vi.fn().mockResolvedValue(new Response(JSON.stringify({ errcode: 401, errmsg: 'bad key' }))));
    await expect(apiError.getShelf()).rejects.toBeInstanceOf(WereadGatewayError);
    const upgrade = new WereadClient('key', vi.fn().mockResolvedValue(new Response(JSON.stringify({ upgrade_info: { message: 'upgrade' } }))));
    await expect(upgrade.getShelf()).rejects.toBeInstanceOf(WereadUpgradeRequiredError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/weread-client.test.ts`

Expected: FAIL because the client and error classes do not exist.

- [ ] **Step 3: Implement client errors, endpoint methods, and pagination**

Create `src/api/errors.ts`:

```ts
export class WereadGatewayError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'WereadGatewayError';
  }
}

export class WereadUpgradeRequiredError extends Error {
  constructor(public readonly instruction: string) {
    super(instruction);
    this.name = 'WereadUpgradeRequiredError';
  }
}
```

Create `src/api/weread-client.ts` with this public contract:

```ts
export interface RawShelfBook {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  category: string;
  deepLink?: string;
  readUpdateTime?: number;
  finishReading?: number;
}

export interface RawShelfAlbum {
  albumInfo: { albumId: string; name: string; authorName: string; cover: string; updateTime: number };
  albumInfoExtra: { lectureReadUpdateTime?: number };
}

export interface RawShelfResponse {
  books: RawShelfBook[];
  albums: RawShelfAlbum[];
}

export interface RawBookProgressResponse {
  book: { progress: number; updateTime?: number };
}

export interface RawBookInfoResponse {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  intro?: string;
  deepLink?: string;
}

export interface RawNotebookBook {
  bookId: string;
  book: { title: string; author: string; cover: string };
  bookmarkCount: number;
  noteCount: number;
  reviewCount: number;
  sort: number;
}

export interface RawBookmarkListResponse {
  updated: Array<{ bookmarkId: string; bookId: string; chapterUid: number; markText: string; createTime: number; range: string }>;
  chapters: Array<{ chapterUid: number; chapterIdx: number; title: string }>;
}

export interface RawReview {
  review: {
    reviewId: string;
    content: string;
    abstract?: string;
    range?: string;
    chapterUid?: number;
    chapterIdx?: number;
    chapterName?: string;
    createTime: number;
    star?: number;
  };
}

interface RawNotebookPage { books: RawNotebookBook[]; hasMore: 0 | 1; }
interface RawReviewPage { reviews: RawReview[]; hasMore: 0 | 1; synckey: number; }

export interface WereadApi {
  getShelf(): Promise<RawShelfResponse>;
  getBookProgress(bookId: string): Promise<RawBookProgressResponse>;
  getBookInfo(bookId: string): Promise<RawBookInfoResponse>;
  listNotebookBooks(): Promise<RawNotebookBook[]>;
  getBookmarks(bookId: string): Promise<RawBookmarkListResponse>;
  listMyReviews(bookId: string): Promise<RawReview[]>;
}

export class WereadClient implements WereadApi {
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async getShelf(): Promise<RawShelfResponse> { return this.request('/shelf/sync', {}); }
  async getBookProgress(bookId: string): Promise<RawBookProgressResponse> { return this.request('/book/getprogress', { bookId }); }
  async getBookInfo(bookId: string): Promise<RawBookInfoResponse> { return this.request('/book/info', { bookId }); }
  async listNotebookBooks(): Promise<RawNotebookBook[]> { return this.requestAllNotebooks(); }
  async getBookmarks(bookId: string): Promise<RawBookmarkListResponse> { return this.request('/book/bookmarklist', { bookId }); }
  async listMyReviews(bookId: string): Promise<RawReview[]> { return this.requestAllReviews(bookId); }

  private async requestAllNotebooks(): Promise<RawNotebookBook[]> {
    const records: RawNotebookBook[] = [];
    let lastSort: number | undefined;
    do {
      const parameters = lastSort === undefined ? { count: 100 } : { count: 100, lastSort };
      const page = await this.request<RawNotebookPage>('/user/notebooks', parameters);
      records.push(...page.books);
      if (page.hasMore !== 1) return records;
      const finalRecord = page.books.at(-1);
      if (finalRecord === undefined) throw new WereadGatewayError(-1, 'Notebook cursor page was empty');
      lastSort = finalRecord.sort;
    } while (true);
  }

  private async requestAllReviews(bookId: string): Promise<RawReview[]> {
    const records: RawReview[] = [];
    let synckey = 0;
    do {
      const page = await this.request<RawReviewPage>('/review/list/mine', { bookid: bookId, synckey, count: 100 });
      records.push(...page.reviews);
      if (page.hasMore !== 1) return records;
      if (page.synckey === synckey) throw new WereadGatewayError(-1, 'Review cursor did not advance');
      synckey = page.synckey;
    } while (true);
  }
}
```

Implement a private `request<T>(apiName: string, parameters: Record<string, unknown>): Promise<T>` that flattens `{ api_name, ...parameters, skill_version }`, checks `response.ok`, validates object JSON, checks `upgrade_info` before `errcode`, and throws the typed errors above. For `/user/notebooks`, request `{ count: 100 }`, then repeat with top-level `lastSort` from the final record while `hasMore === 1`. For `/review/list/mine`, start with `{ bookid, synckey: 0, count: 100 }` and repeat using the response `synckey` while `hasMore === 1`. Do not send `params`, `offset`, or `limit`.

- [ ] **Step 4: Add pagination and argument tests**

Mock two `/user/notebooks` pages and two `/review/list/mine` pages. Assert the second bodies contain top-level `lastSort` and `synckey`, and the returned arrays combine all records exactly once. Run:

```bash
npm run test -- tests/weread-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the API client**

```bash
git add src/api/errors.ts src/api/weread-client.ts tests/weread-client.test.ts
git commit -m "feat: add weread gateway client"
```

### Task 4: Add Cache-Backed Shelf Synchronization

**Files:**
- Create: `src/utils/async.ts`
- Create: `src/services/shelf-cache-repository.ts`
- Create: `src/services/shelf-sync-service.ts`
- Test: `tests/shelf-sync-service.test.ts`

**Interfaces:**
- Consumes: `WereadApi`, `ShelfCache`, `ShelfItem`, and status helpers from Tasks 2 and 3.
- Produces: `ShelfCacheRepository`, `ShelfSyncService.sync()`, and `ShelfSyncService.markAudiobookOpened()` for lifecycle and card actions.

- [ ] **Step 1: Write failing synchronization tests**

Create a fake `WereadApi` and repository in `tests/shelf-sync-service.test.ts` and test this contract:

```ts
const result = await service.sync();
expect(result.cache.items).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: 'book-1', kind: 'book', readingState: 'inProgress', intro: 'Searchable intro' }),
  expect.objectContaining({ id: 'album-1', kind: 'audiobook', listeningState: 'listening', hasUnreadUpdate: true })
]));
await service.markAudiobookOpened('album-1');
expect((await repository.load())?.items.find((item) => item.id === 'album-1')).toMatchObject({ hasUnreadUpdate: false });
```

Use a previous cache whose audiobook has `sourceUpdateTime: 10` and a current API response with `updateTime: 20` to prove that the update badge is derived from timestamp increase, not from `finish`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/shelf-sync-service.test.ts`

Expected: FAIL because cache and synchronization services do not exist.

- [ ] **Step 3: Implement bounded enrichment and cache mutation**

Create `src/utils/async.ts`:

```ts
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>
): Promise<R[]>;
```

Implement it with a shared next-index counter and at most `limit` workers; reject for `limit < 1`.

Create `src/services/shelf-cache-repository.ts`:

```ts
export interface ShelfCacheRepository {
  load(): Promise<ShelfCache | null>;
  save(cache: ShelfCache): Promise<void>;
}
```

Create `src/services/shelf-sync-service.ts`:

```ts
export interface ShelfSyncResult {
  cache: ShelfCache;
  failures: Array<{ itemId: string; operation: 'progress' | 'info'; message: string }>;
}

export class ShelfSyncService {
  constructor(
    private readonly api: WereadApi,
    private readonly cacheRepository: ShelfCacheRepository,
    private readonly now: () => number = () => Date.now(),
    private readonly concurrency = 4
  ) {}

  async sync(): Promise<ShelfSyncResult>;
  async markAudiobookOpened(itemId: string): Promise<void>;
}
```

`sync()` must normalize `/shelf/sync` books and albums. Enrich every electronic book with progress and info through `mapWithConcurrency`. If one enrichment fails, retain the previous cached progress or intro for the same ID where available, collect the failure, and continue. Map audiobooks using `lectureReadUpdateTime`; set `hasUnreadUpdate` only when a prior cached album has a lower `sourceUpdateTime`. Save one version-1 cache only after normalization completes.

- [ ] **Step 4: Cover partial failures and concurrency**

Add tests where one progress request rejects, one info request rejects, and five books are delayed. Assert the result preserves prior values, reports both failures, and never has more than four unresolved requests. Run:

```bash
npm run test -- tests/shelf-sync-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit shelf synchronization**

```bash
git add src/utils/async.ts src/services/shelf-cache-repository.ts src/services/shelf-sync-service.ts tests/shelf-sync-service.test.ts
git commit -m "feat: synchronize weread shelf cache"
```

### Task 5: Implement Template Rendering and Managed Note Content

**Files:**
- Create: `src/utils/note-content.ts`
- Create: `src/utils/note-path.ts`
- Test: `tests/note-content.test.ts`

**Interfaces:**
- Consumes: `ShelfItem` from Task 2 and exported note records from Task 3.
- Produces: safe, pure template and Markdown functions used by Task 6.

- [ ] **Step 1: Write failing template and managed-block tests**

Create `tests/note-content.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderBookTemplate, replaceWereadBlock } from '../src/utils/note-content';
import { makeDefaultNotePath } from '../src/utils/note-path';

describe('note content', () => {
  it('interpolates every supported template variable', () => {
    const rendered = renderBookTemplate('{{title}}|{{author}}|{{bookId}}|{{category}}|{{cover}}|{{readDate}}|{{wereadUrl}}', {
      title: 'Book', author: 'Writer', bookId: 'b-1', category: 'Fiction', cover: 'https://cover',
      readDate: '2026-07-11', wereadUrl: 'weread://book/b-1'
    });
    expect(rendered).toBe('Book|Writer|b-1|Fiction|https://cover|2026-07-11|weread://book/b-1');
  });

  it('replaces only the managed block and preserves handwritten text', () => {
    const result = replaceWereadBlock('# My thoughts\n\n<!-- weread-notes:start -->\nold\n<!-- weread-notes:end -->\n\nKeep this');
    expect(result).toContain('# My thoughts');
    expect(result).toContain('Keep this');
    expect(result).not.toContain('\nold\n');
  });

  it('uses a stable book-id suffix for a collision path', () => {
    expect(makeDefaultNotePath('Reading', 'A / B', '123')).toBe('Reading/A B.md');
    expect(makeDefaultNotePath('Reading', 'A / B', '123', true)).toBe('Reading/A B - 123.md');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/note-content.test.ts`

Expected: FAIL because the note utility modules do not exist.

- [ ] **Step 3: Implement exact pure note helpers**

Create `src/utils/note-content.ts`:

```ts
export const WEREAD_BLOCK_START = '<!-- weread-notes:start -->';
export const WEREAD_BLOCK_END = '<!-- weread-notes:end -->';

export interface TemplateVariables {
  title: string;
  author: string;
  bookId: string;
  category: string;
  cover: string;
  readDate: string;
  wereadUrl: string;
}

export interface RenderWereadExportInput {
  book: { title: string; author: string; deepLink?: string };
  bookmarkCount: number;
  highlights: Array<{ chapterTitle: string; bookmarkId: string; text: string }>;
  reviews: Array<{ content: string; abstract?: string; chapterTitle?: string; bookmarkRange?: string }>;
}

export function renderBookTemplate(template: string, variables: TemplateVariables): string;
export function replaceWereadBlock(existing: string, generatedContent?: string): string;
export function renderWereadExport(input: RenderWereadExportInput): string;
```

`renderBookTemplate` replaces only `{{title}}`, `{{author}}`, `{{bookId}}`, `{{category}}`, `{{cover}}`, `{{readDate}}`, and `{{wereadUrl}}`. `replaceWereadBlock` must replace an existing marker pair or append a marker pair after a trailing newline. `renderWereadExport` must produce book metadata, a deep link only when nonempty, chapter headings, blockquoted highlight text, linked thoughts under their highlight, separate chapter/whole-book thought sections, and a bookmark count. Escape no Markdown supplied by the user; preserve its literal content.

Create `src/utils/note-path.ts`:

```ts
export function sanitizeFileStem(title: string): string;
export function makeDefaultNotePath(folder: string, title: string, bookId: string, useBookIdSuffix?: boolean): string;
```

Strip Windows-invalid filename characters, collapse whitespace, and use `Untitled book` when no usable stem remains.

- [ ] **Step 4: Add export grouping tests**

Add one `renderWereadExport` fixture with two chapter highlights, one linked thought, one chapter review, one whole-book review, and a bookmark count. Assert their heading order and that the linked thought appears after its matching highlight. Run:

```bash
npm run test -- tests/note-content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit pure note helpers**

```bash
git add src/utils/note-content.ts src/utils/note-path.ts tests/note-content.test.ts
git commit -m "feat: add note content utilities"
```

### Task 6: Add Vault-Backed Note Association and Explicit Note Export

**Files:**
- Create: `src/storage/obsidian-note-store.ts`
- Create: `src/services/note-service.ts`
- Test: `tests/note-service.test.ts`

**Interfaces:**
- Consumes: `WereadApi`, note helpers, settings, and `ShelfItem` from earlier tasks.
- Produces `NoteStore` and `NoteService` for card actions and the batch command.

- [ ] **Step 1: Write failing service tests using an in-memory note store**

Create a `FakeNoteStore` in `tests/note-service.test.ts` and assert:

```ts
const created = await service.ensureNote(book, { kind: 'template', source: '# {{title}}' });
expect(created.path).toBe('Reading/The Book.md');
expect(created.content).toContain('weread-book-id: book-1');

await service.syncBookNotes(book, created.path);
expect((await fakeStore.read(created.path))?.content).toContain('<!-- weread-notes:start -->');
expect((await fakeStore.read(created.path))?.content).toContain('Keep this handwritten paragraph');

const batch = await service.syncAllNotes({ kind: 'blank' });
expect(batch.created).toContain('Reading/Second Book.md');
```

Make the fake API return notebook entries for `book-1` and `book-2`, highlights from `/book/bookmarklist`, and one linked review from `/review/list/mine`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/note-service.test.ts`

Expected: FAIL because note storage and export services do not exist.

- [ ] **Step 3: Implement the store contract and service**

Create `src/storage/obsidian-note-store.ts`:

```ts
export interface StoredNote {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface NoteStore {
  listMarkdown(folder: string): Promise<StoredNote[]>;
  read(path: string): Promise<StoredNote | null>;
  create(path: string, content: string): Promise<StoredNote>;
  modify(path: string, content: string): Promise<void>;
  setFrontmatter(path: string, values: Record<string, string>): Promise<void>;
}

export class ObsidianNoteStore implements NoteStore {
  constructor(private readonly app: App) {}

  async listMarkdown(folder: string): Promise<StoredNote[]> {
    const root = this.app.vault.getAbstractFileByPath(folder);
    if (!(root instanceof TFolder)) return [];
    const files = this.collectMarkdown(root.children);
    return Promise.all(files.map((file) => this.toStoredNote(file)));
  }

  async read(path: string): Promise<StoredNote | null> {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    return abstract instanceof TFile && abstract.extension === 'md' ? this.toStoredNote(abstract) : null;
  }

  async create(path: string, content: string): Promise<StoredNote> {
    return this.toStoredNote(await this.app.vault.create(path, content));
  }

  async modify(path: string, content: string): Promise<void> {
    const note = await this.read(path);
    if (note === null) throw new Error(`Missing note: ${path}`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Missing note file: ${path}`);
    await this.app.vault.modify(file, content);
  }

  async setFrontmatter(path: string, values: Record<string, string>): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Missing note file: ${path}`);
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => Object.assign(frontmatter, values));
  }

  private collectMarkdown(children: TAbstractFile[]): TFile[] {
    return children.flatMap((child) => {
      if (child instanceof TFile) return child.extension === 'md' ? [child] : [];
      return child instanceof TFolder ? this.collectMarkdown(child.children) : [];
    });
  }

  private async toStoredNote(file: TFile): Promise<StoredNote> {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    return { path: file.path, content: await this.app.vault.read(file), frontmatter };
  }
}
```

Import `App`, `TAbstractFile`, `TFile`, and `TFolder` from `obsidian` in this module.

Create `src/services/note-service.ts`:

```ts
export type TemplateChoice = { kind: 'blank' } | { kind: 'template'; source: string };

export interface NoteAssociationStore {
  getPath(bookId: string): string | undefined;
  setPath(bookId: string, path: string): Promise<void>;
}

export class NoteService {
  constructor(
    private readonly api: WereadApi,
    private readonly noteStore: NoteStore,
    private readonly associations: NoteAssociationStore,
    private readonly notesFolder: () => string
  ) {}

  async ensureNote(book: ShelfItem, choice: TemplateChoice, existingPath?: string): Promise<StoredNote>;
  async associateExistingNote(bookId: string, path: string): Promise<void>;
  async syncBookNotes(book: ShelfItem, path: string): Promise<void>;
  async syncAllNotes(choice: TemplateChoice, booksById: ReadonlyMap<string, ShelfItem>): Promise<BatchNoteSyncResult>;
}
```

`ensureNote` resolves the persisted association first, then a same-title note in the configured folder, then the selected existing path, and finally a collision-safe new path. Add `weread-book-id` through `setFrontmatter` for every new or associated note, then reread the file before returning it. `syncBookNotes` calls both bookmarks and reviews, renders the export, and changes only the marker block. `syncAllNotes` calls `listNotebookBooks()`, uses one already-selected `TemplateChoice` for every necessary creation, and records each created, updated, skipped, and failed path. When a notebook record is absent from `booksById`, create a minimal `ElectronicBook` from its returned title, author, and cover instead of dropping that user's note.

- [ ] **Step 4: Cover conflict and partial-batch behavior**

Add tests where a same-title unrelated note exists, the caller selects the suffix path, one batch book fails remotely, and another succeeds. Assert the unrelated file is untouched, the successful note updates, and the batch result reports exactly one failure. Run:

```bash
npm run test -- tests/note-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit note storage and export**

```bash
git add src/storage/obsidian-note-store.ts src/services/note-service.ts tests/note-service.test.ts
git commit -m "feat: export weread notes to vault"
```

### Task 7: Index Associated Local Notes for Shelf Search

**Files:**
- Create: `src/services/note-index-service.ts`
- Test: `tests/note-index-service.test.ts`

**Interfaces:**
- Consumes: `NoteStore` and book-ID-to-path associations from Task 6.
- Produces search text for Task 2's `filterAndGroupShelf` without indexing unrelated vault files.

- [ ] **Step 1: Write failing index tests**

Create `tests/note-index-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AssociatedNoteIndex } from '../src/services/note-index-service';

it('indexes only paths in the association map', async () => {
  const index = new AssociatedNoteIndex(fakeNoteStore);
  await index.rebuild(new Map([['book-1', 'Reading/book.md']]));
  expect(index.getText('book-1')).toContain('private note content');
  expect(index.getText('book-2')).toBe('');
  expect(fakeNoteStore.readCalls).toEqual(['Reading/book.md']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/note-index-service.test.ts`

Expected: FAIL because the index service does not exist.

- [ ] **Step 3: Implement rebuild and incremental update**

Create `src/services/note-index-service.ts`:

```ts
export class AssociatedNoteIndex {
  constructor(private readonly noteStore: NoteStore) {}

  async rebuild(associations: ReadonlyMap<string, string>): Promise<void>;
  async refreshBook(bookId: string, path: string | undefined): Promise<void>;
  getText(bookId: string): string;
  toMap(): ReadonlyMap<string, string>;
}
```

Build each text entry from the path, serialized frontmatter values, and Markdown body. On an unreadable or deleted note, store an empty string. Never enumerate the vault globally; `rebuild` reads only association-map paths.

- [ ] **Step 4: Test changed and removed associations**

Add tests for `refreshBook` after a note modification and after an association removal. Assert stale text is removed. Run:

```bash
npm run test -- tests/note-index-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the note index**

```bash
git add src/services/note-index-service.ts tests/note-index-service.test.ts
git commit -m "feat: index associated reading notes"
```

### Task 8: Add Settings, Persisted Plugin Data, and Template Selection UI

**Files:**
- Create: `src/settings.ts`
- Create: `src/storage/plugin-data-store.ts`
- Create: `src/ui/create-note-modal.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: settings types, `TemplateChoice`, and `NoteStore` from Tasks 2 and 6.
- Produces `WereadShelfSettings`, `DEFAULT_SETTINGS`, `mergeSettings`, `PluginDataStore`, `WereadShelfSettingTab`, and `CreateNoteModal` for main/plugin actions.

- [ ] **Step 1: Write failing settings tests**

Create `tests/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings';

describe('settings', () => {
  it('merges partial persisted settings without dropping defaults', () => {
    expect(mergeSettings({ notesFolder: 'Reading' })).toEqual({
      ...DEFAULT_SETTINGS,
      notesFolder: 'Reading'
    });
  });
});
```

Add an in-memory `loadPluginData`/`savePluginData` pair and assert that `PluginDataStore.updateSettings()` preserves an existing `shelfCache`, while `setPath()` preserves the API Key and cache.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/settings.test.ts`

Expected: FAIL because settings exports do not exist.

- [ ] **Step 3: Implement settings and modal contracts**

Create `src/settings.ts` with the exact settings shape:

```ts
export interface WereadShelfSettings {
  apiKey: string;
  notesFolder: string;
  templateFolder: string;
  webOpenTarget: 'tab' | 'window';
  entryMode: 'web' | 'app';
  sort: ShelfSort;
  associations: Record<string, string>;
}

export const DEFAULT_SETTINGS: WereadShelfSettings = {
  apiKey: '', notesFolder: 'WeRead', templateFolder: '', webOpenTarget: 'tab',
  entryMode: 'web', sort: 'activity', associations: {}
};

export function mergeSettings(data: Partial<WereadShelfSettings> | null | undefined): WereadShelfSettings;
```

Implement `WereadShelfSettingTab` with settings fields for API Key, notes folder, template folder, web-open target, entry mode, and sort mode. Validate folder values as vault-relative paths and save on change.

Create `src/storage/plugin-data-store.ts` so settings and cache never overwrite one another:

```ts
export interface PersistedPluginData {
  settings?: Partial<WereadShelfSettings>;
  shelfCache?: ShelfCache;
}

export class PluginDataStore implements NoteAssociationStore {
  constructor(
    private readonly loadPluginData: () => Promise<PersistedPluginData | null>,
    private readonly savePluginData: (data: PersistedPluginData) => Promise<void>
  ) {}

  async initialize(): Promise<WereadShelfSettings>;
  getSettings(): WereadShelfSettings;
  async updateSettings(settings: WereadShelfSettings): Promise<void>;
  async getCache(): Promise<ShelfCache | null>;
  async setCache(cache: ShelfCache): Promise<void>;
  getPath(bookId: string): string | undefined;
  async setPath(bookId: string, path: string): Promise<void>;
}
```

`initialize` calls `mergeSettings`, retains a loaded `shelfCache`, and stores normalized data only when migration changes it. Each mutation must clone the current top-level object and save both the current settings and cache, so changing an association cannot discard cached shelf data.

Create `src/ui/create-note-modal.ts` with:

```ts
export interface NoteCreationRequest {
  book: ShelfItem;
  candidatePaths: readonly string[];
  purpose: 'single' | 'batch';
}

export class CreateNoteModal extends Modal {
  constructor(
    app: App,
    request: NoteCreationRequest,
    templates: readonly StoredNote[],
    onChoose: (choice: TemplateChoice, existingPath?: string) => Promise<void>
  ) { super(app); }
}
```

List configured-folder templates plus `Blank note`; render a separate existing-note association option whenever `candidatePaths` is nonempty. For a batch run, collect one template or blank selection before the service begins creating files.

- [ ] **Step 4: Verify pure settings behavior and lint UI code**

Run:

```bash
npm run test -- tests/settings.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit settings and selection UI**

```bash
git add src/settings.ts src/storage/plugin-data-store.ts src/ui/create-note-modal.ts tests/settings.test.ts
git commit -m "feat: add weread shelf settings"
```

### Task 9: Build the Native Shelf View and Responsive Styles

**Files:**
- Create: `src/views/shelf-view.ts`
- Modify: `styles.css`
- Test: `tests/shelf-state.test.ts`

**Interfaces:**
- Consumes: `ShelfSyncService`, `AssociatedNoteIndex`, `NoteService`, `ShelfFilterState`, and `filterAndGroupShelf`.
- Produces `SHELF_VIEW_TYPE` and `ShelfView`, used by Task 10 to register and open the workspace tab.

- [ ] **Step 1: Add a failing view-model assertion**

Extend `tests/shelf-state.test.ts` to prove a card-model fixture exposes the exact date label and activity-year group:

```ts
expect(formatActivityLabel(book)).toBe('Last read 2026-01-09');
expect(formatActivityLabel(audio)).toBe('Not started');
```

Add `formatActivityLabel` to the test import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/shelf-state.test.ts`

Expected: FAIL because `formatActivityLabel` is not exported.

- [ ] **Step 3: Implement the view and complete presentation helpers**

Add this helper to `src/utils/shelf-state.ts`:

```ts
export function formatActivityLabel(item: ShelfItem): string;
```

It returns `Last read YYYY-MM-DD` for books with activity, `Last listened YYYY-MM-DD` for audiobooks with activity, and `Not started` otherwise.

Create `src/views/shelf-view.ts`:

```ts
export const SHELF_VIEW_TYPE = 'weread-shelf-view';

export interface ShelfViewDependencies {
  getCache(): Promise<ShelfCache | null>;
  getSettings(): WereadShelfSettings;
  getNoteText(): ReadonlyMap<string, string>;
  syncShelf(): Promise<ShelfSyncResult>;
  openWeread(item: ShelfItem): Promise<void>;
  openOrCreateNote(item: ShelfItem): Promise<void>;
  syncBookNotes(item: ShelfItem): Promise<void>;
}

export class ShelfView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly dependencies: ShelfViewDependencies) { super(leaf); }
  getViewType(): string { return SHELF_VIEW_TYPE; }
  getDisplayText(): string { return 'WeRead shelf'; }
  async onOpen(): Promise<void>;
  async refresh(): Promise<void>;
}
```

Render one unframed view root with: title, book/audiobook stats, sync button, last-successful-sync text, a fixed search input, type/status segmented controls, and activity-year sections. Each card uses `setIcon` buttons with `aria-label` and `setTooltip` for open WeRead, open/create note, and sync notes. Cards show cover, title, author/narrator, state, local-note indicator, exact activity label, completed-book badge, and audiobook `Update` badge. Use `filterAndGroupShelf` with the note index map on every control change. Show a retryable empty/error state if cache and refresh are unavailable.

Replace `styles.css` with stable responsive rules:

```css
.weread-shelf__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 12px; }
.weread-shelf__card { position: relative; min-width: 0; border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.weread-shelf__cover { aspect-ratio: 2 / 3; width: 100%; object-fit: cover; }
.weread-shelf__filters { display: flex; flex-wrap: wrap; gap: 8px; }
```

Use CSS variables rather than a fixed palette, reserve cover/card dimensions, and add a narrow-width media rule that preserves readable controls without overlap.

- [ ] **Step 4: Verify the view-model test and plugin bundle**

Run:

```bash
npm run test -- tests/shelf-state.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Perform the focused Obsidian manual check**

Copy `main.js`, `manifest.json`, and `styles.css` to a test vault plugin folder. Enable the plugin with a fixture cache and verify:

1. The shelf opens in a workspace tab.
2. Search matches a title and associated-note text.
3. Both segmented controls combine correctly.
4. `2026`, older year, and `Not started` groups appear in order.
5. Long titles, badges, and icon buttons do not overlap at a narrow pane width.

- [ ] **Step 6: Commit the shelf view**

```bash
git add src/utils/shelf-state.ts src/views/shelf-view.ts styles.css tests/shelf-state.test.ts
git commit -m "feat: add weread shelf view"
```

### Task 10: Compose Lifecycle, Commands, and Automatic Refresh

**Files:**
- Create: `src/commands/index.ts`
- Create: `src/services/plugin-runtime.ts`
- Modify: `src/main.ts`
- Test: `tests/plugin-runtime.test.ts`

**Interfaces:**
- Consumes: every service and view from Tasks 3 through 9.
- Produces the loaded plugin behavior, registered view, commands, settings tab, background refresh, and vault-change reindexing.

- [ ] **Step 1: Write a failing lifecycle test around a dependency-free runtime coordinator**

Create a dependency-free coordinator in `src/services/plugin-runtime.ts` and test it in `tests/plugin-runtime.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PluginRuntime } from '../src/services/plugin-runtime';

it('refreshes only the shelf after startup when an API key exists', async () => {
  const syncShelf = vi.fn().mockResolvedValue(undefined);
  const syncNotes = vi.fn();
  const runtime = new PluginRuntime(() => 'wrk-key', syncShelf, syncNotes);
  await runtime.start();
  expect(syncShelf).toHaveBeenCalledTimes(1);
  expect(syncNotes).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/plugin-runtime.test.ts`

Expected: FAIL because `PluginRuntime` does not exist.

- [ ] **Step 3: Implement lifecycle composition and stable commands**

Create `src/services/plugin-runtime.ts` with this testable coordinator:

```ts
export class PluginRuntime {
  constructor(
    private readonly getApiKey: () => string,
    private readonly syncShelf: () => Promise<unknown>,
    private readonly syncNotes: () => Promise<unknown>
  ) {}

  async start(): Promise<void> {
    if (this.getApiKey().trim() !== '') {
      await this.syncShelf();
    }
  }
}
```

In `WereadShelfPlugin.onload()`:

1. Construct `PluginDataStore(() => this.loadData(), (data) => this.saveData(data))` and await `initialize()`.
2. Construct the cache adapter as `{ load: () => dataStore.getCache(), save: (cache) => dataStore.setCache(cache) }`; pass `dataStore` itself as `NoteAssociationStore`.
3. Create `WereadClient`, `ShelfSyncService`, `NoteService`, and `AssociatedNoteIndex` behind settings-aware factories that read `dataStore.getSettings()` at operation time.
4. Register `SHELF_VIEW_TYPE`, the settings tab, and the commands below.
5. Rebuild the associated-note index from saved associations.
6. Start background refresh with `void runtime.start().catch((error: unknown) => this.handleBackgroundRefreshFailure(error));` so startup remains non-blocking. `handleBackgroundRefreshFailure` records the message for the shelf view and leaves the persisted cache untouched instead of throwing from `onload`.
7. Register vault `modify`, `delete`, and `rename` events through `this.registerEvent`; debounce index refresh only when a changed path is in the association map.
8. Detach all leaves of `SHELF_VIEW_TYPE` in `onunload()`.

Create `src/commands/index.ts`:

```ts
export function registerCommands(plugin: WereadShelfPlugin): void {
  plugin.addCommand({ id: 'open-weread-shelf', name: 'Open WeRead shelf', callback: () => plugin.openShelfView() });
  plugin.addCommand({ id: 'sync-weread-shelf', name: 'Sync WeRead shelf', callback: () => plugin.syncShelfFromCommand() });
  plugin.addCommand({ id: 'sync-all-weread-notes', name: 'Sync all WeRead notes', callback: () => plugin.syncAllNotesFromCommand() });
}
```

`openShelfView()` uses `workspace.getLeaf('tab')`, `setViewState({ type: SHELF_VIEW_TYPE, active: true })`, and `revealLeaf`. Commands and card actions must show a notice for missing API Key, failed remote calls, invalid template folder, path conflict, unavailable deep link, and partial note export. Use the template modal once before a batch export begins.

- [ ] **Step 4: Expand lifecycle tests**

Add cases for blank API Key, rejected shelf refresh, and a view refresh callback after a successful sync. Assert blank keys make no request and failures do not call note synchronization. Run:

```bash
npm run test -- tests/plugin-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit lifecycle integration**

```bash
git add src/main.ts src/commands/index.ts src/services/plugin-runtime.ts tests/plugin-runtime.test.ts
git commit -m "feat: wire weread shelf plugin lifecycle"
```

### Task 11: Complete Documentation and Release Verification

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`
- Test: `tests/**/*.test.ts`

**Interfaces:**
- Consumes: complete plugin behavior from Tasks 1 through 10.
- Produces accurate user documentation and a release-ready local bundle.

- [ ] **Step 1: Write the final README acceptance checklist before the release run**

Add a `Verification` section to `README.md` with these exact manual checks:

```markdown
1. Configure an API Key, notes folder, and template folder.
2. Reload the plugin and confirm the shelf refresh starts without blocking Obsidian.
3. Verify search, type/status filters, yearly groups, local-note matching, and audiobook Update badges.
4. Create a note with a template, edit text outside the WeRead block, then sync the same book and confirm the edit remains.
5. Run Sync all WeRead notes and confirm one template choice applies to each newly created note.
6. Disable network access and confirm cached shelf browsing continues while remote actions show a retryable error.
```

- [ ] **Step 2: Update user documentation and manifest version**

Document the three commands, automatic shelf-only startup refresh, the two filter dimensions, associated-note search limitation, managed-block markers, audiovisual state semantics, and Update-badge clearing behavior. Keep the API-Key instructions and disclose the gateway URL. Keep `manifest.json` at version `0.1.0` unless implementation changes its public release scope.

- [ ] **Step 3: Run the complete automated verification**

Run:

```bash
npm run test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit `0`; `main.js` is generated but ignored; no whitespace errors appear.

- [ ] **Step 4: Run end-to-end Obsidian verification**

Install release artifacts in `<Vault>/.obsidian/plugins/obsidian-weread-shelf/`, reload Obsidian, and verify all six README checks. Also verify a rejected API Key, an API `upgrade_info` response, and a partial note export render clear error notices without deleting cache or handwritten note content.

- [ ] **Step 5: Commit documentation and release metadata**

```bash
git add README.md manifest.json
git commit -m "docs: document weread shelf workflow"
```

## Plan Self-Review

### Spec coverage

- Build baseline, desktop manifest, no Svelte, and source modularity: Task 1.
- Gateway authorization, flat parameters, skill version, errors, and pagination: Task 3.
- Cache-first data, automatic non-blocking shelf refresh, progress mapping, bounded concurrency, and audiobook Update state: Tasks 4 and 10.
- Search, two filter dimensions, date labels, stats, groups, card badges/actions, and responsive view: Tasks 2 and 9.
- Settings, templates, associations, safe naming, note export markers, highlights/reviews, batch and per-book sync: Tasks 5, 6, and 8.
- Associated-note-only indexing and vault-change updates: Tasks 7 and 10.
- Privacy, errors, test coverage, manual verification, and documentation: Tasks 1, 3, 4, 6, 10, and 11.

### Type consistency

`ShelfItem`, `ShelfCache`, `WereadApi`, `NoteStore`, `TemplateChoice`, `ShelfSyncService`, and `AssociatedNoteIndex` are defined before their consuming tasks. `filterAndGroupShelf` consistently receives a `ReadonlyMap<string, string>` of associated-note text.

### Placeholder scan

The plan contains no deferred implementation markers. Every code-producing task names its files, public contracts, test command, expected outcome, and commit command.
