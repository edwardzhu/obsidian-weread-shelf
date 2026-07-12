import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings';
import { PluginDataStore, type PersistedPluginData } from '../src/storage/plugin-data-store';
import type { ShelfCache } from '../src/types';


describe('settings', () => {
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
