import type {
	AudiobookListeningState,
	BookReadingState,
	ShelfFilterState,
	ShelfItem,
	YearGroup,
} from '../types';

const NOT_STARTED_KEY = 'Not started';

export function toBookReadingState(progress: number): BookReadingState {
	if (progress === 100) {
		return 'completed';
	}
	if (progress <= 0) {
		return 'unread';
	}
	return 'inProgress';
}

export function toAudiobookListeningState(
	lastActivityAt: number | undefined,
): AudiobookListeningState {
	return lastActivityAt === undefined || lastActivityAt <= 0 ? 'unheard' : 'listening';
}

export function matchesShelfSearch(
	item: ShelfItem,
	query: string,
	associatedNoteText: string,
): boolean {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (normalizedQuery === '') {
		return true;
	}

	const searchableParts = [
		item.title,
		item.author,
		item.category,
		item.kind === 'book' ? item.intro : '',
		associatedNoteText,
	];

	return searchableParts
		.join('\n')
		.toLocaleLowerCase()
		.includes(normalizedQuery);
}

export function filterAndGroupShelf(
	items: readonly ShelfItem[],
	filters: ShelfFilterState,
	noteTextByBookId: ReadonlyMap<string, string>,
): YearGroup[] {
	const filteredItems = items
		.filter((item) => matchesType(item, filters.type))
		.filter((item) => matchesStatus(item, filters.status))
		.filter((item) =>
			matchesShelfSearch(item, filters.query, noteTextByBookId.get(item.id) ?? ''),
		);

	const groups = new Map<string, ShelfItem[]>();
	for (const item of filteredItems) {
		const groupKey = getActivityYearKey(item);
		const groupItems = groups.get(groupKey) ?? [];
		groupItems.push(item);
		groups.set(groupKey, groupItems);
	}

	return [...groups.entries()]
		.sort(([leftKey], [rightKey]) => compareGroupKeys(leftKey, rightKey))
		.map(([key, groupItems]) => ({
			key,
			label: key,
			items: sortGroupItems(groupItems, filters.sort),
		}));
}

function matchesType(item: ShelfItem, type: ShelfFilterState['type']): boolean {
	if (type === 'books') {
		return item.kind === 'book';
	}
	if (type === 'audiobooks') {
		return item.kind === 'audiobook';
	}
	return true;
}

function matchesStatus(item: ShelfItem, status: ShelfFilterState['status']): boolean {
	if (status === 'all') {
		return true;
	}
	if (status === 'active') {
		return item.kind === 'audiobook' || item.readingState !== 'completed';
	}
	if (item.kind !== 'book') {
		return false;
	}
	return item.readingState === status;
}

function getActivityYearKey(item: ShelfItem): string {
	if (item.lastActivityAt === undefined || item.lastActivityAt <= 0) {
		return NOT_STARTED_KEY;
	}
	return String(new Date(item.lastActivityAt * 1000).getUTCFullYear());
}

function compareGroupKeys(leftKey: string, rightKey: string): number {
	if (leftKey === NOT_STARTED_KEY) {
		return rightKey === NOT_STARTED_KEY ? 0 : 1;
	}
	if (rightKey === NOT_STARTED_KEY) {
		return -1;
	}
	return Number(rightKey) - Number(leftKey);
}

function sortGroupItems(items: readonly ShelfItem[], sort: ShelfFilterState['sort']): ShelfItem[] {
	return [...items].sort((left, right) => {
		if (sort === 'title') {
			return left.title.localeCompare(right.title);
		}
		return (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0);
	});
}
