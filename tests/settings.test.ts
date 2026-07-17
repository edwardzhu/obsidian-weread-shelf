import { describe, expect, it, vi } from 'vitest';
import { TFolder } from 'obsidian';
import { DEFAULT_SETTINGS, ensureVaultFolder, mergeSettings } from '../src/settings';
import { PluginDataStore, type PersistedPluginData } from '../src/storage/plugin-data-store';
import type { ShelfCache } from '../src/types';


describe('settings', () => {
	it('creates missing nested vault folders in order', async () => {
		const folders = new Set<string>();
		const created: string[] = [];
		const vault = {
			getAbstractFileByPath(path: string): TFolder | null {
				return folders.has(path) ? new TFolder() : null;
			},
			async createFolder(path: string): Promise<TFolder> {
				created.push(path);
				folders.add(path);
				return new TFolder();
			},
		};

		await ensureVaultFolder(vault, 'Books/Weread');

		expect(created).toEqual(['Books', 'Books/Weread']);
	});

	it('does not recreate existing vault folders', async () => {
		const created: string[] = [];
		const vault = {
			getAbstractFileByPath(): TFolder {
				return new TFolder();
			},
			async createFolder(path: string): Promise<TFolder> {
				created.push(path);
				return new TFolder();
			},
		};

		await ensureVaultFolder(vault, 'Books/Weread');

		expect(created).toEqual([]);
	});

	it('merges partial persisted settings without dropping defaults', () => {
		expect(mergeSettings({ notesFolder: 'Reading' })).toEqual({
			...DEFAULT_SETTINGS,
			notesFolder: 'Reading',
		});
	});

	it('preserves cache while updating settings and associations', async () => {
		const shelfCache: ShelfCache = {
			version: 1,
			items: [],
			lastSuccessfulSyncAt: 123,
		};
		let persisted: PersistedPluginData | null = {
			settings: { apiKey: 'wrk-key' },
			shelfCache,
		};
		const store = new PluginDataStore(
			async () => persisted,
			async (data) => {
				persisted = structuredClone(data);
			},
		);

		await store.initialize();
		await store.updateSettings({ ...store.getSettings(), notesFolder: 'Reading' });

		expect(persisted?.shelfCache).toEqual(shelfCache);
		expect(persisted?.settings?.apiKey).toBe('wrk-key');
		expect(persisted?.settings?.notesFolder).toBe('Reading');

		await store.setPath('book-1', 'Reading/book.md');

		expect(persisted?.shelfCache).toEqual(shelfCache);
		expect(persisted?.settings?.apiKey).toBe('wrk-key');
		expect(persisted?.settings?.associations).toEqual({ 'book-1': 'Reading/book.md' });
		expect(store.getPath('book-1')).toBe('Reading/book.md');
	});
});
