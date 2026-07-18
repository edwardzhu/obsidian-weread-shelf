# Note association, similar-note discovery, and template selection

## Goal

Improve the shelf card's “打开或创建笔记” action so an existing association opens immediately, an invalid or missing association leads to similar-note discovery, and new notes can be created with either no template or a template from the configured template directory.

## Confirmed behavior

The flow is:

```text
Open or create note
  ├─ valid associated note -> open it
  └─ no valid association
      ├─ search the configured notes folder for similar Markdown notes
      ├─ show candidates with “连接并打开” actions
      └─ offer new-note choices: no template or a configured template
```

Selecting a candidate associates it with the WeRead book, writes the `weread-book-id` frontmatter field, and opens it immediately. The existing note body is never overwritten.

## Scope and matching rules

- Similar-note discovery searches only the configured `notesFolder` and its subfolders.
- Only Markdown notes are candidates.
- Candidate matching compares normalized filename stems and book titles.
- A normalized exact match is preferred.
- Otherwise, a candidate matches when the normalized filename stem contains the normalized book title or the normalized book title contains the normalized filename stem.
- At most five candidates are shown.
- The existing default note path remains the creation path when no candidate is connected.
- Existing settings, association storage, and sync service behavior remain unchanged.

Normalization trims whitespace, collapses repeated whitespace, and compares case-insensitively. File extensions are excluded from filename matching.

## Architecture

### `main.ts`

`openOrCreateNote()` remains the workflow coordinator:

1. Read the stored association.
2. Open it if it still points to a Markdown file.
3. Otherwise list Markdown notes from the configured notes folder.
4. Filter and rank similar candidates.
5. Load templates from the configured template folder.
6. Open `CreateNoteModal` with candidates and templates.
7. On selection, call `NoteService.ensureNote()` with either the selected existing path or a template choice, refresh the note index, open the resulting note, and refresh shelf views.

Candidate filtering and ranking should live in a focused utility so it can be tested without Obsidian UI objects. The utility returns candidates in deterministic order, with exact normalized matches before partial matches and path order as the final tie-breaker.

### `CreateNoteModal`

The existing modal is extended for the single-note flow and keeps the batch flow working.

- Candidate rows show the note path and a **连接并打开** button.
- A **不使用模板** option creates a blank note.
- Each configured template is shown by path with a **选择** action.
- Closing the modal performs no operation.

The callback continues to receive `TemplateChoice` and an optional existing path. The modal does not mutate associations or files itself.

### `NoteService`

The existing `ensureNote()` path remains the single entry point for creation and association. When `existingPath` is supplied and the note exists, it associates and tags the existing note without changing its content. When no existing path is selected, it creates the default note using the chosen template or blank-note rendering and then associates it.

## Error handling

- A missing associated file is treated as an unresolved association and does not prevent discovery.
- A candidate is re-read when selected; if it disappeared, no invalid association is stored and a Notice reports the failure.
- Template loading and note creation failures surface through Notice messages.
- Closing the modal or selecting no option does not create files, update frontmatter, or alter associations.
- Existing note content is never replaced during association.

## Testing

Add tests for:

- normalized exact and contains-based candidate matching;
- notes-folder-only recursive discovery and the five-candidate limit;
- direct opening of a valid association;
- fallback when an association is missing;
- association of an existing candidate without content changes;
- blank-note creation;
- template-based creation;
- no-op modal closure and no-template availability.

Existing batch note synchronization, API behavior, and shelf rendering tests must remain passing.

## Non-goals

- No changes to WeRead synchronization or network requests.
- No global Vault-wide note search.
- No automatic association based only on a fuzzy match.
- No new settings for matching thresholds or candidate count.
