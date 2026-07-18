import type {
	ShelfSyncProgressListener,
	ShelfSyncResult,
	ShelfSyncTask,
} from './shelf-sync-service';

export class ShelfSyncCoordinator {
	private activeSync: Promise<ShelfSyncResult> | null = null;
	private readonly listeners = new Set<ShelfSyncProgressListener>();

	constructor(private readonly task: ShelfSyncTask) {}

	sync(onProgress?: ShelfSyncProgressListener): Promise<ShelfSyncResult> {
		if (onProgress !== undefined) {
			this.listeners.add(onProgress);
		}
		if (this.activeSync !== null) {
			return this.activeSync;
		}

		const taskPromise = this.task((progress) => this.notify(progress));
		const activeSync = taskPromise.finally(() => {
			if (this.activeSync === activeSync) {
				this.activeSync = null;
				this.listeners.clear();
			}
		});
		this.activeSync = activeSync;
		return activeSync;
	}

	private notify(progress: Parameters<ShelfSyncProgressListener>[0]): void {
		for (const listener of this.listeners) {
			listener(progress);
		}
	}
}
