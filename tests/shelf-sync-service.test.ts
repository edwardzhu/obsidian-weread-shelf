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
import type { ShelfCache } from '../src/types';
import type { ShelfCacheRepository } from '../src/services/shelf-cache-repository';
import {
	ShelfSyncService,
	type ShelfSyncProgress,
} from '../src/services/shelf-sync-service';

describe('ShelfSyncService', () => {
	it('normalizes and caches books and audiobooks', async () => {
		const repository = new MemoryShelfCacheRepository({
			version: 1,
			lastSuccessfulSyncAt: 1,
			items: [
				{
					id: 'album-1',
					kind: 'audiobook',
					title: 'Old audio',
					author: 'Narrator',
					coverUrl: '',
					category: '',
					listeningState: 'unheard',
					sourceUpdateTime: 10,
					hasUnreadUpdate: false,
				},
			],
		});
		const service = new ShelfSyncService(new FakeWereadApi(), repository, () => 1234567890);

		const result = await service.sync();

		expect(result.cache.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'book-1',
					kind: 'book',
					readingState: 'inProgress',
					progress: 45,
					intro: 'Searchable intro',
				}),
				expect.objectContaining({
					id: 'album-1',
					kind: 'audiobook',
					listeningState: 'listening',
					sourceUpdateTime: 20,
					hasUnreadUpdate: true,
				}),
			]),
		);
		expect(result.cache.archives).toEqual([
			{ name: '正在阅读', bookIds: ['book-1'] },
			{ name: '收藏', bookIds: ['book-1'] },
		]);
		expect(await repository.load()).toEqual(result.cache);

		await service.markAudiobookOpened('album-1');

		expect((await repository.load())?.items.find((item) => item.id === 'album-1')).toMatchObject({
			hasUnreadUpdate: false,
		});
	});

	it('uses the shelf completion flag for books below 100 percent', async () => {
		const repository = new MemoryShelfCacheRepository(null);
		const service = new ShelfSyncService(
			new FakeWereadApi({
				shelf: {
					books: [{ ...rawBook('book-1', 'Book One'), finishReading: 1 }],
					albums: [],
				},
			}),
			repository,
		);

		const result = await service.sync();

		expect(result.cache.items.find((item) => item.id === 'book-1')).toMatchObject({
			progress: 45,
			readingState: 'completed',
		});
	});

	it('reports progress for fetching, enriching, saving, and completing a sync', async () => {
		const progress: ShelfSyncProgress[] = [];
		const service = new ShelfSyncService(
			new FakeWereadApi(),
			new MemoryShelfCacheRepository(null),
			() => 10,
		);

		await service.sync((update) => progress.push(update));

		expect(progress).toEqual([
			{ phase: 'fetching', completed: 0, total: 0 },
			{ phase: 'enriching', completed: 0, total: 1 },
			{ phase: 'enriching', completed: 1, total: 1 },
			{ phase: 'saving', completed: 1, total: 1 },
			{ phase: 'complete', completed: 1, total: 1 },
		]);
	});

	it('enriches book progress and info concurrently', async () => {
		let infoStarted = false;
		const api = new FakeWereadApi({
			async getBookProgressOverride() {
				await Promise.resolve();
				if (!infoStarted) {
					throw new Error('info request did not start concurrently');
				}
				return { book: { progress: 45, updateTime: 50 } };
			},
			async getBookInfoOverride(bookId) {
				infoStarted = true;
				return {
					bookId,
					title: 'Book One',
					author: 'Author',
					cover: 'cover',
					intro: 'Searchable intro',
					deepLink: `weread://book/${bookId}`,
				};
			},
		});
		const service = new ShelfSyncService(api, new MemoryShelfCacheRepository(null), () => 10);

		const result = await service.sync();

		expect(result.failures).toEqual([]);
	});

	it('continues after enrichment failures and preserves previous values', async () => {
		const api = new FakeWereadApi({
			progressFailures: new Set(['book-1']),
			infoFailures: new Set(['book-2']),
			shelf: {
				books: [
					rawBook('book-1', 'Book One'),
					rawBook('book-2', 'Book Two'),
				],
				albums: [],
			},
		});
		const repository = new MemoryShelfCacheRepository({
			version: 1,
			lastSuccessfulSyncAt: 1,
			items: [
				{
					id: 'book-1',
					kind: 'book',
					title: 'Book One',
					author: 'Author',
					coverUrl: 'old-cover',
					category: 'Old',
					progress: 80,
					readingState: 'inProgress',
					lastActivityAt: 100,
					intro: 'Old intro 1',
				},
				{
					id: 'book-2',
					kind: 'book',
					title: 'Book Two',
					author: 'Author',
					coverUrl: 'old-cover',
					category: 'Old',
					progress: 5,
					readingState: 'inProgress',
					lastActivityAt: 200,
					intro: 'Old intro 2',
				},
			],
		});
		const service = new ShelfSyncService(api, repository, () => 10);

		const result = await service.sync();

		expect(result.failures).toEqual([
			{ itemId: 'book-1', operation: 'progress', message: 'progress failed' },
			{ itemId: 'book-2', operation: 'info', message: 'info failed' },
		]);
		expect(result.cache.items.find((item) => item.id === 'book-1')).toMatchObject({
			progress: 80,
			readingState: 'inProgress',
			intro: 'Searchable intro',
		});
		expect(result.cache.items.find((item) => item.id === 'book-2')).toMatchObject({
			progress: 45,
			readingState: 'inProgress',
			intro: 'Old intro 2',
		});
	});

	it('limits concurrent book enrichment', async () => {
		let activeProgressRequests = 0;
		let maxActiveProgressRequests = 0;
		const api = new FakeWereadApi({
			shelf: {
				books: Array.from({ length: 5 }, (_, index) =>
					rawBook(`book-${index + 1}`, `Book ${index + 1}`),
				),
				albums: [],
			},
			async getBookProgressOverride(bookId) {
				activeProgressRequests += 1;
				maxActiveProgressRequests = Math.max(maxActiveProgressRequests, activeProgressRequests);
				await new Promise((resolve) => setTimeout(resolve, 5));
				activeProgressRequests -= 1;
				return { book: { progress: bookId === 'book-5' ? 100 : 20, updateTime: 10 } };
			},
		});
		const service = new ShelfSyncService(api, new MemoryShelfCacheRepository(null), () => 10, 4);

		await service.sync();

		expect(maxActiveProgressRequests).toBeLessThanOrEqual(4);
	});
});

class MemoryShelfCacheRepository implements ShelfCacheRepository {
	constructor(private cache: ShelfCache | null) {}

	async load(): Promise<ShelfCache | null> {
		return this.cache;
	}

	async save(cache: ShelfCache): Promise<void> {
		this.cache = cache;
	}
}

class FakeWereadApi implements WereadApi {
	private readonly shelf: RawShelfResponse;
	private readonly progressFailures: ReadonlySet<string>;
	private readonly infoFailures: ReadonlySet<string>;
	private readonly getBookProgressOverride?: (bookId: string) => Promise<RawBookProgressResponse>;
	private readonly getBookInfoOverride?: (bookId: string) => Promise<RawBookInfoResponse>;

	constructor(options: {
		shelf?: RawShelfResponse;
		progressFailures?: ReadonlySet<string>;
		infoFailures?: ReadonlySet<string>;
		getBookProgressOverride?: (bookId: string) => Promise<RawBookProgressResponse>;
		getBookInfoOverride?: (bookId: string) => Promise<RawBookInfoResponse>;
	} = {}) {
		this.shelf = options.shelf ?? {
			books: [rawBook('book-1', 'Book One')],
			albums: [
				{
					albumInfo: {
						albumId: 'album-1',
						name: 'Audio One',
						authorName: 'Narrator',
						cover: 'audio-cover',
						updateTime: 20,
					},
					albumInfoExtra: { lectureReadUpdateTime: 15 },
				},
			],
			archive: [
				{ name: '正在阅读', bookIds: ['book-1'] },
				{ name: '收藏', bookIds: ['book-1'] },
			],
		};
		this.progressFailures = options.progressFailures ?? new Set();
		this.infoFailures = options.infoFailures ?? new Set();
		this.getBookProgressOverride = options.getBookProgressOverride;
		this.getBookInfoOverride = options.getBookInfoOverride;
	}

	async getShelf(): Promise<RawShelfResponse> {
		return this.shelf;
	}

	async getBookProgress(bookId: string): Promise<RawBookProgressResponse> {
		if (this.getBookProgressOverride !== undefined) {
			return this.getBookProgressOverride(bookId);
		}
		if (this.progressFailures.has(bookId)) {
			throw new Error('progress failed');
		}
		return { book: { progress: 45, updateTime: 50 } };
	}

	async getBookInfo(bookId: string): Promise<RawBookInfoResponse> {
		if (this.getBookInfoOverride !== undefined) {
			return this.getBookInfoOverride(bookId);
		}
		if (this.infoFailures.has(bookId)) {
			throw new Error('info failed');
		}
		return {
			bookId,
			title: 'Book One',
			author: 'Author',
			cover: 'cover',
			intro: 'Searchable intro',
			deepLink: `weread://book/${bookId}`,
		};
	}

	async listNotebookBooks(): Promise<RawNotebookBook[]> {
		return [];
	}

	async getBookmarks(): Promise<RawBookmarkListResponse> {
		return { updated: [], chapters: [] };
	}

	async listMyReviews(): Promise<RawReview[]> {
		return [];
	}
}

function rawBook(bookId: string, title: string) {
	return {
		bookId,
		title,
		author: 'Author',
		cover: 'cover',
		category: 'Category',
		readUpdateTime: 25,
		deepLink: `weread://book/${bookId}`,
	};
}
