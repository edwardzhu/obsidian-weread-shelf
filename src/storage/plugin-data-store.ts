import type { NoteAssociationStore } from '../services/note-service';
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	type WereadShelfSettings,
} from '../settings';
import type { ShelfCache } from '../types';

export interface PersistedPluginData {
	settings?: Partial<WereadShelfSettings>;
	shelfCache?: ShelfCache;
}

export class PluginDataStore implements NoteAssociationStore {
	private data: PersistedPluginData = {};
	private settings: WereadShelfSettings = structuredClone(DEFAULT_SETTINGS);

	constructor(
		private readonly loadPluginData: () => Promise<PersistedPluginData | null>,
		private readonly savePluginData: (data: PersistedPluginData) => Promise<void>,
	) {}

	async initialize(): Promise<WereadShelfSettings> {
		const loaded = (await this.loadPluginData()) ?? {};
		this.settings = mergeSettings(loaded.settings);
		this.data = {
			settings: cloneSettings(this.settings),
			...(loaded.shelfCache === undefined ? {} : { shelfCache: loaded.shelfCache }),
		};

		if (JSON.stringify(loaded.settings ?? {}) !== JSON.stringify(this.settings)) {
			await this.saveCurrent();
		}

		return this.settings;
	}

	getSettings(): WereadShelfSettings {
		return cloneSettings(this.settings);
	}

	async updateSettings(settings: WereadShelfSettings): Promise<void> {
		this.settings = cloneSettings(settings);
		await this.saveCurrent();
	}

	async getCache(): Promise<ShelfCache | null> {
		return this.data.shelfCache ?? null;
	}

	async setCache(cache: ShelfCache): Promise<void> {
		this.data = { ...this.data, shelfCache: cache };
		await this.saveCurrent();
	}

	getPath(bookId: string): string | undefined {
		return this.settings.associations[bookId];
	}

	async setPath(bookId: string, path: string): Promise<void> {
		this.settings = {
			...this.settings,
			associations: { ...this.settings.associations, [bookId]: path },
		};
		await this.saveCurrent();
	}

	private async saveCurrent(): Promise<void> {
		this.data = {
			settings: cloneSettings(this.settings),
			...(this.data.shelfCache === undefined ? {} : { shelfCache: this.data.shelfCache }),
		};
		await this.savePluginData(structuredClone(this.data));
	}
}

function cloneSettings(settings: WereadShelfSettings): WereadShelfSettings {
	return {
		...settings,
		associations: { ...settings.associations },
	};
}
