import { describe, expect, it, vi } from 'vitest';
import { ShelfView } from '../src/views/shelf-view';
import type { ShelfSyncProgress, ShelfSyncResult } from '../src/services/shelf-sync-service';
import type { WereadShelfSettings } from '../src/settings';
import type { ShelfCache } from '../src/types';

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

function createView(apiKey: string): ShelfView {
	return new ShelfView({} as never, {
		getCache: async () => result.cache,
		getSettings: () => ({ ...settings, apiKey }),
		getNoteText: () => new Map(),
		syncShelf: async () => result,
		openWeread: async () => {},
		openOrCreateNote: async () => {},
		openSettings: () => {},
	});
}

interface FakeElementState {
	createdDivClasses: string[];
	createdProgressCount: number;
}

function createFakeElement(state: FakeElementState = {
	createdDivClasses: [],
	createdProgressCount: 0,
}): HTMLElement & {
	createdDivClasses: string[];
	createdProgressCount: number;
} {
	const element = {
		createdDivClasses: state.createdDivClasses,
		get createdProgressCount() { return state.createdProgressCount; },
		textContent: '',
		max: 0,
		value: 0,
		createDiv(options?: { cls?: string }) {
			if (options?.cls !== undefined) this.createdDivClasses.push(options.cls);
			return createFakeElement(state);
		},
		createEl(tagName: string, options?: { cls?: string }) {
			if (options?.cls !== undefined) this.createdDivClasses.push(options.cls);
			if (tagName === 'progress') {
				state.createdProgressCount++;
				return createFakeProgressElement();
			}
			return createFakeElement(state);
		},
		createSpan(options?: { cls?: string }) {
			if (options?.cls !== undefined) this.createdDivClasses.push(options.cls);
			return createFakeElement(state);
		},
		empty() {},
		removeAttribute() {},
	};
	return element as unknown as HTMLElement & {
		createdDivClasses: string[];
		createdProgressCount: number;
	};
}

function createFakeProgressElement(): HTMLProgressElement {
	return {
		max: 0,
		value: 0,
		setAttribute() {},
		removeAttribute() {},
	} as HTMLProgressElement;
}

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

	it('does not rebuild a cached shelf for every sync progress update', () => {
		const view = new ShelfView({} as never, {
			getCache: async () => result.cache,
			getSettings: () => ({ ...settings, apiKey: 'wrk-test' }),
			getNoteText: () => new Map(),
			syncShelf: async () => result,
			openWeread: async () => {},
			openOrCreateNote: async () => {},
			openSettings: () => {},
		});
		const renderContent = vi.fn();
		const internals = view as unknown as {
			cache: ShelfCache | null;
			contentAreaEl: HTMLElement | null;
			isLoading: boolean;
			renderContent: () => void;
			updateSyncProgress: (progress: ShelfSyncProgress) => void;
		};
		internals.cache = result.cache;
		internals.contentAreaEl = {} as HTMLElement;
		internals.isLoading = true;
		internals.renderContent = renderContent;

		internals.updateSyncProgress({ phase: 'enriching', completed: 1, total: 10 });

		expect(renderContent).not.toHaveBeenCalled();
	});

	it('renders sync progress inside the cached shelf summary', () => {
		const view = createView('wrk-test');
		const parent = createFakeElement();
		const internals = view as unknown as {
			cache: ShelfCache | null;
			isLoading: boolean;
			renderStats: (parent: HTMLElement, cache: ShelfCache) => void;
		};
		internals.cache = result.cache;
		internals.isLoading = true;

		internals.renderStats(parent as HTMLElement, result.cache);

		expect(parent.createdDivClasses).toContain('weread-shelf__summary-progress');
		expect(parent.createdDivClasses).toContain('weread-shelf__summary-progress-label');
		expect(parent.createdProgressCount).toBe(1);
	});

	it('updates cached summary progress without rebuilding shelf content', () => {
		const view = createView('wrk-test');
		const label = { textContent: '' } as HTMLElement;
		const progress = createFakeProgressElement();
		const renderContent = vi.fn();
		const internals = view as unknown as {
			cache: ShelfCache | null;
			contentAreaEl: HTMLElement | null;
			isLoading: boolean;
			renderContent: () => void;
			summarySyncProgressLabelEl: HTMLElement | null;
			summarySyncProgressBarEl: HTMLProgressElement | null;
			updateSyncProgress: (progress: ShelfSyncProgress) => void;
		};
		internals.cache = result.cache;
		internals.contentAreaEl = {} as HTMLElement;
		internals.isLoading = true;
		internals.renderContent = renderContent;
		internals.summarySyncProgressLabelEl = label;
		internals.summarySyncProgressBarEl = progress;

		internals.updateSyncProgress({ phase: 'enriching', completed: 3, total: 10 });

		expect(label.textContent).toBe('正在加载书籍 3/10');
		expect(progress.max).toBe(10);
		expect(progress.value).toBe(3);
		expect(renderContent).not.toHaveBeenCalled();
	});
});
