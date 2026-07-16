export type BookReadingState = 'unread' | 'inProgress' | 'completed';
export type AudiobookListeningState = 'unheard' | 'listening';
export type ItemTypeFilter = 'all' | 'books';
export type StatusFilter = 'all' | 'inProgress' | 'unread' | 'completed';
export type ShelfSort = 'activity' | 'title';

export interface ShelfItemBase {
	id: string;
	title: string;
	author: string;
	coverUrl: string;
	category: string;
	deepLink?: string;
	lastActivityAt?: number;
}

export interface ElectronicBook extends ShelfItemBase {
	kind: 'book';
	progress: number;
	readingState: BookReadingState;
	intro: string;
}

export interface Audiobook extends ShelfItemBase {
	kind: 'audiobook';
	listeningState: AudiobookListeningState;
	sourceUpdateTime: number;
	hasUnreadUpdate: boolean;
}

export type ShelfItem = ElectronicBook | Audiobook;

export interface ShelfFilterState {
	query: string;
	type: ItemTypeFilter;
	status: StatusFilter;
	sort: ShelfSort;
}

export interface YearGroup {
	key: string;
	label: string;
	items: ShelfItem[];
}

export interface ShelfCache {
	version: 1;
	items: ShelfItem[];
	lastSuccessfulSyncAt: number;
}
