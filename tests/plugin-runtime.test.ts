import { describe, expect, it, vi } from 'vitest';
import { PluginRuntime } from '../src/services/plugin-runtime';

describe('PluginRuntime', () => {
	it('refreshes only the shelf after startup when an API key exists', async () => {
		const syncShelf = vi.fn().mockResolvedValue(undefined);
		const syncNotes = vi.fn();
		const runtime = new PluginRuntime(() => 'wrk-key', syncShelf, syncNotes);

		await runtime.start();

		expect(syncShelf).toHaveBeenCalledTimes(1);
		expect(syncNotes).not.toHaveBeenCalled();
	});

	it('does nothing when the API key is blank', async () => {
		const syncShelf = vi.fn().mockResolvedValue(undefined);
		const syncNotes = vi.fn();
		const runtime = new PluginRuntime(() => '  ', syncShelf, syncNotes);

		await runtime.start();

		expect(syncShelf).not.toHaveBeenCalled();
		expect(syncNotes).not.toHaveBeenCalled();
	});

	it('propagates refresh failures without syncing notes', async () => {
		const syncShelf = vi.fn().mockRejectedValue(new Error('bad key'));
		const syncNotes = vi.fn();
		const runtime = new PluginRuntime(() => 'wrk-key', syncShelf, syncNotes);

		await expect(runtime.start()).rejects.toThrow('bad key');
		expect(syncNotes).not.toHaveBeenCalled();
	});

	it('calls the view refresh callback after a successful startup sync', async () => {
		const syncShelf = vi.fn().mockResolvedValue(undefined);
		const syncNotes = vi.fn();
		const refreshViews = vi.fn().mockResolvedValue(undefined);
		const runtime = new PluginRuntime(() => 'wrk-key', syncShelf, syncNotes, refreshViews);

		await runtime.start();

		expect(refreshViews).toHaveBeenCalledTimes(1);
	});
});
