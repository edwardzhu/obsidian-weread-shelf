import { Notice, Plugin, TAbstractFile, TFile, type App } from 'obsidian';
import { registerCommands } from './commands';
import { WereadClient } from './api/weread-client';
import { AssociatedNoteIndex } from './services/note-index-service';
import { NoteService, type TemplateChoice } from './services/note-service';
import { PluginRuntime } from './services/plugin-runtime';
import { ShelfSyncService, type ShelfSyncResult } from './services/shelf-sync-service';
import { WereadShelfSettingTab } from './settings';
import { ObsidianNoteStore } from './storage/obsidian-note-store';
import { PluginDataStore } from './storage/plugin-data-store';
import type { ShelfItem } from './types';
import { CreateNoteModal } from './ui/create-note-modal';
import { SHELF_VIEW_TYPE, ShelfView } from './views/shelf-view';
import { WEREAD_WEB_VIEW_TYPE, WereadWebView } from './views/web-view';
import { getPcUrl } from './utils/parser';

export default class WereadShelfPlugin extends Plugin {
	private dataStore!: PluginDataStore;
	private noteStore!: ObsidianNoteStore;
	private noteIndex!: AssociatedNoteIndex;
	private backgroundRefreshError: string | null = null;
	private indexRefreshTimer: number | undefined;

	async onload(): Promise<void> {
		this.dataStore = new PluginDataStore(
			() => this.loadData(),
			(data) => this.saveData(data),
		);
		await this.dataStore.initialize();
		this.noteStore = new ObsidianNoteStore(this.app);
		this.noteIndex = new AssociatedNoteIndex(this.noteStore);
		await this.rebuildNoteIndex();

		this.registerView(
			SHELF_VIEW_TYPE,
			(leaf) =>
				new ShelfView(leaf, {
					getCache: () => this.dataStore.getCache(),
					getSettings: () => this.dataStore.getSettings(),
					getNoteText: () => this.noteIndex.toMap(),
					syncShelf: () => this.syncShelf(),
					openWeread: (item) => this.openWeread(item),
					openOrCreateNote: (item) => this.openOrCreateNote(item),
					openSettings: () => this.openSettings(),
				}),
		);

		this.registerView(
			WEREAD_WEB_VIEW_TYPE,
			(leaf) => new WereadWebView(leaf),
		);

		this.addSettingTab(
			new WereadShelfSettingTab(this.app, this, {
				getSettings: () => this.dataStore.getSettings(),
				updateSettings: async (settings) => {
					await this.dataStore.updateSettings(settings);
					await this.rebuildNoteIndex();
					await this.refreshShelfViews();
				},
			}),
		);
		this.addRibbonIcon('book-open', 'Open WeRead shelf', () => {
			void this.openShelfView();
		});
		registerCommands(this);
		this.registerVaultIndexEvents();

		const runtime = new PluginRuntime(
			() => this.dataStore.getSettings().apiKey,
			() => this.syncShelf(),
			() => this.syncAllNotesFromCommand(),
			() => this.refreshShelfViews(),
		);
		void runtime.start().catch((error: unknown) => this.handleBackgroundRefreshFailure(error));
	}

	async onunload(): Promise<void> {
		this.app.workspace.detachLeavesOfType(SHELF_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(WEREAD_WEB_VIEW_TYPE);
	}

	async openShelfView(): Promise<void> {
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: SHELF_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async syncShelfFromCommand(): Promise<void> {
		if (!this.hasApiKey()) {
			new Notice('Set a WeRead API Key first.');
			return;
		}

		try {
			await this.syncShelf();
			await this.refreshShelfViews();
			new Notice('WeRead shelf synced.');
		} catch (error) {
			new Notice(`WeRead shelf sync failed: ${getErrorMessage(error)}`);
		}
	}

	async syncAllNotesFromCommand(): Promise<void> {
		if (!this.hasApiKey()) {
			new Notice('Set a WeRead API Key first.');
			return;
		}

		const cache = await this.dataStore.getCache();
		const booksById = new Map(cache?.items.map((item) => [item.id, item]) ?? []);
		const templates = await this.loadTemplates();
		new CreateNoteModal(
			this.app,
			{
				book: makeBatchModalBook(),
				candidatePaths: [],
				purpose: 'batch',
			},
			templates,
			async (choice) => {
				const result = await this.createNoteService().syncAllNotes(choice, booksById);
				await this.rebuildNoteIndex();
				await this.refreshShelfViews();
				const failed = result.failed.length === 0 ? '' : `, ${result.failed.length} failed`;
				new Notice(`WeRead notes synced: ${result.created.length} created, ${result.updated.length} updated${failed}.`);
			},
		).open();
	}

	async syncShelf(): Promise<ShelfSyncResult> {
		return this.createShelfSyncService().sync();
	}

	private async openWeread(item: ShelfItem): Promise<void> {
		if (item.deepLink === undefined || item.deepLink === '') {
			new Notice('该书籍没有链接。');
			return;
		}
		const url = getPcUrl(item.id);
		const existing = this.app.workspace.getLeavesOfType(WEREAD_WEB_VIEW_TYPE);
		const leaf = existing.length > 0 ? existing[0]! : this.app.workspace.getLeaf('split');
		await leaf.setViewState({ type: WEREAD_WEB_VIEW_TYPE, state: { url }, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	private async openOrCreateNote(item: ShelfItem): Promise<void> {
		const associatedPath = this.dataStore.getPath(item.id);
		if (associatedPath !== undefined && await this.openMarkdown(associatedPath)) {
			return;
		}

		const templates = await this.loadTemplates();
		new CreateNoteModal(
			this.app,
			{ book: item, candidatePaths: [], purpose: 'single' },
			templates,
			async (choice, existingPath) => {
				const note = await this.createNoteService().ensureNote(item, choice, existingPath);
				await this.noteIndex.refreshBook(item.id, note.path);
				await this.openMarkdown(note.path);
				await this.refreshShelfViews();
			},
		).open();
	}

	private openSettings(): void {
		const appWithSettings = this.app as App & {
			setting: {
				open(): void;
				openTabById(id: string): void;
			};
		};
		appWithSettings.setting.open();
		appWithSettings.setting.openTabById(this.manifest.id);
	}

	private createShelfSyncService(): ShelfSyncService {
		return new ShelfSyncService(this.createApi(), {
			load: () => this.dataStore.getCache(),
			save: (cache) => this.dataStore.setCache(cache),
		});
	}

	private createNoteService(): NoteService {
		return new NoteService(
			this.createApi(),
			this.noteStore,
			this.dataStore,
			() => this.dataStore.getSettings().notesFolder,
		);
	}

	private createApi(): WereadClient {
		return new WereadClient(this.dataStore.getSettings().apiKey.trim());
	}

	private hasApiKey(): boolean {
		return this.dataStore.getSettings().apiKey.trim() !== '';
	}

	private async loadTemplates(): Promise<Array<{ path: string; content: string; frontmatter: Record<string, unknown> }>> {
		const folder = this.dataStore.getSettings().templateFolder;
		return folder === '' ? [] : this.noteStore.listMarkdown(folder);
	}

	private async openMarkdown(path: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			return false;
		}
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.openFile(file);
		return true;
	}

	private async rebuildNoteIndex(): Promise<void> {
		await this.noteIndex.rebuild(new Map(Object.entries(this.dataStore.getSettings().associations)));
	}

	private async refreshShelfViews(): Promise<void> {
		this.app.workspace.getLeavesOfType(SHELF_VIEW_TYPE).forEach((leaf) => {
			const view = leaf.view;
			if (view instanceof ShelfView) {
				void view.refresh();
			}
		});
	}

	private registerVaultIndexEvents(): void {
		this.registerEvent(
			this.app.vault.on('modify', (file) => this.scheduleIndexRefresh(file.path)),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => this.scheduleIndexRefresh(file.path)),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath)),
		);
		this.register(() => {
			if (this.indexRefreshTimer !== undefined) {
				clearTimeout(this.indexRefreshTimer);
			}
		});
	}

	private handleRename(file: TAbstractFile, oldPath: string): void {
		const renamedAssociation = Object.entries(this.dataStore.getSettings().associations).find(
			([, path]) => path === oldPath,
		);
		if (renamedAssociation !== undefined) {
			void this.dataStore.setPath(renamedAssociation[0], file.path);
		}
		this.scheduleIndexRefresh(file.path);
	}

	private scheduleIndexRefresh(path: string): void {
		const association = Object.entries(this.dataStore.getSettings().associations).find(
			([, notePath]) => notePath === path,
		);
		if (association === undefined) {
			return;
		}
		if (this.indexRefreshTimer !== undefined) {
			clearTimeout(this.indexRefreshTimer);
		}
		this.indexRefreshTimer = window.setTimeout(() => {
			void this.noteIndex.refreshBook(association[0], this.dataStore.getPath(association[0]))
				.then(() => this.refreshShelfViews());
		}, 200);
	}

	private handleBackgroundRefreshFailure(error: unknown): void {
		this.backgroundRefreshError = getErrorMessage(error);
	}
}

function makeBatchModalBook(): ShelfItem {
	return {
		id: 'batch',
		kind: 'book',
		title: 'All WeRead notes',
		author: '',
		coverUrl: '',
		category: '',
		progress: 0,
		readingState: 'unread',
		intro: '',
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
