import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { PluginDataStore } from '../src/storage/plugin-data-store';

describe('PluginDataStore', () => {
	it('recovers from an empty or truncated plugin data file', async () => {
		const savePluginData = vi.fn().mockResolvedValue(undefined);
		const store = new PluginDataStore(
			async () => {
				throw new SyntaxError('Unexpected end of JSON input');
			},
			savePluginData,
		);

		await expect(store.initialize()).resolves.toEqual(DEFAULT_SETTINGS);
		expect(await store.getCache()).toBeNull();
		expect(savePluginData).toHaveBeenCalledWith({
			settings: DEFAULT_SETTINGS,
		});
	});
});
