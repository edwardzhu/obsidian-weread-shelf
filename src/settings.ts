import { App, FuzzySuggestModal, Plugin, PluginSettingTab, setIcon, Setting, TFolder } from 'obsidian';
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

		new Setting(containerEl)
			.setName('笔记保存位置')
			.setDesc('请选择Obsidian Vault中微信读书笔记存放的位置，例如：/ 或 Books/Weread')
			.addText((text) => {
				text
					.setPlaceholder('WeRead')
					.setValue(settings.notesFolder)
					.onChange((value) => {
						const normalized = normalizeFolderPath(value);
						if (isVaultRelativePath(normalized)) {
							void this.savePartial({ notesFolder: normalized });
						}
					});
			})
			.addButton((btn) => {
				btn.setButtonText('选择').onClick(async () => {
					const folder = await this.pickFolder();
					if (folder !== null) {
						await this.savePartial({ notesFolder: folder });
						this.display();
					}
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
				text.setValue(value).onChange((nextValue) => {
					const normalized = normalizeFolderPath(nextValue);
					if (isVaultRelativePath(normalized)) {
						void onSave(normalized);
					}
				});
			});
	}

	private async savePartial(partial: Partial<WereadShelfSettings>): Promise<void> {
		await this.dependencies.updateSettings({
			...this.dependencies.getSettings(),
			...partial,
			associations: { ...this.dependencies.getSettings().associations },
		});
	}

	private pickFolder(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new FolderSuggestModal(this.app, (folder) => {
				resolve(folder.path === '/' ? '' : folder.path);
			});
			modal.onClose = () => resolve(null);
			modal.open();
		});
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
