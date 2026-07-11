import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ShelfSort } from './types';

export interface WereadShelfSettings {
	apiKey: string;
	notesFolder: string;
	templateFolder: string;
	webOpenTarget: 'tab' | 'window';
	entryMode: 'web' | 'app';
	sort: ShelfSort;
	associations: Record<string, string>;
}

export const DEFAULT_SETTINGS: WereadShelfSettings = {
	apiKey: '',
	notesFolder: 'WeRead',
	templateFolder: '',
	webOpenTarget: 'tab',
	entryMode: 'web',
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
		webOpenTarget:
			persisted.webOpenTarget === 'window' ? 'window' : DEFAULT_SETTINGS.webOpenTarget,
		entryMode: persisted.entryMode === 'app' ? 'app' : DEFAULT_SETTINGS.entryMode,
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
		containerEl.createEl('h2', { text: 'WeRead shelf' });
		const settings = this.dependencies.getSettings();

		new Setting(containerEl)
			.setName('API Key')
			.addText((text) => {
				text
					.setPlaceholder('wrk-...')
					.setValue(settings.apiKey)
					.onChange((value) => this.savePartial({ apiKey: value.trim() }));
			});

		this.addFolderSetting('Notes folder', settings.notesFolder, (value) =>
			this.savePartial({ notesFolder: value }),
		);
		this.addFolderSetting('Template folder', settings.templateFolder, (value) =>
			this.savePartial({ templateFolder: value }),
		);

		new Setting(containerEl)
			.setName('Web open target')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('tab', 'Tab')
					.addOption('window', 'Window')
					.setValue(settings.webOpenTarget)
					.onChange((value) => this.savePartial({ webOpenTarget: value === 'window' ? 'window' : 'tab' }));
			});

		new Setting(containerEl)
			.setName('Entry mode')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('web', 'Web')
					.addOption('app', 'App')
					.setValue(settings.entryMode)
					.onChange((value) => this.savePartial({ entryMode: value === 'app' ? 'app' : 'web' }));
			});

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
