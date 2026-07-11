import {
	ItemView,
	setIcon,
	setTooltip,
	type WorkspaceLeaf,
} from 'obsidian';
import type { ShelfSyncResult } from '../services/shelf-sync-service';
import type { WereadShelfSettings } from '../settings';
import type { ShelfCache, ShelfFilterState, ShelfItem } from '../types';
import {
	filterAndGroupShelf,
	formatActivityLabel,
} from '../utils/shelf-state';

export const SHELF_VIEW_TYPE = 'weread-shelf-view';

export interface ShelfViewDependencies {
	getCache(): Promise<ShelfCache | null>;
	getSettings(): WereadShelfSettings;
	getNoteText(): ReadonlyMap<string, string>;
	syncShelf(): Promise<ShelfSyncResult>;
	openWeread(item: ShelfItem): Promise<void>;
	openOrCreateNote(item: ShelfItem): Promise<void>;
	syncBookNotes(item: ShelfItem): Promise<void>;
}

export class ShelfView extends ItemView {
	private filters: ShelfFilterState = {
		query: '',
		type: 'all',
		status: 'active',
		sort: 'activity',
	};
	private cache: ShelfCache | null = null;

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
		return 'WeRead shelf';
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async refresh(): Promise<void> {
		this.filters = { ...this.filters, sort: this.dependencies.getSettings().sort };
		this.cache = await this.dependencies.getCache();
		if (this.cache === null) {
			await this.tryInitialRefresh();
		}
		this.render();
	}

	private async tryInitialRefresh(): Promise<void> {
		try {
			this.cache = (await this.dependencies.syncShelf()).cache;
		} catch {
			this.cache = null;
		}
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('weread-shelf');

		const header = root.createDiv({ cls: 'weread-shelf__header' });
		header.createEl('h2', { text: 'WeRead shelf' });
		const syncButton = header.createEl('button', {
			cls: 'clickable-icon weread-shelf__sync',
			attr: { 'aria-label': 'Sync shelf' },
		});
		setIcon(syncButton, 'refresh-cw');
		setTooltip(syncButton, 'Sync shelf');
		syncButton.addEventListener('click', () => {
			void this.syncAndRender();
		});

		if (this.cache === null) {
			this.renderEmpty(root);
			return;
		}

		this.renderStats(root, this.cache);
		this.renderControls(root);
		this.renderGroups(root, this.cache);
	}

	private async syncAndRender(): Promise<void> {
		try {
			this.cache = (await this.dependencies.syncShelf()).cache;
		} finally {
			this.render();
		}
	}

	private renderStats(root: HTMLElement, cache: ShelfCache): void {
		const books = cache.items.filter((item) => item.kind === 'book').length;
		const audiobooks = cache.items.filter((item) => item.kind === 'audiobook').length;
		const stats = root.createDiv({ cls: 'weread-shelf__stats' });
		stats.createSpan({ text: `${books} books` });
		stats.createSpan({ text: `${audiobooks} audiobooks` });
		stats.createSpan({
			text: `Last synced ${new Date(cache.lastSuccessfulSyncAt).toLocaleString()}`,
		});
	}

	private renderControls(root: HTMLElement): void {
		const controls = root.createDiv({ cls: 'weread-shelf__controls' });
		const search = controls.createEl('input', {
			cls: 'weread-shelf__search',
			attr: { 'aria-label': 'Search shelf', placeholder: 'Search shelf' },
		});
		search.type = 'search';
		search.value = this.filters.query;
		search.addEventListener('input', () => {
			this.filters = { ...this.filters, query: search.value };
			this.render();
		});

		const filters = controls.createDiv({ cls: 'weread-shelf__filters' });
		this.renderSegment(filters, 'type', [
			['all', 'All'],
			['books', 'Books'],
			['audiobooks', 'Audiobooks'],
		]);
		this.renderSegment(filters, 'status', [
			['active', 'Active'],
			['all', 'All'],
			['inProgress', 'In progress'],
			['unread', 'Unread'],
			['completed', 'Completed'],
		]);
	}

	private renderSegment(
		parent: HTMLElement,
		key: 'type' | 'status',
		options: Array<[ShelfFilterState[typeof key], string]>,
	): void {
		const segment = parent.createDiv({ cls: 'weread-shelf__segment' });
		for (const [value, label] of options) {
			const button = segment.createEl('button', { text: label });
			button.toggleClass('is-active', this.filters[key] === value);
			button.addEventListener('click', () => {
				this.filters = { ...this.filters, [key]: value };
				this.render();
			});
		}
	}

	private renderGroups(root: HTMLElement, cache: ShelfCache): void {
		const groups = filterAndGroupShelf(cache.items, this.filters, this.dependencies.getNoteText());
		if (groups.length === 0) {
			root.createDiv({ cls: 'weread-shelf__empty', text: 'No matching books.' });
			return;
		}

		for (const group of groups) {
			const section = root.createDiv({ cls: 'weread-shelf__section' });
			section.createEl('h3', { text: group.label });
			const grid = section.createDiv({ cls: 'weread-shelf__grid' });
			for (const item of group.items) {
				this.renderCard(grid, item);
			}
		}
	}

	private renderCard(grid: HTMLElement, item: ShelfItem): void {
		const card = grid.createDiv({ cls: 'weread-shelf__card' });
		const cover = card.createEl('img', {
			cls: 'weread-shelf__cover',
			attr: { alt: '', src: item.coverUrl },
		});
		if (item.coverUrl === '') {
			cover.addClass('is-empty');
		}

		const actions = card.createDiv({ cls: 'weread-shelf__actions' });
		this.renderIconButton(actions, 'external-link', 'Open WeRead', () =>
			this.dependencies.openWeread(item),
		);
		this.renderIconButton(actions, 'file-plus', 'Open or create note', () =>
			this.dependencies.openOrCreateNote(item),
		);
		this.renderIconButton(actions, 'download', 'Sync notes', () =>
			this.dependencies.syncBookNotes(item),
		);

		const body = card.createDiv({ cls: 'weread-shelf__body' });
		body.createDiv({ cls: 'weread-shelf__title', text: item.title });
		body.createDiv({ cls: 'weread-shelf__author', text: item.author });
		body.createDiv({ cls: 'weread-shelf__meta', text: formatActivityLabel(item) });

		const badges = body.createDiv({ cls: 'weread-shelf__badges' });
		badges.createSpan({
			cls: 'weread-shelf__badge',
			text: item.kind === 'book' ? item.readingState : item.listeningState,
		});
		if (this.dependencies.getNoteText().has(item.id)) {
			badges.createSpan({ cls: 'weread-shelf__badge', text: 'Local note' });
		}
		if (item.kind === 'book' && item.readingState === 'completed') {
			badges.createSpan({ cls: 'weread-shelf__badge', text: 'Completed' });
		}
		if (item.kind === 'audiobook' && item.hasUnreadUpdate) {
			badges.createSpan({ cls: 'weread-shelf__badge weread-shelf__badge--update', text: 'Update' });
		}
	}

	private renderIconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		action: () => Promise<void>,
	): void {
		const button = parent.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': label },
		});
		setIcon(button, icon);
		setTooltip(button, label);
		button.addEventListener('click', (event) => {
			event.stopPropagation();
			void action().finally(() => this.refresh());
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
