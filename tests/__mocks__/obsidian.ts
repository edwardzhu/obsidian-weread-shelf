import { vi } from 'vitest';

export class App {}
export class Plugin {
	constructor(
		public readonly app: unknown,
		public readonly manifest: unknown,
	) {}

	addCommand(command: unknown): unknown { return command; }
	addRibbonIcon(): unknown { return { addClass() {} }; }
	addSettingTab(): void {}
	registerView(): void {}
	registerEvent(): void {}
	registerDomEvent(): void {}
	registerInterval(): void {}
	register(): void {}
	async loadData(): Promise<unknown> { return null; }
	async saveData(): Promise<void> {}
}
export class ItemView {
	contentEl = {} as HTMLElement;

	constructor(public readonly leaf: unknown) {}
}
export class PluginSettingTab {
	containerEl = { empty() {}, createEl() {} };
}
export class Notice {
	constructor(public readonly message: string) {}
}
export class Modal {
	contentEl = { empty() {} };

	constructor(public readonly app: unknown) {}

	open(): void {
		this.onOpen();
	}

	close(): void {
		this.onClose();
	}

	onOpen(): void {}

	onClose(): void {}
}

class MockSettingButton {
	text = '';
	private callback: (() => void) | null = null;

	setButtonText(text: string): this {
		this.text = text;
		return this;
	}

	onClick(callback: () => void): this {
		this.callback = callback;
		return this;
	}

	click(): void {
		this.callback?.();
	}
}

export class Setting {
	static instances: Setting[] = [];
	name = '';
	buttonText = '';
	readonly button = new MockSettingButton();

	constructor() {
		Setting.instances.push(this);
	}

	setName(name: string) { this.name = name; return this; }
	setDesc() { return this; }
	addText() { return this; }
	addButton(callback: (button: MockSettingButton) => void) {
		callback(this.button);
		this.buttonText = this.button.text;
		return this;
	}
	addDropdown() { return this; }
	controlEl = { createEl() { return { addEventListener() {} }; } };
}
export class FuzzySuggestModal {
	app: unknown;
	constructor(app: unknown) { this.app = app; }
	setPlaceholder() {}
	open() {}
	onClose() {}
}
export class TAbstractFile {
	path = '';
}
export class TFile extends TAbstractFile {
	extension = 'md';
}
export class TFolder extends TAbstractFile {
	path = '/';
	children: unknown[] = [];
}
export function setIcon() {}
export function setTooltip() {}
export const requestUrl = vi.fn().mockResolvedValue({ status: 200, json: {} });
