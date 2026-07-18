import { describe, expect, it } from 'vitest';
import { findSimilarNotePaths } from '../src/utils/note-candidates';

describe('findSimilarNotePaths', () => {
	it('ranks normalized exact matches before contains matches', () => {
		const notes = [
			{ path: 'Reading/The Book - notes.md' },
			{ path: 'Reading/the  book.md' },
			{ path: 'Reading/Other.md' },
		];

		expect(findSimilarNotePaths(notes, ' The   BOOK ')).toEqual([
			'Reading/the  book.md',
			'Reading/The Book - notes.md',
		]);
	});

	it('returns no more than five partial Markdown matches in path order', () => {
		const notes = [
			...Array.from({ length: 6 }, (_, index) => ({ path: `Reading/Book ${index}.md` })),
			{ path: 'Reading/Book.txt' },
		];

		expect(findSimilarNotePaths(notes, 'Book')).toEqual(
			notes.slice(0, 5).map((note) => note.path),
		);
	});
});
