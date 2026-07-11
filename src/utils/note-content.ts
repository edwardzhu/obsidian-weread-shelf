export const WEREAD_BLOCK_START = '<!-- weread-notes:start -->';
export const WEREAD_BLOCK_END = '<!-- weread-notes:end -->';

export interface TemplateVariables {
	title: string;
	author: string;
	bookId: string;
	category: string;
	cover: string;
	readDate: string;
	wereadUrl: string;
}

export interface RenderWereadExportInput {
	book: { title: string; author: string; deepLink?: string };
	bookmarkCount: number;
	highlights: Array<{ chapterTitle: string; bookmarkId: string; text: string }>;
	reviews: Array<{
		content: string;
		abstract?: string;
		chapterTitle?: string;
		bookmarkRange?: string;
	}>;
}

const TEMPLATE_KEYS: Array<keyof TemplateVariables> = [
	'title',
	'author',
	'bookId',
	'category',
	'cover',
	'readDate',
	'wereadUrl',
];

export function renderBookTemplate(template: string, variables: TemplateVariables): string {
	return TEMPLATE_KEYS.reduce(
		(rendered, key) => rendered.replaceAll(`{{${key}}}`, variables[key]),
		template,
	);
}

export function replaceWereadBlock(existing: string, generatedContent = ''): string {
	const block = renderManagedBlock(generatedContent);
	const startIndex = existing.indexOf(WEREAD_BLOCK_START);
	const endIndex = existing.indexOf(WEREAD_BLOCK_END);

	if (startIndex >= 0 && endIndex > startIndex) {
		return `${existing.slice(0, startIndex)}${block}${existing.slice(endIndex + WEREAD_BLOCK_END.length)}`;
	}

	const separator = existing.endsWith('\n') ? '\n' : '\n\n';
	return `${existing}${separator}${block}`;
}

export function renderWereadExport(input: RenderWereadExportInput): string {
	const linkedReviews = new Set<number>();
	const lines = [
		`# ${input.book.title}`,
		'',
		`- Author: ${input.book.author}`,
		`- Bookmark count: ${input.bookmarkCount}`,
	];

	if (input.book.deepLink !== undefined && input.book.deepLink !== '') {
		lines.push(`- WeRead: ${input.book.deepLink}`);
	}

	lines.push('', '## Highlights');

	for (const [chapterTitle, highlights] of groupByChapter(input.highlights)) {
		lines.push('', `### ${chapterTitle}`);
		for (const highlight of highlights) {
			lines.push('', `> ${highlight.text}`);
			const matchingReviews = input.reviews
				.map((review, index) => ({ review, index }))
				.filter(({ review }) => isLinkedThought(review, highlight));
			for (const { review, index } of matchingReviews) {
				linkedReviews.add(index);
				lines.push('', `- Thought: ${review.content}`);
			}
		}
	}

	const chapterReviews = input.reviews.filter(
		(review, index) =>
			!linkedReviews.has(index) &&
			hasText(review.chapterTitle) &&
			!hasText(review.abstract) &&
			!hasText(review.bookmarkRange),
	);
	if (chapterReviews.length > 0) {
		lines.push('', '## Chapter thoughts');
		for (const review of chapterReviews) {
			lines.push('', `### ${review.chapterTitle}`, '', review.content);
		}
	}

	const wholeBookReviews = input.reviews.filter(
		(review, index) =>
			!linkedReviews.has(index) &&
			!hasText(review.chapterTitle) &&
			!hasText(review.abstract) &&
			!hasText(review.bookmarkRange),
	);
	if (wholeBookReviews.length > 0) {
		lines.push('', '## Whole-book thoughts');
		for (const review of wholeBookReviews) {
			lines.push('', review.content);
		}
	}

	return `${lines.join('\n').trimEnd()}\n`;
}

function renderManagedBlock(generatedContent: string): string {
	const content = generatedContent.trim();
	return content === ''
		? `${WEREAD_BLOCK_START}\n${WEREAD_BLOCK_END}`
		: `${WEREAD_BLOCK_START}\n${content}\n${WEREAD_BLOCK_END}`;
}

function groupByChapter(
	highlights: RenderWereadExportInput['highlights'],
): Array<[string, RenderWereadExportInput['highlights']]> {
	const groups = new Map<string, RenderWereadExportInput['highlights']>();
	for (const highlight of highlights) {
		const group = groups.get(highlight.chapterTitle) ?? [];
		group.push(highlight);
		groups.set(highlight.chapterTitle, group);
	}
	return [...groups.entries()];
}

function isLinkedThought(
	review: RenderWereadExportInput['reviews'][number],
	highlight: RenderWereadExportInput['highlights'][number],
): boolean {
	return (
		review.abstract === highlight.text ||
		review.bookmarkRange === highlight.bookmarkId ||
		review.bookmarkRange === highlight.text
	);
}

function hasText(value: string | undefined): boolean {
	return value !== undefined && value.trim() !== '';
}
