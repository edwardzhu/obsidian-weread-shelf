import { describe, expect, it, vi } from 'vitest';
import { ShelfView } from '../src/views/shelf-view';
import type { ShelfSyncResult } from '../src/services/shelf-sync-service';
import type { WereadShelfSettings } from '../src/settings';

const settings: WereadShelfSettings = {
	apiKey: '',
	notesFolder: 'WeRead',
	templateFolder: '',
	sort: 'activity',
	associations: {},
};

const result: ShelfSyncResult = {
	cache: { version: 1, items: [], lastSuccessfulSyncAt: 1 },
	failures: [],
};

describe('ShelfView', () => {
	it('does not start a forced sync without an API key', async () => {
		const syncShelf = vi.fn().mockResolvedValue(result);
		const view = new ShelfView({} as never, {
			getCache: async () => result.cache,
			getSettings: () => settings,
			getNoteText: () => new Map(),
			syncShelf,
			openWeread: async () => {},
			openOrCreateNote: async () => {},
			openSettings: () => {},
		});
		(view as unknown as { render: () => void }).render = vi.fn();

		await (view as unknown as { syncAndRender: () => Promise<void> }).syncAndRender();

		expect(syncShelf).not.toHaveBeenCalled();
	});
});
