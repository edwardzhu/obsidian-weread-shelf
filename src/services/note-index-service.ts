import type { NoteStore, StoredNote } from '../storage/obsidian-note-store';

export class AssociatedNoteIndex {
	private readonly textByBookId = new Map<string, string>();
	private readonly associatedBookIds = new Set<string>();

	constructor(private readonly noteStore: NoteStore) {}

	async rebuild(
		associations: ReadonlyMap<string, string>,
		notes: readonly StoredNote[] = [],
	): Promise<ReadonlyMap<string, string>> {
		const resolvedAssociations = new Map<string, string>();
		const notePaths = new Set(notes.map((note) => note.path));
		for (const [bookId, path] of associations) {
			resolvedAssociations.set(String(bookId), path);
		}

		for (const note of notes) {
			const bookId = getFrontmatterBookId(note);
			const persistedPath = bookId === undefined ? undefined : resolvedAssociations.get(bookId);
			if (
				bookId !== undefined &&
				(persistedPath === undefined || !notePaths.has(persistedPath))
			) {
				resolvedAssociations.set(bookId, note.path);
			}
		}

		this.textByBookId.clear();
		this.associatedBookIds.clear();
		for (const [bookId, path] of resolvedAssociations) {
			await this.refreshBook(bookId, path);
		}
		return new Map(resolvedAssociations);
	}

	async refreshBook(bookId: string, path: string | undefined): Promise<void> {
		const normalizedBookId = String(bookId);
		if (path === undefined) {
			this.textByBookId.delete(normalizedBookId);
			this.associatedBookIds.delete(normalizedBookId);
			return;
		}

		try {
			const note = await this.noteStore.read(path);
			if (note === null) {
				this.textByBookId.set(normalizedBookId, '');
				this.associatedBookIds.delete(normalizedBookId);
				return;
			}
			this.textByBookId.set(normalizedBookId, serializeNote(note));
			this.associatedBookIds.add(normalizedBookId);
		} catch {
			this.textByBookId.set(normalizedBookId, '');
			this.associatedBookIds.delete(normalizedBookId);
		}
	}

	getText(bookId: string): string {
		return this.textByBookId.get(String(bookId)) ?? '';
	}

	toMap(): ReadonlyMap<string, string> {
		return new Map(
			[...this.textByBookId.entries()].filter(([, text]) => text !== ''),
		);
	}

	toAssociatedBookIds(): ReadonlySet<string> {
		return new Set(this.associatedBookIds);
	}
}

function serializeNote(note: StoredNote): string {
	return [
		note.path,
		...Object.values(note.frontmatter).map((value) => String(value)),
		note.content,
	].join('\n');
}

function getFrontmatterBookId(note: StoredNote): string | undefined {
	const value = note.frontmatter?.['weread-book-id'];
	const normalizedValue = normalizeBookId(value);
	if (normalizedValue !== undefined) {
		return normalizedValue;
	}

	const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(note.content)?.[1];
	if (frontmatter === undefined) {
		return undefined;
	}
	const rawValue = frontmatter
		.split(/\r?\n/)
		.find((line) => /^\s*weread-book-id\s*:/.test(line))
		?.replace(/^\s*weread-book-id\s*:\s*/, '');
	return normalizeBookId(rawValue);
}

function normalizeBookId(value: unknown): string | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		const trimmed = value.trim();
		return trimmed.length >= 2 &&
			((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
				(trimmed.startsWith("'") && trimmed.endsWith("'")))
			? trimmed.slice(1, -1).trim()
			: trimmed;
	}
	return undefined;
}
