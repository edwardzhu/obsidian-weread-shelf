# Obsidian WeRead Shelf Design

## Scope

Build a desktop-only Obsidian community plugin that connects to a user's WeRead account through an API Key. The plugin provides a remotely refreshed shelf, searchable and filterable card view, template-backed local reading notes, and on-demand synchronization of personal highlights and thoughts.

The initial release includes the complete README feature set. It does not support mobile, telemetry, automated note synchronization on startup, importing WeRead data outside the current vault, or user-completion tracking for audiobooks because the available API does not expose it.

## Platform and build baseline

- Target Obsidian desktop and set `isDesktopOnly` to `true` in `manifest.json`.
- Use TypeScript and the existing `obsidian` package. Keep runtime dependencies to zero; do not use Svelte.
- Replace the stale Webpack/Svelte scripts with the existing esbuild dependency and an esbuild configuration that bundles `src/main.ts` into root `main.js`.
- Keep `main.ts` limited to lifecycle setup, settings loading, commands, ribbon/view registration, and cleanup. Feature modules live under `src/`.
- Release artifacts are `main.js`, `manifest.json`, and `styles.css` at the plugin root. Generated files and `node_modules` are not committed.

## WeRead gateway

All remote calls use `POST https://i.weread.qq.com/api/agent/gateway` with `Authorization: Bearer <apiKey>`, `Content-Type: application/json`, a top-level `api_name`, and `skill_version: "1.0.4"`. The client checks `errcode` and stops the current operation if the response contains `upgrade_info`.

The API Key is stored only in Obsidian plugin data. The plugin makes no request when the key is empty.

Required endpoints:

- `/shelf/sync` obtains electronic books, audiobooks, and shelf timestamps.
- `/book/getprogress` obtains electronic-book progress and last-reading time.
- `/book/info` obtains an electronic book's introduction for shelf search.
- `/user/notebooks` finds books with personal notes, using `count` and `lastSort` until `hasMore` is false.
- `/book/bookmarklist` obtains a book's highlights and chapter metadata.
- `/review/list/mine` obtains personal thoughts and reviews, following `synckey` until `hasMore` is false.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `settings.ts` | Settings types, defaults, persistence, validation, and settings tab. |
| `types.ts` | Normalized shelf, note, association, cache, and view-model types. |
| `api/weread-client.ts` | Gateway requests, authorization, response validation, pagination primitives, and error mapping. |
| `services/shelf-sync-service.ts` | Remote shelf refresh, bounded-concurrency enrichment, progress/state mapping, cache updates, and audiobook-update detection. |
| `services/note-service.ts` | Remote note export, template rendering, local note creation/association, and managed-block replacement. |
| `services/note-index-service.ts` | Indexes only associated local notes for search and updates when those files change. |
| `views/shelf-view.ts` | `ItemView` state, top controls, grouping, cards, progress state, and card actions. |
| `ui/create-note-modal.ts` | Template selection, blank-note choice, collision handling, and existing-note association. |
| `commands/index.ts` | Stable command registration and dispatch. |
| `utils/` | Pure filtering, grouping, filename, template, and Markdown helpers. |

## Plugin lifecycle and synchronization

1. On plugin load, read persisted settings and the last successful shelf cache.
2. If an API Key exists, start a non-blocking automatic shelf refresh. Obsidian startup must not wait for it.
3. A shelf view opened before completion shows the cache plus a refresh state. When the refresh succeeds, the view, counts, groups, and local search index update.
4. Shelf synchronization fetches `/shelf/sync`, normalizes books and audiobooks, and uses a bounded worker pool to enrich electronic books with `/book/getprogress` and `/book/info`.
5. Book progress maps to `unread` for `0`, `inProgress` for `1..99`, and `completed` for `100`. Finished is never inferred from a value other than `100`.
6. Audiobooks map to `unheard` when `lectureReadUpdateTime` is absent or zero, and `listening` otherwise. They are never placed in the completed filter because the API does not expose listener completion.
7. For every audiobook, compare `albumInfo.updateTime` with the cached value. If it increased, persist `hasUnreadUpdate: true`; show an `Update` cover badge. Clear the flag only after the user opens that audiobook through its card action. `albumInfo.finish` is content-completion metadata and is not a listener-completion signal.
8. The automatic operation refreshes shelf metadata only. It never creates or modifies local notes.
9. `Sync shelf` performs the same metadata refresh on demand. `Sync all notes` and `Sync book notes` are explicit commands/actions and are the only paths that export note content.

Shelf and note requests use limited concurrency. A partial failure records successful results, retains the previous record for failed items, and reports failures without clearing the cache.

## Shelf view

The plugin exposes a dedicated `ItemView` opened by the `open-weread-shelf` command and usable as a normal workspace tab.

### Header

- Fixed search input with a clear icon.
- Stats show the count of electronic books and audiobooks separately.
- Sync action shows progress and the time of the last successful shelf sync.
- Content-type segmented filter: `All shelf`, `Books only`, `Audiobooks only`.
- Status segmented filter: `All`, `In progress`, `Unread`, `Completed`, and `In progress + unread`.
- For audiobooks, `In progress` includes `listening`; `Unread` includes `unheard`; `Completed` contains electronic books only; `In progress + unread` includes all non-completed electronic books and all audiobooks.

### Search, order, and groups

- Search is case-insensitive and matches normalized title, author, category, cached book introduction, and associated note filename, YAML properties, and Markdown body.
- Only files already associated with a WeRead book are indexed. Ordinary vault notes never enter the index.
- The default order is most recent activity. A setting can switch within-group order to title order.
- Apply search and both filters before grouping.
- Group matching cards by the year of `readUpdateTime` for electronic books or `lectureReadUpdateTime` for audiobooks, newest year first.
- Entries without an activity date appear in a final `Not started` group.

### Cards

Every card shows the cover, title, author or narrator, type, local-note state, normalized reading/listening state, and exact last-reading or last-listening date. Completed electronic books show a cover badge. Audiobooks with `hasUnreadUpdate` show the `Update` cover badge.

Icon buttons in the card header provide:

- Open in WeRead, using only the returned `deepLink`. The configured web mode opens an HTTP(S) deep link in the selected tab/window target; the app mode delegates the deep link to the OS. The plugin never fabricates a WeRead URL.
- Open associated local note, or create/associate one when absent.
- Synchronize that book's notes.

Opening an audiobook through the WeRead action clears its `Update` badge after the external-open request is dispatched.

## Settings and commands

Settings:

- WeRead API Key.
- Local reading-notes folder.
- Markdown template folder.
- WeRead web-open target: new tab or new window.
- Shelf entry mode: web or app deep link.
- Card ordering: recent activity or title.

Commands use stable IDs:

- `open-weread-shelf`
- `sync-weread-shelf`
- `sync-all-weread-notes`

## Local notes and templates

### Associations

`weread-book-id` in YAML frontmatter is the canonical association. A persisted association map caches the book ID to vault path. For compatibility, a first lookup may find a same-title Markdown file, but any newly associated file receives the canonical property.

The card action supports selecting an existing Markdown file to associate. New note filenames default to a sanitized title. If that path exists and is not associated with the same book, the modal offers to associate it or create `<title> - <bookId>.md`; it never overwrites the unrelated file.

### Creation

The note modal lists Markdown files from the configured template folder plus `Blank note`. It renders the chosen template with:

- `{{title}}`
- `{{author}}`
- `{{bookId}}`
- `{{category}}`
- `{{cover}}`
- `{{readDate}}`
- `{{wereadUrl}}`

The modal inserts or preserves `weread-book-id` frontmatter. A per-book note operation asks for a template whenever it must create a note. `Sync all notes` asks once for a template or blank-note choice and applies that choice to all newly created notes during that run.

### Export block

The plugin owns only the region delimited by:

```markdown
<!-- weread-notes:start -->
<!-- weread-notes:end -->
```

It rewrites this region idempotently and leaves all content outside untouched. The generated region contains book metadata, a WeRead deep link when supplied, highlights grouped by chapter, and personal thoughts/reviews. A thought linked to a highlight is rendered beneath it; chapter and whole-book thoughts are rendered in their own sections. Bookmarks are represented only as a count because the API does not return bookmark text.

## Error handling, privacy, and performance

- Show a clear notice for missing or rejected API Keys, gateway/network failures, upgrade instructions, unavailable deep links, invalid folders/templates, note conflicts, and partial sync failures.
- Keep the last successful cache available for offline browse, local-note opening, searching, filtering, and grouping. Remote actions surface a retryable failure state.
- Register workspace, vault, and DOM listeners with Obsidian registration helpers. Debounce associated-note reindexing and dispose all listeners on unload.
- Limit remote enrichment and export concurrency. Avoid vault-wide scans beyond resolving configured templates and updating known associations.
- Do not collect telemetry, transmit vault content except the explicitly requested WeRead API request parameters, execute remote code, or read/write outside the vault.

## Verification

Automated tests cover:

- Gateway request construction, non-zero `errcode`, `upgrade_info`, and both pagination schemes.
- Progress and audiobook-state mapping, including the rule that a serial audiobook is not listener-complete.
- Audiobook `Update` detection and clearing after the open action.
- Search across shelf metadata and associated-note filename/frontmatter/body only.
- Type/status filter combinations, activity-year grouping, not-started grouping, and both sort orders.
- Template interpolation, YAML association, filename collision resolution, and batch-template selection.
- Managed-block replacement that preserves all user text outside the markers.
- Cache-first load, automatic non-blocking shelf refresh, offline fallback, partial remote failure, and no automatic note export.

Manual Obsidian verification checks build output, plugin load/unload, settings persistence, card actions, view refresh, external links, template modal behavior, a full note export, and the desktop-only manifest.

## Acceptance criteria

1. Enabling the plugin with a valid API Key automatically refreshes the remote shelf without blocking Obsidian startup.
2. The independent shelf tab shows cache immediately, then cards with correct stats, search, filters, dates, and activity-year groups.
3. Search finds matching titles, introductions, and content in associated local notes only.
4. Electronic books have accurate unread/in-progress/completed filtering. Audiobooks are only unheard/listening and show an Update badge when their remote timestamp increased, cleared on open.
5. Templates create safely associated notes and sync updates only the marked export block.
6. Shelf refresh and note export are separately triggered after plugin load, with both batch and per-book note synchronization available.
