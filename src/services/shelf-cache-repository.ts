import type { ShelfCache } from '../types';

export interface ShelfCacheRepository {
	load(): Promise<ShelfCache | null>;
	save(cache: ShelfCache): Promise<void>;
}
