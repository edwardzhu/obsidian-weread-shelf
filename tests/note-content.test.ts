import { describe, expect, it } from 'vitest';
import {
	renderBookTemplate,
	renderWereadExport,
	replaceWereadBlock,
} from '../src/utils/note-content';
import { makeDefaultNotePath } from '../src/utils/note-path';

describe('note content', () => {
	it('interpolates every supported template variable', () => {
		const rendered = renderBookTemplate(
			'{{title}}|{{author}}|{{bookId}}|{{category}}|{{cover}}|{{readDate}}|{{wereadUrl}}',
			{
				title: 'Book',
				author: 'Writer',
				bookId: 'b-1',
				category: 'Fiction',
				cover: 'https://cover',
				readDate: '2026-07-11',
				wereadUrl: 'weread://book/b-1',
			},
		);
		expect(rendered).toBe('Book|Writer|b-1|Fiction|https://cover|2026-07-11|weread://book/b-1');
	});

	it('replaces only the managed block and preserves handwritten text', () => {
		const result = replaceWereadBlock(
			'# My thoughts\n\n<!-- weread-notes:start -->\nold\n<!-- weread-notes:end -->\n\nKeep this',
		);
		expect(result).toContain('# My thoughts');
		expect(result).toContain('Keep this');
		expect(result).not.toContain('\nold\n');
	});

	it('uses a stable book-id suffix for a collision path', () => {
		expect(makeDefaultNotePath('Reading', 'A / B', '123')).toBe('Reading/A B.md');
		expect(makeDefaultNotePath('Reading', 'A / B', '123', true)).toBe('Reading/A B - 123.md');
	});

	it('renders exports with chapter highlights and thought sections in order', () => {
		const rendered = renderWereadExport({
			book: { title: 'Book', author: 'Author', deepLink: 'weread://book/b-1' },
			bookmarkCount: 2,
			highlights: [
				{ chapterTitle: 'Chapter 1', bookmarkId: 'h-1', text: 'First highlight' },
				{ chapterTitle: 'Chapter 2', bookmarkId: 'h-2', text: 'Second highlight' },
			],
			reviews: [
				{ content: 'Linked thought', abstract: 'First highlight', chapterTitle: 'Chapter 1' },
				{ content: 'Chapter thought', chapterTitle: 'Chapter 2' },
				{ content: 'Whole book thought' },
			],
		});

		expect(rendered).toContain('- Bookmark count: 2');
		expect(rendered).toContain('- WeRead: weread://book/b-1');
		expect(rendered.indexOf('### Chapter 1')).toBeLessThan(rendered.indexOf('> First highlight'));
		expect(rendered.indexOf('> First highlight')).toBeLessThan(rendered.indexOf('Linked thought'));
		expect(rendered.indexOf('### Chapter 2')).toBeLessThan(rendered.indexOf('> Second highlight'));
		expect(rendered.indexOf('## Chapter thoughts')).toBeLessThan(
			rendered.indexOf('Chapter thought'),
		);
		expect(rendered.indexOf('## Whole-book thoughts')).toBeLessThan(
			rendered.indexOf('Whole book thought'),
		);
	});
});
