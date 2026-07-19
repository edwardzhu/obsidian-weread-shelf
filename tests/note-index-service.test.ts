import { describe, expect, it } from 'vitest';
import { AssociatedNoteIndex } from '../src/services/note-index-service';
import type { NoteStore, StoredNote } from '../src/storage/obsidian-note-store';

describe('AssociatedNoteIndex', () => {
	it('indexes only paths in the association map', async () => {
		const fakeNoteStore = new FakeNoteStore([
			{
				path: 'Reading/book.md',
				content: 'private note content',
				frontmatter: { tag: 'history' },
			},
			{
				path: 'Reading/unrelated.md',
				content: 'unrelated private content',
				frontmatter: {},
			},
		]);
		const index = new AssociatedNoteIndex(fakeNoteStore);

		await index.rebuild(new Map([['book-1', 'Reading/book.md']]));

		expect(index.getText('book-1')).toContain('private note content');
		expect(index.getText('book-1')).toContain('history');
		expect(index.getText('book-2')).toBe('');
		expect(fakeNoteStore.readCalls).toEqual(['Reading/book.md']);
	});

	it('refreshes changed notes and removes stale associations', async () => {
		const fakeNoteStore = new FakeNoteStore([
			{ path: 'Reading/book.md', content: 'old text', frontmatter: {} },
		]);
		const index = new AssociatedNoteIndex(fakeNoteStore);

		await index.rebuild(new Map([['book-1', 'Reading/book.md']]));
		fakeNoteStore.set('Reading/book.md', {
			path: 'Reading/book.md',
			content: 'changed text',
			frontmatter: { status: 'updated' },
		});
		await index.refreshBook('book-1', 'Reading/book.md');

		expect(index.getText('book-1')).toContain('changed text');
		expect(index.getText('book-1')).toContain('updated');

		await index.refreshBook('book-1', undefined);

		expect(index.getText('book-1')).toBe('');
		expect([...index.toMap().entries()]).toEqual([]);
	});

	it('restores valid associated book ids when rebuilding the index', async () => {
		const fakeNoteStore = new FakeNoteStore([
			{ path: 'Reading/book.md', content: '', frontmatter: {} },
		]);
		const index = new AssociatedNoteIndex(fakeNoteStore);

		await index.rebuild(new Map([['book-1', 'Reading/book.md']]));

		expect([...index.toAssociatedBookIds()]).toEqual(['book-1']);

		await index.refreshBook('book-1', undefined);

		expect([...index.toAssociatedBookIds()]).toEqual([]);
	});

	it('normalizes numeric book ids used during the current session', async () => {
		const fakeNoteStore = new FakeNoteStore([
			{ path: 'Reading/book.md', content: 'note', frontmatter: {} },
		]);
		const index = new AssociatedNoteIndex(fakeNoteStore);

		await index.refreshBook(123 as unknown as string, 'Reading/book.md');

		expect([...index.toAssociatedBookIds()]).toEqual(['123']);
		expect(index.getText(123 as unknown as string)).toContain('note');
	});

	it('restores missing associations from note frontmatter', async () => {
		const note = {
			path: 'Reading/book.md',
			content: 'note',
			frontmatter: { 'weread-book-id': 'book-1' },
		};
		const fakeNoteStore = new FakeNoteStore([note]);
		const index = new AssociatedNoteIndex(fakeNoteStore);

		const resolvedAssociations = await index.rebuild(new Map(), [note]);

		expect([...index.toAssociatedBookIds()]).toEqual(['book-1']);
		expect(resolvedAssociations.get('book-1')).toBe('Reading/book.md');
	});

	it('repairs a stale persisted path from note frontmatter', async () => {
		const note = {
			path: 'Reading/renamed-book.md',
			content: 'note',
			frontmatter: { 'weread-book-id': 'book-1' },
		};
		const fakeNoteStore = new FakeNoteStore([note]);
		const index = new AssociatedNoteIndex(fakeNoteStore);

		const resolvedAssociations = await index.rebuild(
			new Map([['book-1', 'Reading/old-book.md']]),
			[note],
		);

		expect(resolvedAssociations.get('book-1')).toBe('Reading/renamed-book.md');
		expect([...index.toAssociatedBookIds()]).toEqual(['book-1']);
	});

	it('restores an association from raw frontmatter when metadata is not ready', async () => {
		const note = {
			path: 'Reading/book.md',
			content: '---\nweread-book-id: book-1\n---\n# Book\n',
			frontmatter: {},
		};
		const index = new AssociatedNoteIndex(new FakeNoteStore([note]));

		await index.rebuild(new Map(), [note]);

		expect([...index.toAssociatedBookIds()]).toEqual(['book-1']);
	});
});

class FakeNoteStore implements NoteStore {
	readonly readCalls: string[] = [];
	private readonly notes = new Map<string, StoredNote>();

	constructor(notes: StoredNote[]) {
		for (const note of notes) {
			this.set(note.path, note);
		}
	}

	set(path: string, note: StoredNote): void {
		this.notes.set(path, structuredClone(note));
	}

	async listMarkdown(): Promise<StoredNote[]> {
		throw new Error('AssociatedNoteIndex must not enumerate notes');
	}

	async read(path: string): Promise<StoredNote | null> {
		this.readCalls.push(path);
		const note = this.notes.get(path);
		return note === undefined ? null : structuredClone(note);
	}

	async create(): Promise<StoredNote> {
		throw new Error('Not implemented');
	}

	async modify(): Promise<void> {
		throw new Error('Not implemented');
	}

	async setFrontmatter(): Promise<void> {
		throw new Error('Not implemented');
	}
}
