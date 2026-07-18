import type { StoredNote } from '../storage/obsidian-note-store';

export function findSimilarNotePaths(
	notes: readonly Pick<StoredNote, 'path'>[],
	title: string,
	limit = 5,
): string[] {
	if (limit <= 0) return [];
	const normalizedTitle = normalizeNoteName(title);
	if (normalizedTitle === '') return [];

	return notes
		.map((note) => ({
			path: note.path,
			name: normalizeNoteName(getFileStem(note.path)),
		}))
		.filter(({ path, name }) => path.toLowerCase().endsWith('.md') && name !== '')
		.map((candidate) => ({
			...candidate,
			rank: candidate.name === normalizedTitle ? 0
				: candidate.name.includes(normalizedTitle) || normalizedTitle.includes(candidate.name) ? 1
				: 2,
		}))
		.filter((candidate) => candidate.rank < 2)
		.sort((left, right) => left.rank - right.rank || left.path.localeCompare(right.path))
		.slice(0, limit)
		.map((candidate) => candidate.path);
}

function getFileStem(path: string): string {
	const fileName = path.slice(path.lastIndexOf('/') + 1);
	return fileName.toLowerCase().endsWith('.md') ? fileName.slice(0, -3) : fileName;
}

function normalizeNoteName(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
