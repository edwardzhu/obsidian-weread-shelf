import { describe, expect, it, vi } from 'vitest';
import type {
	ShelfSyncProgressListener,
	ShelfSyncResult,
	ShelfSyncTask,
} from '../src/services/shelf-sync-service';
import { ShelfSyncCoordinator } from '../src/services/shelf-sync-coordinator';

const result: ShelfSyncResult = {
	cache: { version: 1, items: [], lastSuccessfulSyncAt: 1 },
	failures: [],
};

describe('ShelfSyncCoordinator', () => {
	it('shares an active sync and forwards progress to every caller', async () => {
		let notify: ShelfSyncProgressListener | undefined;
		let resolveSync: ((value: ShelfSyncResult) => void) | undefined;
		const task: ShelfSyncTask = (onProgress) => {
			notify = onProgress;
			return new Promise((resolve) => {
				resolveSync = resolve;
			});
		};
		const taskSpy = vi.fn(task);
		const coordinator = new ShelfSyncCoordinator(taskSpy);
		const firstProgress = vi.fn();
		const secondProgress = vi.fn();

		const first = coordinator.sync(firstProgress);
		const second = coordinator.sync(secondProgress);

		expect(first).toBe(second);
		expect(taskSpy).toHaveBeenCalledTimes(1);
		notify?.({ phase: 'enriching', completed: 1, total: 2 });
		expect(firstProgress).toHaveBeenCalledWith({ phase: 'enriching', completed: 1, total: 2 });
		expect(secondProgress).toHaveBeenCalledWith({ phase: 'enriching', completed: 1, total: 2 });

		resolveSync?.(result);
		await expect(first).resolves.toBe(result);
	});

	it('starts a new task after the previous sync settles', async () => {
		const task = vi.fn<ShelfSyncTask>().mockResolvedValue(result);
		const coordinator = new ShelfSyncCoordinator(task);

		await coordinator.sync();
		await coordinator.sync();

		expect(task).toHaveBeenCalledTimes(2);
	});
});
