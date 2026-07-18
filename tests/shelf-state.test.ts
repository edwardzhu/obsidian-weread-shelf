import { describe, expect, it } from 'vitest';
import type { ShelfArchive, ShelfItem } from '../src/types';
import {
	filterAndGroupShelf,
	formatActivityLabel,
	toAudiobookListeningState,
	toBookReadingState,
} from '../src/utils/shelf-state';

const book: ShelfItem = {
	id: 'book-1',
	kind: 'book',
	title: 'The Book',
	author: 'Author',
	coverUrl: '',
	category: 'History',
	progress: 45,
	readingState: 'inProgress',
	lastActivityAt: 1768003200,
	intro: 'A complete history',
};

const unreadBook: ShelfItem = {
	id: 'book-2',
	kind: 'book',
	title: 'Alpha',
	author: 'Other Author',
	coverUrl: '',
	category: 'Fiction',
	progress: 0,
	readingState: 'unread',
	intro: 'Unread intro',
};

const completedBook: ShelfItem = {
	id: 'book-3',
	kind: 'book',
	title: 'Completed',
	author: 'Finisher',
	coverUrl: '',
	category: 'Fiction',
	progress: 100,
	readingState: 'completed',
	lastActivityAt: 1735689600,
	intro: 'Done',
};

const audio: ShelfItem = {
	id: 'audio-1',
	kind: 'audiobook',
	title: 'The Audio',
	author: 'Narrator',
	coverUrl: '',
	category: '',
	listeningState: 'unheard',
	sourceUpdateTime: 1767916800,
	hasUnreadUpdate: false,
};

const listeningAudio: ShelfItem = {
	id: 'audio-2',
	kind: 'audiobook',
	title: 'Beta audio',
	author: 'Narrator',
	coverUrl: '',
	category: 'Audio',
	listeningState: 'listening',
	lastActivityAt: 1704067200,
	sourceUpdateTime: 1704067200,
	hasUnreadUpdate: true,
};

const allItems = [book, audio, unreadBook, completedBook, listeningAudio];

const archives: ShelfArchive[] = [
	{ name: '正在阅读', bookIds: ['book-1', 'book-1', 'book-3'] },
	{ name: '收藏', bookIds: ['book-1', 'book-3'] },
];

describe('shelf state', () => {
	it('maps only 100 percent to completed', () => {
		expect(toBookReadingState(0)).toBe('unread');
		expect(toBookReadingState(1)).toBe('inProgress');
		expect(toBookReadingState(99)).toBe('inProgress');
		expect(toBookReadingState(100)).toBe('completed');
	});

	it('does not infer audiobook completion from serial completion', () => {
		expect(toAudiobookListeningState(0)).toBe('unheard');
		expect(toAudiobookListeningState(1768003200)).toBe('listening');
	});

	it('searches metadata and associated-note text, then groups by activity year', () => {
		const groups = filterAndGroupShelf(
			[book, audio],
			{ query: 'annotation', type: 'all', status: 'all', sort: 'activity' },
			new Map([['book-1', 'My annotation about this history']]),
		);
		expect(groups).toEqual([{ key: '2026', label: '2026', items: [book] }]);
	});

	it('filters by item type', () => {
		expect(
			filterAndGroupShelf(
				allItems,
				{ query: '', type: 'all', status: 'all', sort: 'activity' },
				new Map(),
			).flatMap((group) => group.items.map((item) => item.id)),
		).toEqual(['book-1', 'book-3', 'audio-2', 'audio-1', 'book-2']);

		expect(
			filterAndGroupShelf(
				allItems,
				{ query: '', type: 'books', status: 'all', sort: 'activity' },
				new Map(),
			).flatMap((group) => group.items.map((item) => item.id)),
		).toEqual(['book-1', 'book-3', 'book-2']);
	});

	it('filters by status', () => {
		const idsForStatus = (status: 'unread' | 'inProgress' | 'completed') =>
			filterAndGroupShelf(
				allItems,
				{ query: '', type: 'all', status, sort: 'activity' },
				new Map(),
			).flatMap((group) => group.items.map((item) => item.id));

		expect(idsForStatus('unread')).toEqual(['book-2']);
		expect(idsForStatus('inProgress')).toEqual(['book-1']);
		expect(idsForStatus('completed')).toEqual(['book-3']);

		const completedByState: ShelfItem = {
			...book,
			id: 'book-4',
			progress: 45,
			readingState: 'completed',
		};
		expect(
			filterAndGroupShelf(
				[book, completedBook, completedByState],
				{ query: '', type: 'all', status: 'completed', sort: 'activity' },
				new Map(),
			).flatMap((group) => group.items.map((item) => item.id)),
		).toEqual(['book-4', 'book-3']);
	});

	it('sorts titles inside each group when requested', () => {
		const sameYearBook: ShelfItem = {
			...book,
			id: 'book-4',
			title: 'Aardvark',
			lastActivityAt: book.lastActivityAt,
		};

		const groups = filterAndGroupShelf(
			[sameYearBook, book],
			{ query: '', type: 'books', status: 'all', sort: 'title' },
			new Map(),
		);

		expect(groups[0]?.items.map((item) => item.title)).toEqual(['Aardvark', 'The Book']);
	});

	it('groups items by archive, repeats multi-group books, and puts ungrouped items last', () => {
		const groups = filterAndGroupShelf(
			allItems,
			{ query: '', type: 'grouped', status: 'all', sort: 'activity' },
			new Map(),
			archives,
		);

		expect(groups.map((group) => group.label)).toEqual(['正在阅读', '收藏', '未分组']);
		expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
			['book-1', 'book-3'],
			['book-1', 'book-3'],
			['audio-2', 'audio-1', 'book-2'],
		]);
	});

	it('filters before archive grouping and sorts each archive by title when requested', () => {
		const groups = filterAndGroupShelf(
			allItems,
			{ query: '', type: 'grouped', status: 'all', sort: 'title' },
			new Map(),
			archives,
		);

		expect(groups.find((group) => group.label === '收藏')?.items.map((item) => item.title)).toEqual([
			'Completed',
			'The Book',
		]);

		const filteredGroups = filterAndGroupShelf(
			allItems,
			{ query: 'Alpha', type: 'grouped', status: 'all', sort: 'activity' },
			new Map(),
			archives,
		);

		expect(filteredGroups).toEqual([
			{ key: '未分组', label: '未分组', items: [unreadBook] },
		]);
	});

	it('places the Not started group after numeric year groups', () => {
		const groups = filterAndGroupShelf(
			allItems,
			{ query: '', type: 'all', status: 'all', sort: 'activity' },
			new Map(),
		);

		expect(groups.map((group) => group.key)).toEqual(['2026', '2025', '2024', 'Not started']);
		expect(groups.at(-1)?.items.map((item) => item.id)).toEqual(['audio-1', 'book-2']);
	});

	it('formats exact activity labels for card view models', () => {
		expect(formatActivityLabel(book)).toBe('Last read 2026-01-09');
		expect(formatActivityLabel(audio)).toBe('Not started');
	});
});
