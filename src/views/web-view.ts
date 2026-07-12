import { ItemView, type WorkspaceLeaf } from 'obsidian';

export const WEREAD_WEB_VIEW_TYPE = 'weread-web-view';

export class WereadWebView extends ItemView {
	private url = '';

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return WEREAD_WEB_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '微信读书';
	}

	getIcon(): string {
		return 'book-open';
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	getState(): Record<string, unknown> {
		return { url: this.url };
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		if (typeof state.url === 'string') {
			this.url = state.url;
		}
		this.render();
		await super.setState(state, { history: false });
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('weread-web-view');

		if (this.url === '') {
			root.createEl('p', { text: '没有可显示的链接。' });
			return;
		}

		const webview = document.createElement('webview') as HTMLElement;
		webview.setAttribute('src', this.url);
		webview.setAttribute('allowpopups', '');
		webview.addClass('weread-web-view__frame');
		root.appendChild(webview);
	}
}
