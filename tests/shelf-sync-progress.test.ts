import { describe, expect, it } from 'vitest';
import type { ShelfSyncProgress } from '../src/services/shelf-sync-service';
import { getShelfSyncProgressViewModel } from '../src/utils/shelf-sync-progress';

describe('shelf sync progress', () => {
	it('shows an indeterminate fetching message', () => {
		expect(getShelfSyncProgressViewModel({ phase: 'fetching', completed: 0, total: 0 })).toEqual({
			label: '正在获取书架…',
			determinate: false,
			completed: 0,
			total: 0,
		});
	});

	it('shows a determinate enrichment count', () => {
		const progress: ShelfSyncProgress = { phase: 'enriching', completed: 3, total: 20 };

		expect(getShelfSyncProgressViewModel(progress)).toEqual({
			label: '正在加载书籍 3/20',
			determinate: true,
			completed: 3,
			total: 20,
		});
	});

	it('shows an indeterminate saving message', () => {
		expect(getShelfSyncProgressViewModel({ phase: 'saving', completed: 20, total: 20 })).toEqual({
			label: '正在保存书架…',
			determinate: false,
			completed: 20,
			total: 20,
		});
	});
});
