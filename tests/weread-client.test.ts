import { describe, expect, it, vi } from 'vitest';
import { WereadGatewayError, WereadUpgradeRequiredError } from '../src/api/errors';
import { WereadClient, type RequestFn } from '../src/api/weread-client';

function mockRequestFn(json: unknown): ReturnType<typeof vi.fn<RequestFn>> {
	return vi.fn<RequestFn>().mockResolvedValue({ status: 200, json });
}

describe('WereadClient', () => {
	it('sends flat gateway parameters with authorization and skill version', async () => {
		const requestFn = mockRequestFn({ books: [], albums: [] });
		const client = new WereadClient('wrk-test', requestFn);

		await client.getShelf();

		expect(requestFn).toHaveBeenCalledWith(
			'https://i.weread.qq.com/api/agent/gateway',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({ Authorization: 'Bearer wrk-test' }),
				body: JSON.stringify({ api_name: '/shelf/sync', skill_version: '1.0.4' }),
			}),
		);
	});

	it('rejects an API errcode and an upgrade instruction', async () => {
		const apiError = new WereadClient(
			'key',
			mockRequestFn({ errcode: 401, errmsg: 'bad key' }),
		);
		await expect(apiError.getShelf()).rejects.toBeInstanceOf(WereadGatewayError);

		const upgrade = new WereadClient(
			'key',
			mockRequestFn({ upgrade_info: { message: 'upgrade' } }),
		);
		await expect(upgrade.getShelf()).rejects.toBeInstanceOf(WereadUpgradeRequiredError);
	});

	it('paginates notebook books with a top-level lastSort cursor', async () => {
		const requestFn = vi.fn<RequestFn>()
			.mockResolvedValueOnce({
				status: 200,
				json: { books: [notebookBook('book-1', 20)], hasMore: 1 },
			})
			.mockResolvedValueOnce({
				status: 200,
				json: { books: [notebookBook('book-2', 10)], hasMore: 0 },
			});
		const client = new WereadClient('key', requestFn);

		await expect(client.listNotebookBooks()).resolves.toEqual([
			notebookBook('book-1', 20),
			notebookBook('book-2', 10),
		]);

		const bodies = requestFn.mock.calls.map(([, init]) => JSON.parse(init.body));
		expect(bodies).toEqual([
			{ api_name: '/user/notebooks', count: 100, skill_version: '1.0.4' },
			{ api_name: '/user/notebooks', count: 100, lastSort: 20, skill_version: '1.0.4' },
		]);
		expect(bodies[0]).not.toHaveProperty('params');
		expect(bodies[1]).not.toHaveProperty('offset');
		expect(bodies[1]).not.toHaveProperty('limit');
	});

	it('paginates reviews with a top-level synckey cursor', async () => {
		const firstReview = review('review-1');
		const secondReview = review('review-2');
		const requestFn = vi.fn<RequestFn>()
			.mockResolvedValueOnce({
				status: 200,
				json: { reviews: [firstReview], hasMore: 1, synckey: 100 },
			})
			.mockResolvedValueOnce({
				status: 200,
				json: { reviews: [secondReview], hasMore: 0, synckey: 200 },
			});
		const client = new WereadClient('key', requestFn);

		await expect(client.listMyReviews('book-1')).resolves.toEqual([firstReview, secondReview]);

		const bodies = requestFn.mock.calls.map(([, init]) => JSON.parse(init.body));
		expect(bodies).toEqual([
			{ api_name: '/review/list/mine', bookid: 'book-1', synckey: 0, count: 100, skill_version: '1.0.4' },
			{ api_name: '/review/list/mine', bookid: 'book-1', synckey: 100, count: 100, skill_version: '1.0.4' },
		]);
		expect(bodies[1]).not.toHaveProperty('params');
		expect(bodies[1]).not.toHaveProperty('offset');
		expect(bodies[1]).not.toHaveProperty('limit');
	});
});

function notebookBook(bookId: string, sort: number) {
	return {
		bookId,
		book: { title: `Title ${bookId}`, author: 'Author', cover: 'cover' },
		bookmarkCount: 1,
		noteCount: 2,
		reviewCount: 3,
		sort,
	};
}

function review(reviewId: string) {
	return {
		review: {
			reviewId,
			content: `Content ${reviewId}`,
			createTime: 1768003200,
		},
	};
}
