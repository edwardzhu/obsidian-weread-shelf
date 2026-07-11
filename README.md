# WeRead Shelf

WeRead Shelf is a desktop-only Obsidian plugin for browsing a cached WeRead shelf and exporting your personal WeRead highlights and thoughts into local Markdown notes.

## Features

- Sync your WeRead shelf through the official gateway.
- Browse books and audiobooks in a native Obsidian shelf view.
- Search by shelf metadata and by text from associated local notes only.
- Filter by item type and status, then group by reading or listening year.
- Create local reading notes from a blank note or a template.
- Sync WeRead highlights and thoughts into a managed Markdown block while preserving handwritten note content outside that block.

## Commands

- **Open WeRead shelf** opens the shelf workspace tab.
- **Sync WeRead shelf** refreshes only the cached shelf.
- **Sync all WeRead notes** exports notes for notebook books after one template choice is selected.

## Settings

- **API Key**: paste your WeRead API Key.
- **Notes folder**: vault-relative folder for created reading notes.
- **Template folder**: vault-relative folder containing Markdown templates.
- **Web open target**: open supplied WeRead links in a tab or window.
- **Entry mode**: choose web or app behavior for supplied links.
- **Sort mode**: sort cards by activity or title.

Get an API Key from [WeRead Skills](https://weread.qq.com/r/weread-skills), then paste it into the plugin settings.

## Network and privacy

The plugin only calls:

```text
POST https://i.weread.qq.com/api/agent/gateway
```

Requests use your Bearer API Key and include `skill_version: "1.0.4"`. The plugin does not collect telemetry and does not transmit vault content to WeRead. Local note text is indexed only for notes associated with a WeRead book ID.

On startup, the plugin performs a non-blocking shelf-only refresh when an API Key is configured. It does not automatically export notes. Note export runs only from **Sync all WeRead notes** or a card action.

## Notes

Created and associated notes receive `weread-book-id` frontmatter. WeRead exports are written between these markers:

```markdown
<!-- weread-notes:start -->
<!-- weread-notes:end -->
```

Only the marker block is replaced during sync. Text outside the markers is preserved.

Templates support these variables:

```text
{{title}} {{author}} {{bookId}} {{category}} {{cover}} {{readDate}} {{wereadUrl}}
```

## Shelf behavior

Books are marked unread, in progress, or completed from their reading progress. Audiobooks are marked unheard or listening from listener activity only. The plugin does not infer audiobook completion from serial completion metadata.

Audiobook **Update** badges appear when the source update time increases compared with the cached shelf. Opening an audiobook clears its update badge in the cache.

The shelf has two filter dimensions:

- Type: all, books, audiobooks.
- Status: active, all, in progress, unread, completed.

Associated-note search is intentionally limited to notes mapped in plugin data. The plugin never scans unrelated vault files for shelf search.

## Verification

1. Configure an API Key, notes folder, and template folder.
2. Reload the plugin and confirm the shelf refresh starts without blocking Obsidian.
3. Verify search, type/status filters, yearly groups, local-note matching, and audiobook Update badges.
4. Create a note with a template, edit text outside the WeRead block, then sync the same book and confirm the edit remains.
5. Run Sync all WeRead notes and confirm one template choice applies to each newly created note.
6. Disable network access and confirm cached shelf browsing continues while remote actions show a retryable error.
