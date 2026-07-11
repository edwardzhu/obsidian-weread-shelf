import { WereadGatewayError, WereadUpgradeRequiredError } from './errors';

const GATEWAY_URL = 'https://i.weread.qq.com/api/agent/gateway';
const SKILL_VERSION = '1.0.4';

export interface RawShelfBook {
	bookId: string;
	title: string;
	author: string;
	cover: string;
	category: string;
	deepLink?: string;
	readUpdateTime?: number;
	finishReading?: number;
}

export interface RawShelfAlbum {
	albumInfo: {
		albumId: string;
		name: string;
		authorName: string;
		cover: string;
		updateTime: number;
	};
	albumInfoExtra: { lectureReadUpdateTime?: number };
}

export interface RawShelfResponse {
	books: RawShelfBook[];
	albums: RawShelfAlbum[];
}

export interface RawBookProgressResponse {
	book: { progress: number; updateTime?: number };
}

export interface RawBookInfoResponse {
	bookId: string;
	title: string;
	author: string;
	cover: string;
	intro?: string;
	deepLink?: string;
}

export interface RawNotebookBook {
	bookId: string;
	book: { title: string; author: string; cover: string };
	bookmarkCount: number;
	noteCount: number;
	reviewCount: number;
	sort: number;
}

export interface RawBookmarkListResponse {
	updated: Array<{
		bookmarkId: string;
		bookId: string;
		chapterUid: number;
		markText: string;
		createTime: number;
		range: string;
	}>;
	chapters: Array<{ chapterUid: number; chapterIdx: number; title: string }>;
}

export interface RawReview {
	review: {
		reviewId: string;
		content: string;
		abstract?: string;
		range?: string;
		chapterUid?: number;
		chapterIdx?: number;
		chapterName?: string;
		createTime: number;
		star?: number;
	};
}

interface RawNotebookPage {
	books: RawNotebookBook[];
	hasMore: 0 | 1;
}

interface RawReviewPage {
	reviews: RawReview[];
	hasMore: 0 | 1;
	synckey: number;
}

export interface WereadApi {
	getShelf(): Promise<RawShelfResponse>;
	getBookProgress(bookId: string): Promise<RawBookProgressResponse>;
	getBookInfo(bookId: string): Promise<RawBookInfoResponse>;
	listNotebookBooks(): Promise<RawNotebookBook[]>;
	getBookmarks(bookId: string): Promise<RawBookmarkListResponse>;
	listMyReviews(bookId: string): Promise<RawReview[]>;
}

export class WereadClient implements WereadApi {
	constructor(
		private readonly apiKey: string,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	async getShelf(): Promise<RawShelfResponse> {
		return this.request('/shelf/sync', {});
	}

	async getBookProgress(bookId: string): Promise<RawBookProgressResponse> {
		return this.request('/book/getprogress', { bookId });
	}

	async getBookInfo(bookId: string): Promise<RawBookInfoResponse> {
		return this.request('/book/info', { bookId });
	}

	async listNotebookBooks(): Promise<RawNotebookBook[]> {
		return this.requestAllNotebooks();
	}

	async getBookmarks(bookId: string): Promise<RawBookmarkListResponse> {
		return this.request('/book/bookmarklist', { bookId });
	}

	async listMyReviews(bookId: string): Promise<RawReview[]> {
		return this.requestAllReviews(bookId);
	}

	private async request<T>(
		apiName: string,
		parameters: Record<string, unknown>,
	): Promise<T> {
		const response = await this.fetchImpl(GATEWAY_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				api_name: apiName,
				...parameters,
				skill_version: SKILL_VERSION,
			}),
		});

		if (!response.ok) {
			throw new WereadGatewayError(response.status, response.statusText);
		}

		const payload: unknown = await response.json();
		if (!isRecord(payload)) {
			throw new WereadGatewayError(-1, 'Gateway returned invalid JSON');
		}

		const upgradeInfo = payload.upgrade_info;
		if (isRecord(upgradeInfo)) {
			const instruction =
				typeof upgradeInfo.message === 'string'
					? upgradeInfo.message
					: 'WeRead requires an upgrade';
			throw new WereadUpgradeRequiredError(instruction);
		}

		if (typeof payload.errcode === 'number' && payload.errcode !== 0) {
			const message = typeof payload.errmsg === 'string' ? payload.errmsg : 'WeRead gateway error';
			throw new WereadGatewayError(payload.errcode, message);
		}

		return payload as T;
	}

	private async requestAllNotebooks(): Promise<RawNotebookBook[]> {
		const records: RawNotebookBook[] = [];
		let lastSort: number | undefined;
		do {
			const parameters =
				lastSort === undefined ? { count: 100 } : { count: 100, lastSort };
			const page = await this.request<RawNotebookPage>('/user/notebooks', parameters);
			records.push(...page.books);
			if (page.hasMore !== 1) {
				return records;
			}
			const finalRecord = page.books.at(-1);
			if (finalRecord === undefined) {
				throw new WereadGatewayError(-1, 'Notebook cursor page was empty');
			}
			lastSort = finalRecord.sort;
		} while (true);
	}

	private async requestAllReviews(bookId: string): Promise<RawReview[]> {
		const records: RawReview[] = [];
		let synckey = 0;
		do {
			const page = await this.request<RawReviewPage>('/review/list/mine', {
				bookid: bookId,
				synckey,
				count: 100,
			});
			records.push(...page.reviews);
			if (page.hasMore !== 1) {
				return records;
			}
			if (page.synckey === synckey) {
				throw new WereadGatewayError(-1, 'Review cursor did not advance');
			}
			synckey = page.synckey;
		} while (true);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
