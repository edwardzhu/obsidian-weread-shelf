import { describe, expect, it } from 'vitest';
import type { ShelfItem } from '../src/types';
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
			{ query: 'annotation', type: 'all', status: 'active', sort: 'activity' },
			new Map([['book-1', 'My annotation about this history']]),
		);
		expect(groups).toEqual([{ key: '2026', label: '2026', items: [book] }]);
	});

	it('filters by item type', () => {
		expect(
			filterAndGroupShelf(
				allItems,
				{ query: '', type: 'books', status: 'all', sort: 'activity' },
				new Map(),
			).flatMap((group) => group.items.map((item) => item.id)),
		).toEqual(['book-1', 'book-3', 'book-2']);

		expect(
			filterAndGroupShelf(
				allItems,
				{ query: '', type: 'audiobooks', status: 'all', sort: 'activity' },
				new Map(),
			).flatMap((group) => group.items.map((item) => item.id)),
		).toEqual(['audio-2', 'audio-1']);
	});

	it('filters by status', () => {
		const idsForStatus = (status: 'unread' | 'inProgress' | 'completed' | 'active') =>
			filterAndGroupShelf(
				allItems,
				{ query: '', type: 'all', status, sort: 'activity' },
				new Map(),
			).flatMap((group) => group.items.map((item) => item.id));

		expect(idsForStatus('unread')).toEqual(['book-2']);
		expect(idsForStatus('inProgress')).toEqual(['book-1']);
		expect(idsForStatus('completed')).toEqual(['book-3']);
		expect(idsForStatus('active')).toEqual(['book-1', 'audio-2', 'audio-1', 'book-2']);
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
