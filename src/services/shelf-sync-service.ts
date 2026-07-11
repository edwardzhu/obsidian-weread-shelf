import type {
	RawShelfAlbum,
	RawShelfBook,
	WereadApi,
} from '../api/weread-client';
import type { Audiobook, ElectronicBook, ShelfCache, ShelfItem } from '../types';
import { mapWithConcurrency } from '../utils/async';
import { toAudiobookListeningState, toBookReadingState } from '../utils/shelf-state';
import type { ShelfCacheRepository } from './shelf-cache-repository';

export interface ShelfSyncResult {
	cache: ShelfCache;
	failures: Array<{ itemId: string; operation: 'progress' | 'info'; message: string }>;
}

interface BookEnrichmentResult {
	item: ElectronicBook;
	failures: ShelfSyncResult['failures'];
}

export class ShelfSyncService {
	constructor(
		private readonly api: WereadApi,
		private readonly cacheRepository: ShelfCacheRepository,
		private readonly now: () => number = () => Date.now(),
		private readonly concurrency = 4,
	) {}

	async sync(): Promise<ShelfSyncResult> {
		const [previousCache, shelf] = await Promise.all([
			this.cacheRepository.load(),
			this.api.getShelf(),
		]);
		const previousItems = new Map(previousCache?.items.map((item) => [item.id, item]));

		const bookResults = await mapWithConcurrency(shelf.books, this.concurrency, (book) =>
			this.enrichBook(book, previousItems.get(book.bookId)),
		);
		const audiobooks = shelf.albums.map((album) =>
			this.normalizeAudiobook(album, previousItems.get(album.albumInfo.albumId)),
		);
		const failures = bookResults.flatMap((result) => result.failures);
		const cache: ShelfCache = {
			version: 1,
			items: [...bookResults.map((result) => result.item), ...audiobooks],
			lastSuccessfulSyncAt: this.now(),
		};

		await this.cacheRepository.save(cache);
		return { cache, failures };
	}

	async markAudiobookOpened(itemId: string): Promise<void> {
		const cache = await this.cacheRepository.load();
		if (cache === null) {
			return;
		}

		await this.cacheRepository.save({
			...cache,
			items: cache.items.map((item) =>
				item.id === itemId && item.kind === 'audiobook'
					? { ...item, hasUnreadUpdate: false }
					: item,
			),
		});
	}

	private async enrichBook(
		rawBook: RawShelfBook,
		previousItem: ShelfItem | undefined,
	): Promise<BookEnrichmentResult> {
		const previousBook = previousItem?.kind === 'book' ? previousItem : undefined;
		const failures: ShelfSyncResult['failures'] = [];

		let progress = previousBook?.progress ?? 0;
		let lastActivityAt = previousBook?.lastActivityAt ?? rawBook.readUpdateTime;
		try {
			const progressResponse = await this.api.getBookProgress(rawBook.bookId);
			progress = progressResponse.book.progress;
			lastActivityAt = progressResponse.book.updateTime ?? rawBook.readUpdateTime;
		} catch (error) {
			failures.push({
				itemId: rawBook.bookId,
				operation: 'progress',
				message: getErrorMessage(error),
			});
		}

		let title = rawBook.title;
		let author = rawBook.author;
		let coverUrl = rawBook.cover;
		let intro = previousBook?.intro ?? '';
		let deepLink = rawBook.deepLink;
		try {
			const infoResponse = await this.api.getBookInfo(rawBook.bookId);
			title = infoResponse.title;
			author = infoResponse.author;
			coverUrl = infoResponse.cover;
			intro = infoResponse.intro ?? previousBook?.intro ?? '';
			deepLink = infoResponse.deepLink ?? rawBook.deepLink;
		} catch (error) {
			failures.push({
				itemId: rawBook.bookId,
				operation: 'info',
				message: getErrorMessage(error),
			});
		}

		return {
			item: {
				id: rawBook.bookId,
				kind: 'book',
				title,
				author,
				coverUrl,
				category: rawBook.category,
				...optionalDeepLink(deepLink),
				...optionalLastActivity(lastActivityAt),
				progress,
				readingState: toBookReadingState(progress),
				intro,
			},
			failures,
		};
	}

	private normalizeAudiobook(rawAlbum: RawShelfAlbum, previousItem: ShelfItem | undefined): Audiobook {
		const previousAudio = previousItem?.kind === 'audiobook' ? previousItem : undefined;
		const lastActivityAt = rawAlbum.albumInfoExtra.lectureReadUpdateTime;
		const sourceUpdateTime = rawAlbum.albumInfo.updateTime;

		return {
			id: rawAlbum.albumInfo.albumId,
			kind: 'audiobook',
			title: rawAlbum.albumInfo.name,
			author: rawAlbum.albumInfo.authorName,
			coverUrl: rawAlbum.albumInfo.cover,
			category: '',
			...optionalLastActivity(lastActivityAt),
			listeningState: toAudiobookListeningState(lastActivityAt),
			sourceUpdateTime,
			hasUnreadUpdate:
				previousAudio !== undefined && previousAudio.sourceUpdateTime < sourceUpdateTime,
		};
	}
}

function optionalDeepLink(deepLink: string | undefined): Pick<ElectronicBook, 'deepLink'> | object {
	return deepLink === undefined || deepLink === '' ? {} : { deepLink };
}

function optionalLastActivity(lastActivityAt: number | undefined): Pick<ShelfItem, 'lastActivityAt'> | object {
	return lastActivityAt === undefined || lastActivityAt <= 0 ? {} : { lastActivityAt };
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
