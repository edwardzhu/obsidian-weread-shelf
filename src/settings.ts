import {
	App,
	FuzzySuggestModal,
	Notice,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
	TFolder,
	type TextComponent,
} from 'obsidian';
import type { ShelfSort } from './types';

export interface WereadShelfSettings {
	apiKey: string;
	notesFolder: string;
	templateFolder: string;
	sort: ShelfSort;
	associations: Record<string, string>;
}

export const DEFAULT_SETTINGS: WereadShelfSettings = {
	apiKey: '',
	notesFolder: 'WeRead',
	templateFolder: '',
	sort: 'activity',
	associations: {},
};

export interface WereadShelfSettingTabDependencies {
	getSettings(): WereadShelfSettings;
	updateSettings(settings: WereadShelfSettings): Promise<void>;
}

export async function ensureVaultFolder(
	vault: Pick<App['vault'], 'getAbstractFileByPath' | 'createFolder'>,
	path: string,
): Promise<void> {
	if (path === '') {
		return;
	}

	let currentPath = '';
	for (const segment of path.split('/')) {
		currentPath = currentPath === '' ? segment : `${currentPath}/${segment}`;
		const existing = vault.getAbstractFileByPath(currentPath);
		if (existing === null) {
			await vault.createFolder(currentPath);
		} else if (!(existing instanceof TFolder)) {
			throw new Error(`${currentPath} 不是文件夹`);
		}
	}
}

export function mergeSettings(
	data: Partial<WereadShelfSettings> | null | undefined,
): WereadShelfSettings {
	const persisted = data ?? {};
	return {
		apiKey: typeof persisted.apiKey === 'string' ? persisted.apiKey : DEFAULT_SETTINGS.apiKey,
		notesFolder:
			typeof persisted.notesFolder === 'string'
				? normalizeFolderPath(persisted.notesFolder)
				: DEFAULT_SETTINGS.notesFolder,
		templateFolder:
			typeof persisted.templateFolder === 'string'
				? normalizeFolderPath(persisted.templateFolder)
				: DEFAULT_SETTINGS.templateFolder,
		sort: persisted.sort === 'title' ? 'title' : DEFAULT_SETTINGS.sort,
		associations: { ...(isRecord(persisted.associations) ? persisted.associations : {}) },
	};
}

export class WereadShelfSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly dependencies: WereadShelfSettingTabDependencies,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: '设置微信读书书架' });
		const settings = this.dependencies.getSettings();

		const apiKeySetting = new Setting(containerEl)
			.setName('微信读书 API Key')
			.setDesc(
				createFragment((frag) => {
					frag.appendText('点击「扫码获取」扫码登录后自动获取API Key，也可在');
					frag.createEl('br');
					const link = frag.createEl('a', {
						text: 'weread.qq.com/r/weread-skills',
						href: 'https://weread.qq.com/r/weread-skills',
					});
					link.setAttr('target', '_blank');
					frag.appendText(' 手动申请,格式：wrk-xxxxxxxx。');
					frag.createEl('br');
					const note = frag.createEl('strong');
					note.appendText('注意：');
					frag.appendText(' 一些额外的功能需要依赖Cookie，建议使用扫码登录！！');
				}),
			)
			.addText((text) => {
				text.inputEl.type = 'password';
				text.inputEl.style.width = '300px';
				text
					.setPlaceholder('wrk-...')
					.setValue(settings.apiKey)
					.onChange((value) => this.savePartial({ apiKey: value.trim() }));
			});

		const toggleBtn = apiKeySetting.controlEl.createEl('span', {
			cls: 'clickable-icon',
			attr: { 'aria-label': '显示/隐藏' },
		});
		setIcon(toggleBtn, 'eye');
		toggleBtn.addEventListener('click', () => {
			const input = apiKeySetting.controlEl.querySelector('input');
			if (input) {
				const isHidden = input.type === 'password';
				input.type = isHidden ? 'text' : 'password';
				setIcon(toggleBtn, isHidden ? 'eye-off' : 'eye');
			}
		});

		let notesFolderText: TextComponent | null = null;
		new Setting(containerEl)
			.setName('笔记保存位置')
			.setDesc('请选择Obsidian Vault中微信读书笔记存放的位置，例如：/ 或 Books/Weread')
			.addText((text) => {
				notesFolderText = text;
				text.setPlaceholder('WeRead');
				this.configureFolderInput(text, settings.notesFolder, (value) =>
					this.savePartial({ notesFolder: value }),
				);
			})
			.addButton((btn) => {
				btn.setButtonText('选择').onClick(() => {
					this.pickFolder(async (folder) => {
						notesFolderText?.setValue(folder);
						await this.savePartial({ notesFolder: folder });
					});
				});
			});
		this.addFolderSetting('Template folder', settings.templateFolder, (value) =>
			this.savePartial({ templateFolder: value }),
		);

		new Setting(containerEl)
			.setName('Sort mode')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('activity', 'Activity')
					.addOption('title', 'Title')
					.setValue(settings.sort)
					.onChange((value) => this.savePartial({ sort: value === 'title' ? 'title' : 'activity' }));
			});
	}

	private addFolderSetting(
		name: string,
		value: string,
		onSave: (value: string) => Promise<void>,
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc('Use a vault-relative folder path.')
			.addText((text) => {
				this.configureFolderInput(text, value, onSave);
			});
	}

	private configureFolderInput(
		text: TextComponent,
		value: string,
		onSave: (value: string) => Promise<void>,
	): void {
		text.setValue(value).onChange((nextValue) => {
			const normalized = normalizeFolderPath(nextValue);
			if (isVaultRelativePath(normalized)) {
				void onSave(normalized);
			}
		});
		text.inputEl.addEventListener('blur', () => {
			void this.ensureFolderAndSave(text.inputEl, onSave);
		});
	}

	private async ensureFolderAndSave(
		input: HTMLInputElement,
		onSave: (value: string) => Promise<void>,
	): Promise<void> {
		const normalized = normalizeFolderPath(input.value);
		if (!isVaultRelativePath(normalized)) {
			return;
		}

		try {
			await ensureVaultFolder(this.app.vault, normalized);
			await onSave(normalized);
		} catch (error) {
			new Notice(`无法创建文件夹：${getErrorMessage(error)}`);
		}
	}

	private async savePartial(partial: Partial<WereadShelfSettings>): Promise<void> {
		await this.dependencies.updateSettings({
			...this.dependencies.getSettings(),
			...partial,
			associations: { ...this.dependencies.getSettings().associations },
		});
	}

	private pickFolder(onChoose: (folder: string) => void | Promise<void>): void {
		const modal = new FolderSuggestModal(this.app, (folder) => {
			const path = folder.path === '/' ? '' : folder.path;
			void Promise.resolve(onChoose(path)).catch((error: unknown) => {
				new Notice(`保存文件夹设置失败：${getErrorMessage(error)}`);
			});
		});
		modal.open();
	}
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private readonly onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('选择文件夹...');
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		const rootFolder = this.app.vault.getRoot();
		folders.push(rootFolder);
		const collectFolders = (folder: TFolder): void => {
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					folders.push(child);
					collectFolders(child);
				}
			}
		};
		collectFolders(rootFolder);
		return folders;
	}

	getItemText(item: TFolder): string {
		return item.path === '/' ? '/ (root)' : item.path;
	}

	onChooseItem(item: TFolder): void {
		this.onChoose(item);
	}
}

function normalizeFolderPath(path: string): string {
	return path
		.replaceAll('\\', '/')
		.split('/')
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.join('/');
}

function isVaultRelativePath(path: string): boolean {
	return !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.split('/').includes('..');
}

function isRecord(value: unknown): value is Record<string, string> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
