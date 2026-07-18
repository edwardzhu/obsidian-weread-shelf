import {
	ItemView,
	Notice,
	setIcon,
	setTooltip,
	type WorkspaceLeaf,
} from 'obsidian';
import type {
	ShelfSyncProgress,
	ShelfSyncProgressListener,
	ShelfSyncResult,
} from '../services/shelf-sync-service';
import type { WereadShelfSettings } from '../settings';
import type { ShelfCache, ShelfFilterState, ShelfItem } from '../types';
import { FORCE_SYNC_ACTION } from '../ui/shelf-toolbar';
import { filterAndGroupShelf } from '../utils/shelf-state';
import { hasConfiguredApiKey } from '../utils/shelf-sync-availability';
import { getShelfSyncProgressViewModel } from '../utils/shelf-sync-progress';

export const SHELF_VIEW_TYPE = 'weread-shelf-view';

export interface ShelfViewDependencies {
	getCache(): Promise<ShelfCache | null>;
	getSettings(): WereadShelfSettings;
	getNoteText(): ReadonlyMap<string, string>;
	syncShelf(onProgress?: ShelfSyncProgressListener): Promise<ShelfSyncResult>;
	openWeread(item: ShelfItem): Promise<void>;
	openOrCreateNote(item: ShelfItem): Promise<void>;
	openSettings(): void;
}

export class ShelfView extends ItemView {
	private filters: ShelfFilterState = {
		query: '',
		type: 'all',
		status: 'all',
		sort: 'activity',
	};
	private cache: ShelfCache | null = null;
	private searchEl: HTMLInputElement | null = null;
	private contentAreaEl: HTMLElement | null = null;
	private isLoading = false;
	private syncProgress: ShelfSyncProgress = {
		phase: 'fetching',
		completed: 0,
		total: 0,
	};

	constructor(
		leaf: WorkspaceLeaf,
		private readonly dependencies: ShelfViewDependencies,
	) {
		super(leaf);
	}

	getViewType(): string {
		return SHELF_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '微信读书书架';
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async refresh(): Promise<void> {
		this.filters = { ...this.filters, sort: this.dependencies.getSettings().sort };
		this.cache = await this.dependencies.getCache();
		this.searchEl = null;
		this.contentAreaEl = null;
		this.isLoading = this.cache === null;
		if (this.isLoading) {
			this.syncProgress = { phase: 'fetching', completed: 0, total: 0 };
		}
		this.render();
		if (this.isLoading) {
			await this.tryInitialRefresh();
			this.isLoading = false;
			this.render();
		}
	}

	private async tryInitialRefresh(): Promise<void> {
		if (!hasConfiguredApiKey(this.dependencies.getSettings().apiKey)) {
			return;
		}

		try {
			this.cache = (
				await this.dependencies.syncShelf((progress) => this.updateSyncProgress(progress))
			).cache;
		} catch {
			this.cache = null;
		}
	}

	private render(): void {
		const root = this.contentEl;

		if (!this.searchEl) {
			root.empty();
			root.addClass('weread-shelf');
			this.renderControls(root);
			this.contentAreaEl = root.createDiv({ cls: 'weread-shelf__content' });
		}

		this.renderContent();
	}

	private renderContent(): void {
		const area = this.contentAreaEl!;
		area.empty();

		if (this.cache !== null) {
			this.renderStats(area, this.cache);
		}

		if (this.cache === null) {
			if (this.isLoading) {
				this.renderSyncProgress(area);
				return;
			}
			this.renderEmpty(area);
			return;
		}

		this.renderGroups(area, this.cache);
	}

	private async syncAndRender(): Promise<void> {
		if (!hasConfiguredApiKey(this.dependencies.getSettings().apiKey)) {
			new Notice('请先在插件设置中配置微信读书 API Key。');
			return;
		}

		this.isLoading = true;
		this.syncProgress = { phase: 'fetching', completed: 0, total: 0 };
		this.render();
		try {
			this.cache = (
				await this.dependencies.syncShelf((progress) => this.updateSyncProgress(progress))
			).cache;
		} catch (error) {
			new Notice(`书架同步失败：${getErrorMessage(error)}`);
		} finally {
			this.isLoading = false;
			this.render();
		}
	}

	private updateSyncProgress(progress: ShelfSyncProgress): void {
		this.syncProgress = progress;
		if (this.isLoading && this.contentAreaEl !== null) {
			this.renderContent();
		}
	}

	private renderSyncProgress(parent: HTMLElement): void {
		const viewModel = getShelfSyncProgressViewModel(this.syncProgress);
		const loading = parent.createDiv({ cls: 'weread-shelf__loading' });
		loading.createDiv({ cls: 'weread-shelf__loading-label', text: viewModel.label });
		const progress = loading.createEl('progress', {
			cls: 'weread-shelf__progress',
			attr: { 'aria-label': viewModel.label },
		});
		if (viewModel.determinate && viewModel.total > 0) {
			progress.max = viewModel.total;
			progress.value = viewModel.completed;
		} else {
			progress.removeAttribute('value');
		}
	}

	private renderStats(parent: HTMLElement, cache: ShelfCache): void {
		const notesCount = this.dependencies.getNoteText().size;
		const now = Date.now();
		const recentCutoff = 30 * 86400000;
		const yearSet = new Set<number>();
		let books = 0;
		let recentCount = 0;

		for (const item of cache.items) {
			if (item.kind === 'book') books++;
			if (item.lastActivityAt && item.lastActivityAt > 0) {
				yearSet.add(new Date(item.lastActivityAt * 1000).getUTCFullYear());
				if (now - item.lastActivityAt * 1000 < recentCutoff) recentCount++;
			}
		}

		const syncDate = new Date(cache.lastSuccessfulSyncAt);
		const daysDiff = Math.floor((now - syncDate.getTime()) / 86400000);
		const syncLabel = daysDiff === 0 ? '今天' : `${daysDiff}天前`;

		const stats = parent.createDiv({ cls: 'weread-shelf__stats' });
		this.renderStatItem(stats, 'book-open', `${books} 本书`);
		this.renderStatItem(stats, 'pencil', `${notesCount} 个笔记`);
		this.renderStatItem(stats, 'calendar', `${yearSet.size} 年`);
		this.renderStatItem(stats, 'clock', syncLabel);
		this.renderStatItem(stats, 'refresh-cw', `${recentCount} 本`);
	}

	private renderStatItem(parent: HTMLElement, icon: string, text: string): void {
		const item = parent.createDiv({ cls: 'weread-shelf__stat-item' });
		const iconEl = item.createSpan({ cls: 'weread-shelf__stat-icon' });
		setIcon(iconEl, icon);
		item.createSpan({ text });
	}

	private renderControls(root: HTMLElement): void {
		const controls = root.createDiv({ cls: 'weread-shelf__controls' });
		const search = controls.createEl('input', {
			cls: 'weread-shelf__search',
			attr: { 'aria-label': '搜索书名或作者', placeholder: '搜索书名或作者' },
		});
		search.type = 'search';
		search.value = this.filters.query;
		this.searchEl = search;

		let composing = false;
		search.addEventListener('compositionstart', () => { composing = true; });
		search.addEventListener('compositionend', () => {
			composing = false;
			this.filters = { ...this.filters, query: search.value };
			this.renderContent();
		});
		search.addEventListener('input', () => {
			if (composing) return;
			this.filters = { ...this.filters, query: search.value };
			this.renderContent();
		});

		const filters = controls.createDiv({ cls: 'weread-shelf__filters' });
		this.renderFilterSelect(
			filters,
			'书籍类型',
			[
				{ value: 'all', label: '全部' },
				{ value: 'books', label: '仅图书' },
				{ value: 'grouped', label: '仅分组' },
			],
			this.filters.type,
			(type) => {
				this.filters = { ...this.filters, type };
				this.renderContent();
			},
		);
		this.renderFilterSelect(
			filters,
			'书籍状态',
			[
				{ value: 'all', label: '全部' },
				{ value: 'completed', label: '已读完' },
				{ value: 'inProgress', label: '在读' },
				{ value: 'unread', label: '未读' },
			],
			this.filters.status,
			(status) => {
				this.filters = { ...this.filters, status };
				this.renderContent();
			},
		);
		this.renderIconButton(controls, 'settings', '打开插件设置', () =>
			this.dependencies.openSettings(),
			'weread-shelf__settings-button',
		);
		this.renderIconButton(
			controls,
			FORCE_SYNC_ACTION.icon,
			FORCE_SYNC_ACTION.label,
			() => this.syncAndRender(),
			FORCE_SYNC_ACTION.className,
		);
	}

	private renderFilterSelect<T extends string>(
		parent: HTMLElement,
		labelText: string,
		options: ReadonlyArray<{ value: T; label: string }>,
		value: T,
		onChange: (value: T) => void,
	): void {
		const label = parent.createEl('label', { cls: 'weread-shelf__filter' });
		label.createSpan({ text: labelText });
		const select = label.createEl('select', {
			cls: 'weread-shelf__select',
			attr: { 'aria-label': labelText },
		});
		for (const option of options) {
			select.createEl('option', {
				text: option.label,
				attr: { value: option.value },
			});
		}
		select.value = value;
		select.addEventListener('change', () => {
			const selected = options.find((option) => option.value === select.value);
			if (selected !== undefined) {
				onChange(selected.value);
			}
		});
	}


	private renderGroups(root: HTMLElement, cache: ShelfCache): void {
		const groups = filterAndGroupShelf(
			cache.items,
			this.filters,
			this.dependencies.getNoteText(),
			cache.archives ?? [],
		);
		if (groups.length === 0) {
			root.createDiv({ cls: 'weread-shelf__empty', text: '没有匹配的书籍。' });
			return;
		}

		for (const group of groups) {
			const section = root.createDiv({ cls: 'weread-shelf__section' });
			const heading = this.filters.type === 'grouped'
				? group.label
				: /^\d{4}$/.test(group.key) ? `${group.label} 年` : group.label;
			section.createEl('h3', { text: heading });
			const grid = section.createDiv({ cls: 'weread-shelf__grid' });
			for (const item of group.items) {
				this.renderCard(grid, item);
			}
		}
	}

	private renderCard(grid: HTMLElement, item: ShelfItem): void {
		const card = grid.createDiv({ cls: 'weread-shelf__card' });

		const coverWrap = card.createDiv({ cls: 'weread-shelf__cover-wrap' });
		const cover = coverWrap.createEl('img', {
			cls: 'weread-shelf__cover',
			attr: { alt: '', src: item.coverUrl },
		});
		if (item.coverUrl === '') {
			cover.addClass('is-empty');
		}
		if (item.kind === 'audiobook') {
			const audioBadge = coverWrap.createDiv({ cls: 'weread-shelf__cover-badge weread-shelf__cover-badge--audio' });
			setIcon(audioBadge, 'headphones');
		}
		if (item.kind === 'book' && item.readingState === 'completed') {
			coverWrap.createDiv({ cls: 'weread-shelf__cover-badge weread-shelf__cover-badge--read', text: '已读' });
		}

		const info = card.createDiv({ cls: 'weread-shelf__info' });

		const titleRow = info.createDiv({ cls: 'weread-shelf__title-row' });
		titleRow.createSpan({ cls: 'weread-shelf__title', text: item.title });
		const actions = titleRow.createDiv({ cls: 'weread-shelf__actions' });
		this.renderIconButton(actions, 'pencil', '打开或创建笔记', () =>
			this.dependencies.openOrCreateNote(item),
		);
		this.renderIconButton(actions, 'book-open', '打开微信读书', () =>
			this.dependencies.openWeread(item),
		);

		info.createDiv({ cls: 'weread-shelf__author', text: item.author });

		const badges = info.createDiv({ cls: 'weread-shelf__badges' });
		if (this.dependencies.getNoteText().has(item.id)) {
			badges.createSpan({ cls: 'weread-shelf__badge weread-shelf__badge--synced', text: '已同步' });
		}
		badges.createSpan({ cls: 'weread-shelf__badge', text: item.kind === 'audiobook' ? '有声书' : '图书' });
		if (item.kind === 'book') {
			const stateLabel = item.readingState === 'completed' ? '读完'
				: item.readingState === 'inProgress' ? '在读' : '未读';
			badges.createSpan({ cls: 'weread-shelf__badge', text: stateLabel });
		}

		if (item.lastActivityAt && item.lastActivityAt > 0) {
			const date = new Intl.DateTimeFormat('en-CA', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			}).format(new Date(item.lastActivityAt * 1000));
			info.createDiv({ cls: 'weread-shelf__meta', text: `最近阅读 ${date}` });
		}
	}

	private renderIconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		action: () => void | Promise<void>,
		className?: string,
	): void {
		const button = parent.createEl('button', {
			cls: className === undefined ? 'clickable-icon' : `clickable-icon ${className}`,
			attr: { 'aria-label': label },
		});
		setIcon(button, icon);
		setTooltip(button, label);
		button.addEventListener('click', (event) => {
			event.stopPropagation();
			void Promise.resolve(action()).finally(() => this.refresh());
		});
	}

	private renderEmpty(root: HTMLElement): void {
		const empty = root.createDiv({ cls: 'weread-shelf__empty' });
		empty.createEl('p', { text: 'No cached shelf is available.' });
		const retry = empty.createEl('button', { text: 'Retry sync' });
		retry.addEventListener('click', () => {
			void this.syncAndRender();
		});
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
