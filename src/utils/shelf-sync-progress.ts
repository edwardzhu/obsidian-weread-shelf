import type { ShelfSyncProgress } from '../services/shelf-sync-service';

export interface ShelfSyncProgressViewModel {
	label: string;
	determinate: boolean;
	completed: number;
	total: number;
}

export function getShelfSyncProgressViewModel(
	progress: ShelfSyncProgress,
): ShelfSyncProgressViewModel {
	if (progress.phase === 'fetching') {
		return { label: '正在获取书架…', determinate: false, completed: 0, total: 0 };
	}
	if (progress.phase === 'enriching') {
		return {
			label: `正在加载书籍 ${progress.completed}/${progress.total}`,
			determinate: true,
			completed: progress.completed,
			total: progress.total,
		};
	}
	if (progress.phase === 'saving') {
		return {
			label: '正在保存书架…',
			determinate: false,
			completed: progress.completed,
			total: progress.total,
		};
	}
	return {
		label: '同步完成',
		determinate: true,
		completed: progress.completed,
		total: progress.total,
	};
}
