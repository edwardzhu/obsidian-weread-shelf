import type { NoteStore, StoredNote } from '../storage/obsidian-note-store';

export class AssociatedNoteIndex {
	private readonly textByBookId = new Map<string, string>();

	constructor(private readonly noteStore: NoteStore) {}

	async rebuild(associations: ReadonlyMap<string, string>): Promise<void> {
		this.textByBookId.clear();
		for (const [bookId, path] of associations) {
			await this.refreshBook(bookId, path);
		}
	}

	async refreshBook(bookId: string, path: string | undefined): Promise<void> {
		if (path === undefined) {
			this.textByBookId.delete(bookId);
			return;
		}

		try {
			const note = await this.noteStore.read(path);
			this.textByBookId.set(bookId, note === null ? '' : serializeNote(note));
		} catch {
			this.textByBookId.set(bookId, '');
		}
	}

	getText(bookId: string): string {
		return this.textByBookId.get(bookId) ?? '';
	}

	toMap(): ReadonlyMap<string, string> {
		return new Map(
			[...this.textByBookId.entries()].filter(([, text]) => text !== ''),
		);
	}
}

function serializeNote(note: StoredNote): string {
	return [
		note.path,
		...Object.values(note.frontmatter).map((value) => String(value)),
		note.content,
	].join('\n');
}
