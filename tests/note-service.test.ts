import { describe, expect, it } from 'vitest';
import type {
	RawBookmarkListResponse,
	RawBookInfoResponse,
	RawBookProgressResponse,
	RawNotebookBook,
	RawReview,
	RawShelfResponse,
	WereadApi,
} from '../src/api/weread-client';
import { NoteService, type NoteAssociationStore } from '../src/services/note-service';
import type { NoteStore, StoredNote } from '../src/storage/obsidian-note-store';
import type { ShelfItem } from '../src/types';

const book: ShelfItem = {
	id: 'book-1',
	kind: 'book',
	title: 'The Book',
	author: 'Author',
	coverUrl: 'cover',
	category: 'History',
	progress: 45,
	readingState: 'inProgress',
	lastActivityAt: 1768003200,
	intro: 'Intro',
	deepLink: 'weread://book/book-1',
};

const secondBook: ShelfItem = {
	id: 'book-2',
	kind: 'book',
	title: 'Second Book',
	author: 'Second Author',
	coverUrl: 'second-cover',
	category: 'Fiction',
	progress: 0,
	readingState: 'unread',
	intro: '',
};

describe('NoteService', () => {
	it('creates a templated note, syncs managed WeRead content, and batches notebooks', async () => {
		const fakeStore = new FakeNoteStore();
		const associations = new MemoryAssociations();
		const service = new NoteService(
			new FakeWereadApi(),
			fakeStore,
			associations,
			() => 'Reading',
		);

		const created = await service.ensureNote(
			book,
			{
				kind: 'template',
				source: '{{title}}|{{author}}|{{bookId}}|{{category}}|{{cover}}|{{readDate}}|{{wereadUrl}}',
			},
		);

		expect(created.path).toBe('Reading/The Book.md');
		expect(created.content).toContain('weread-book-id: book-1');
		expect(created.content).toContain(
			'The Book|Author|book-1|History|cover|2026-01-10|weread://book/book-1',
		);

		await fakeStore.modify(created.path, `${created.content}\nKeep this handwritten paragraph\n`);
		await service.syncBookNotes(book, created.path);

		expect((await fakeStore.read(created.path))?.content).toContain('<!-- weread-notes:start -->');
		expect((await fakeStore.read(created.path))?.content).toContain('Keep this handwritten paragraph');
		expect((await fakeStore.read(created.path))?.content).toContain('Highlighted passage');
		expect((await fakeStore.read(created.path))?.content).toContain('My linked thought');

		const batch = await service.syncAllNotes(
			{ kind: 'blank' },
			new Map([
				[book.id, book],
				[secondBook.id, secondBook],
			]),
		);

		expect(batch.created).toContain('Reading/Second Book.md');
		expect(batch.updated).toContain('Reading/The Book.md');
	});

	it('keeps unrelated same-title notes untouched and reports partial batch failures', async () => {
		const fakeStore = new FakeNoteStore([
			{
				path: 'Reading/The Book.md',
				content: '# Unrelated\n',
				frontmatter: {},
			},
		]);
		const associations = new MemoryAssociations();
		const api = new FakeWereadApi({ reviewFailures: new Set(['book-2']) });
		const service = new NoteService(api, fakeStore, associations, () => 'Reading');

		const selected = await service.ensureNote(book, { kind: 'blank' }, 'Reading/The Book - book-1.md');

		expect(selected.path).toBe('Reading/The Book - book-1.md');
		expect((await fakeStore.read('Reading/The Book.md'))?.content).toBe('# Unrelated\n');

		const batch = await service.syncAllNotes(
			{ kind: 'blank' },
			new Map([
				[book.id, book],
				[secondBook.id, secondBook],
			]),
		);

		expect((await fakeStore.read('Reading/The Book - book-1.md'))?.content).toContain(
			'Highlighted passage',
		);
		expect(batch.failed).toEqual([
			{ bookId: 'book-2', path: 'Reading/Second Book.md', message: 'reviews failed' },
		]);
	});
});

class MemoryAssociations implements NoteAssociationStore {
	private readonly paths = new Map<string, string>();

	getPath(bookId: string): string | undefined {
		return this.paths.get(bookId);
	}

	async setPath(bookId: string, path: string): Promise<void> {
		this.paths.set(bookId, path);
	}
}

class FakeNoteStore implements NoteStore {
	private readonly notes = new Map<string, StoredNote>();

	constructor(notes: StoredNote[] = []) {
		for (const note of notes) {
			this.notes.set(note.path, structuredClone(note));
		}
	}

	async listMarkdown(folder: string): Promise<StoredNote[]> {
		const prefix = folder === '' ? '' : `${folder}/`;
		return [...this.notes.values()]
			.filter((note) => note.path.startsWith(prefix) && note.path.endsWith('.md'))
			.map((note) => structuredClone(note));
	}

	async read(path: string): Promise<StoredNote | null> {
		const note = this.notes.get(path);
		return note === undefined ? null : structuredClone(note);
	}

	async create(path: string, content: string): Promise<StoredNote> {
		if (this.notes.has(path)) {
			throw new Error(`Note already exists: ${path}`);
		}
		const note = { path, content, frontmatter: {} };
		this.notes.set(path, note);
		return structuredClone(note);
	}

	async modify(path: string, content: string): Promise<void> {
		const note = this.notes.get(path);
		if (note === undefined) {
			throw new Error(`Missing note: ${path}`);
		}
		this.notes.set(path, { ...note, content });
	}

	async setFrontmatter(path: string, values: Record<string, string>): Promise<void> {
		const note = this.notes.get(path);
		if (note === undefined) {
			throw new Error(`Missing note: ${path}`);
		}
		const frontmatter = { ...note.frontmatter, ...values };
		const body = stripFrontmatter(note.content);
		const yaml = Object.entries(frontmatter)
			.map(([key, value]) => `${key}: ${value}`)
			.join('\n');
		this.notes.set(path, {
			path,
			frontmatter,
			content: `---\n${yaml}\n---\n${body}`,
		});
	}
}

class FakeWereadApi implements WereadApi {
	constructor(private readonly options: { reviewFailures?: ReadonlySet<string> } = {}) {}

	async getShelf(): Promise<RawShelfResponse> {
		return { books: [], albums: [] };
	}

	async getBookProgress(): Promise<RawBookProgressResponse> {
		return { book: { progress: 0 } };
	}

	async getBookInfo(): Promise<RawBookInfoResponse> {
		return { bookId: '', title: '', author: '', cover: '' };
	}

	async listNotebookBooks(): Promise<RawNotebookBook[]> {
		return [
			notebookBook('book-1', 'The Book', 'Author'),
			notebookBook('book-2', 'Second Book', 'Second Author'),
		];
	}

	async getBookmarks(bookId: string): Promise<RawBookmarkListResponse> {
		return {
			updated: [
				{
					bookmarkId: `${bookId}-bookmark`,
					bookId,
					chapterUid: 1,
					markText: 'Highlighted passage',
					createTime: 1768003200,
					range: '1-2',
				},
			],
			chapters: [{ chapterUid: 1, chapterIdx: 1, title: 'Chapter 1' }],
		};
	}

	async listMyReviews(bookId: string): Promise<RawReview[]> {
		if (this.options.reviewFailures?.has(bookId)) {
			throw new Error('reviews failed');
		}
		return [
			{
				review: {
					reviewId: `${bookId}-review`,
					content: 'My linked thought',
					abstract: 'Highlighted passage',
					chapterUid: 1,
					chapterName: 'Chapter 1',
					createTime: 1768003200,
				},
			},
		];
	}
}

function notebookBook(bookId: string, title: string, author: string): RawNotebookBook {
	return {
		bookId,
		book: { title, author, cover: `${bookId}-cover` },
		bookmarkCount: 1,
		noteCount: 1,
		reviewCount: 1,
		sort: bookId === 'book-1' ? 2 : 1,
	};
}

function stripFrontmatter(content: string): string {
	if (!content.startsWith('---\n')) {
		return content;
	}
	const end = content.indexOf('\n---\n', 4);
	return end === -1 ? content : content.slice(end + '\n---\n'.length);
}
