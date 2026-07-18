import { App, Modal, Setting } from 'obsidian';
import type { TemplateChoice } from '../services/note-service';
import type { StoredNote } from '../storage/obsidian-note-store';
import type { ShelfItem } from '../types';

export interface NoteCreationRequest {
	book: ShelfItem;
	candidatePaths: readonly string[];
	purpose: 'single' | 'batch';
}

export class CreateNoteModal extends Modal {
	constructor(
		app: App,
		private readonly request: NoteCreationRequest,
		private readonly templates: readonly StoredNote[],
		private readonly onChoose: (choice: TemplateChoice, existingPath?: string) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', {
			text: this.request.purpose === 'batch' ? 'Create WeRead notes' : '选择笔记模板',
		});

		for (const path of this.request.candidatePaths) {
			new Setting(contentEl)
				.setName(`候选笔记：${path}`)
				.addButton((button) => {
					button
						.setButtonText('连接并打开')
						.onClick(() => this.choose({ kind: 'blank' }, path));
				});
		}

		new Setting(contentEl)
			.setName('不使用模板')
			.addButton((button) => {
				button.setButtonText('新建').onClick(() => this.choose({ kind: 'blank' }));
			});

		for (const template of this.templates) {
			new Setting(contentEl)
				.setName(`模板：${template.path}`)
				.addButton((button) => {
					button
						.setButtonText('使用模板')
						.onClick(() => this.choose({ kind: 'template', source: template.content }));
				});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private choose(choice: TemplateChoice, existingPath?: string): void {
		const operation = existingPath === undefined
			? this.onChoose(choice)
			: this.onChoose(choice, existingPath);
		void operation.finally(() => this.close());
	}
}
