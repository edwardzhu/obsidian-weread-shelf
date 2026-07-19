import { describe, expect, it } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import WereadShelfPlugin from '../src/main';
import type { AssociatedNoteIndex } from '../src/services/note-index-service';
import type { PersistedPluginData } from '../src/storage/plugin-data-store';

interface FakeAppOptions {
	/** Invoke the layout-ready callback synchronously, mirroring an already-ready workspace. */
	layoutReadyImmediately?: boolean;
}

interface FakeApp {
	app: unknown;
	getLayoutReadyCallback(): (() => unknown) | undefined;
	/** Resolves once an immediately-fired layout-ready callback has settled. */
	whenLayoutReadySettled(): Promise<void>;
}

/**
 * Builds a fake Obsidian app whose vault always resolves the associated note, so
 * that an empty index can only mean "the build has not run yet" — never "the
 * vault was not ready". This lets the timing assertions isolate deferral from
 * vault readiness.
 */
function createFakeApp(options: FakeAppOptions = {}): FakeApp {
	const noteFile = Object.assign(new TFile(), {
		path: 'WeRead/book.md',
		extension: 'md',
	});
	const notesFolder = Object.assign(new TFolder(), {
		path: 'WeRead',
		children: [noteFile],
	});

	let layoutReadyCallback: (() => unknown) | undefined;
	let layoutReadySettled: Promise<void> = Promise.resolve();
	const app = {
		vault: {
			getAbstractFileByPath(path: string): unknown {
				if (path === 'WeRead') return notesFolder;
				if (path === 'WeRead/book.md') return noteFile;
				return null;
			},
			read: async (): Promise<string> => 'note body',
			on: () => ({}),
		},
		metadataCache: {
			getFileCache: () => null,
		},
		workspace: {
			onLayoutReady(callback: () => unknown): void {
				if (options.layoutReadyImmediately === true) {
					layoutReadySettled = Promise.resolve(callback()).then(() => undefined);
					return;
				}
				layoutReadyCallback = callback;
			},
			getLeavesOfType: () => [],
		},
	};

	return {
		app,
		getLayoutReadyCallback: () => layoutReadyCallback,
		whenLayoutReadySettled: () => layoutReadySettled,
	};
}

function createPlugin(fakeApp: FakeApp): WereadShelfPlugin {
	const persisted: PersistedPluginData = {
		settings: { associations: { 'book-1': 'WeRead/book.md' } },
	};
	const plugin = new WereadShelfPlugin(fakeApp.app as never, { id: 'weread-shelf' } as never);
	plugin.loadData = async () => persisted;
	return plugin;
}

function associatedBookIds(plugin: WereadShelfPlugin): string[] {
	const noteIndex = (plugin as unknown as { noteIndex: AssociatedNoteIndex }).noteIndex;
	return [...noteIndex.toAssociatedBookIds()];
}

/**
 * Cold-start regression: when the plugin loads before Obsidian has finished
 * loading the vault, the note index must be built on `workspace.onLayoutReady`
 * (not inline in `onload`), so the "有笔记" badge reflects on-disk notes once the
 * vault is ready. Building inline during onload reads a not-yet-ready vault and
 * drops every association, leaving the badge missing until an unrelated refresh.
 */
describe('WereadShelfPlugin onload note index timing', () => {
	it('defers the initial note index build until the workspace layout is ready', async () => {
		const fakeApp = createFakeApp();
		const plugin = createPlugin(fakeApp);

		await plugin.onload();

		// The vault resolves the note, so an empty index proves the build was
		// deferred rather than run inline: an inline build would have populated it.
		expect(fakeApp.getLayoutReadyCallback()).toBeTypeOf('function');
		expect(associatedBookIds(plugin)).toEqual([]);

		// Once the layout-ready callback fires, the badge state is populated.
		await fakeApp.getLayoutReadyCallback()!();

		expect(associatedBookIds(plugin)).toEqual(['book-1']);
	});

	it('builds the note index immediately when the layout is already ready', async () => {
		const fakeApp = createFakeApp({ layoutReadyImmediately: true });
		const plugin = createPlugin(fakeApp);

		await plugin.onload();
		await fakeApp.whenLayoutReadySettled();

		expect(associatedBookIds(plugin)).toEqual(['book-1']);
	});
});
