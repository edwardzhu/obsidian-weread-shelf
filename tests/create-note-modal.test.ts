import { describe, expect, it, vi } from 'vitest';
import { Setting } from 'obsidian';
import { CreateNoteModal } from '../src/ui/create-note-modal';
import type { ShelfItem } from '../src/types';

const book: ShelfItem = {
	id: 'book-1',
	kind: 'book',
	title: 'The Book',
	author: 'Author',
	coverUrl: '',
	category: '',
	progress: 0,
	readingState: 'unread',
	intro: '',
};

interface MockSettingButton {
	text: string;
	click(): void;
}

interface MockSetting {
	name: string;
	buttonText: string;
	button: MockSettingButton;
}

describe('CreateNoteModal', () => {
	it('offers candidate connection, blank creation, and template creation', async () => {
		const onChoose = vi.fn().mockResolvedValue(undefined);
		const modal = new CreateNoteModal(
			{} as never,
			{
				book,
				candidatePaths: ['Reading/Existing.md'],
				purpose: 'single',
			},
			[{ path: 'Reading/template.md', content: '# {{title}}\n', frontmatter: {} }],
			onChoose,
			);

			(Setting as unknown as { instances: MockSetting[] }).instances.length = 0;
			(modal as unknown as {
				contentEl: { empty: () => void; createEl: () => void };
			}).contentEl = { empty: () => {}, createEl: () => {} };
			modal.onOpen();

		const settings = (Setting as unknown as { instances: MockSetting[] }).instances;
		expect(settings.map((setting) => setting.name)).toContain('候选笔记：Reading/Existing.md');
		expect(settings.map((setting) => setting.name)).toContain('不使用模板');
		expect(settings.map((setting) => setting.name)).toContain('模板：Reading/template.md');
		expect(settings.map((setting) => setting.buttonText)).toEqual([
			'连接并打开',
			'新建',
			'使用模板',
		]);

		settings[0]!.button.click();
		await Promise.resolve();
		expect(onChoose).toHaveBeenCalledWith({ kind: 'blank' }, 'Reading/Existing.md');

		settings[1]!.button.click();
		await Promise.resolve();
		expect(onChoose).toHaveBeenCalledWith({ kind: 'blank' });

		settings[2]!.button.click();
		await Promise.resolve();
		expect(onChoose).toHaveBeenCalledWith({ kind: 'template', source: '# {{title}}\n' });
	});

	it('does nothing when closed without a selection', () => {
		const onChoose = vi.fn();
		const modal = new CreateNoteModal(
			{} as never,
			{ book, candidatePaths: [], purpose: 'single' },
			[],
			onChoose,
		);
		const empty = vi.fn();
		(modal as unknown as { contentEl: { empty: () => void } }).contentEl = { empty };

		modal.onClose();

		expect(empty).toHaveBeenCalledOnce();
		expect(onChoose).not.toHaveBeenCalled();
	});
});
