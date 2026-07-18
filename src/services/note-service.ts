import type {
	RawBookmarkListResponse,
	RawNotebookBook,
	RawReview,
	WereadApi,
} from '../api/weread-client';
import type { NoteStore, StoredNote } from '../storage/obsidian-note-store';
import type { ElectronicBook, ShelfItem } from '../types';
import {
	renderBookTemplate,
	renderWereadExport,
	replaceWereadBlock,
	type RenderWereadExportInput,
} from '../utils/note-content';
import { makeDefaultNotePath } from '../utils/note-path';

export type TemplateChoice = { kind: 'blank' } | { kind: 'template'; source: string };

export interface NoteAssociationStore {
	getPath(bookId: string): string | undefined;
	setPath(bookId: string, path: string): Promise<void>;
}

export interface BatchNoteSyncResult {
	created: string[];
	updated: string[];
	skipped: string[];
	failed: Array<{ bookId: string; path?: string; message: string }>;
}

interface EnsuredNote {
	note: StoredNote;
	created: boolean;
}

export class NoteService {
	constructor(
		private readonly api: WereadApi,
		private readonly noteStore: NoteStore,
		private readonly associations: NoteAssociationStore,
		private readonly notesFolder: () => string,
	) {}

	async ensureNote(
		book: ShelfItem,
		choice: TemplateChoice,
		existingPath?: string,
	): Promise<StoredNote> {
		return (await this.ensureNoteInternal(book, choice, existingPath)).note;
	}

	async associateExistingNote(bookId: string, path: string): Promise<void> {
		if (await this.noteStore.read(path) === null) {
			throw new Error(`Missing note: ${path}`);
		}
		await this.associations.setPath(bookId, path);
		await this.noteStore.setFrontmatter(path, { 'weread-book-id': bookId });
	}

	async syncBookNotes(book: ShelfItem, path: string): Promise<void> {
		const note = await this.noteStore.read(path);
		if (note === null) {
			throw new Error(`Missing note: ${path}`);
		}

		const [bookmarks, reviews] = await Promise.all([
			this.api.getBookmarks(book.id),
			this.api.listMyReviews(book.id),
		]);
		const generated = renderWereadExport({
			book: {
				title: book.title,
				author: book.author,
				...optionalDeepLink(book.deepLink),
			},
			bookmarkCount: bookmarks.updated.length,
			highlights: mapHighlights(bookmarks),
			reviews: mapReviews(reviews, bookmarks),
		});

		await this.noteStore.modify(path, replaceWereadBlock(note.content, generated));
	}

	async syncAllNotes(
		choice: TemplateChoice,
		booksById: ReadonlyMap<string, ShelfItem>,
	): Promise<BatchNoteSyncResult> {
		const result: BatchNoteSyncResult = { created: [], updated: [], skipped: [], failed: [] };
		const notebooks = await this.api.listNotebookBooks();

		for (const notebook of notebooks) {
			const book = booksById.get(notebook.bookId) ?? makeMinimalBook(notebook);
			let path: string | undefined;
			try {
				const ensured = await this.ensureNoteInternal(book, choice);
				path = ensured.note.path;

				if (notebook.bookmarkCount + notebook.noteCount + notebook.reviewCount === 0) {
					result.skipped.push(path);
					continue;
				}

				await this.syncBookNotes(book, path);
				if (ensured.created) {
					result.created.push(path);
				} else {
					result.updated.push(path);
				}
			} catch (error) {
				result.failed.push({ bookId: notebook.bookId, ...optionalPath(path), message: getErrorMessage(error) });
			}
		}

		return result;
	}

	private async ensureNoteInternal(
		book: ShelfItem,
		choice: TemplateChoice,
		selectedPath?: string,
	): Promise<EnsuredNote> {
		const associatedPath = this.associations.getPath(book.id);
		if (associatedPath !== undefined) {
			const associatedNote = await this.noteStore.read(associatedPath);
			if (associatedNote !== null) {
				return { note: await this.tagAndRead(book.id, associatedPath), created: false };
			}
		}

		if (selectedPath !== undefined) {
			const selectedNote = await this.noteStore.read(selectedPath);
			if (selectedNote !== null) {
				return { note: await this.associateAndRead(book.id, selectedPath), created: false };
			}
			return { note: await this.createAndAssociate(book, choice, selectedPath), created: true };
		}

		const defaultPath = makeDefaultNotePath(this.notesFolder(), book.title, book.id);
		const sameTitleNote = await this.noteStore.read(defaultPath);
		if (sameTitleNote !== null) {
			return { note: await this.associateAndRead(book.id, defaultPath), created: false };
		}

		return { note: await this.createAndAssociate(book, choice, defaultPath), created: true };
	}

	private async createAndAssociate(
		book: ShelfItem,
		choice: TemplateChoice,
		path: string,
	): Promise<StoredNote> {
		const targetPath = (await this.noteStore.read(path)) === null
			? path
			: makeDefaultNotePath(this.notesFolder(), book.title, book.id, true);
		await this.noteStore.create(targetPath, renderInitialContent(book, choice));
		return this.associateAndRead(book.id, targetPath);
	}

	private async associateAndRead(bookId: string, path: string): Promise<StoredNote> {
		await this.associations.setPath(bookId, path);
		return this.tagAndRead(bookId, path);
	}

	private async tagAndRead(bookId: string, path: string): Promise<StoredNote> {
		await this.noteStore.setFrontmatter(path, { 'weread-book-id': bookId });
		const note = await this.noteStore.read(path);
		if (note === null) {
			throw new Error(`Missing note after association: ${path}`);
		}
		return note;
	}
}

function renderInitialContent(book: ShelfItem, choice: TemplateChoice): string {
	if (choice.kind === 'blank') {
		return `# ${book.title}\n`;
	}
	return renderBookTemplate(choice.source, {
		title: book.title,
		author: book.author,
		bookId: book.id,
		category: book.category,
		cover: book.coverUrl,
		readDate: formatDate(book.lastActivityAt),
		wereadUrl: book.deepLink ?? '',
	});
}

function mapHighlights(bookmarks: RawBookmarkListResponse): RenderWereadExportInput['highlights'] {
	const chapters = new Map(bookmarks.chapters.map((chapter) => [chapter.chapterUid, chapter]));
	return bookmarks.updated.map((bookmark) => ({
		chapterTitle: chapters.get(bookmark.chapterUid)?.title ?? 'Untitled chapter',
		bookmarkId: bookmark.bookmarkId,
		text: bookmark.markText,
	}));
}

function mapReviews(
	reviews: RawReview[],
	bookmarks: RawBookmarkListResponse,
): RenderWereadExportInput['reviews'] {
	const chapters = new Map(bookmarks.chapters.map((chapter) => [chapter.chapterUid, chapter]));
	return reviews.map(({ review }) => ({
		content: review.content,
		...optionalString('abstract', review.abstract),
		...optionalString(
			'chapterTitle',
			review.chapterName ?? (review.chapterUid === undefined ? undefined : chapters.get(review.chapterUid)?.title),
		),
		...optionalString('bookmarkRange', review.range),
	}));
}

function makeMinimalBook(notebook: RawNotebookBook): ElectronicBook {
	return {
		id: notebook.bookId,
		kind: 'book',
		title: notebook.book.title,
		author: notebook.book.author,
		coverUrl: notebook.book.cover,
		category: '',
		progress: 0,
		readingState: 'unread',
		intro: '',
	};
}

function formatDate(timestamp: number | undefined): string {
	return timestamp === undefined ? '' : new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function optionalDeepLink(deepLink: string | undefined): Pick<RenderWereadExportInput['book'], 'deepLink'> | object {
	return deepLink === undefined || deepLink === '' ? {} : { deepLink };
}

function optionalString<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
	return value === undefined || value === '' ? {} : { [key]: value } as Partial<Record<K, string>>;
}

function optionalPath(path: string | undefined): { path?: string } {
	return path === undefined ? {} : { path };
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
