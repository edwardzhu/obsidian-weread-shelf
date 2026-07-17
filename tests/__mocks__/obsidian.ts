import { vi } from 'vitest';

export class App {}
export class Plugin {}
export class PluginSettingTab {
	containerEl = { empty() {}, createEl() {} };
}
export class Notice {
	constructor(public readonly message: string) {}
}
export class Setting {
	setName() { return this; }
	setDesc() { return this; }
	addText() { return this; }
	addButton() { return this; }
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
export class TFolder {
	path = '/';
	children: unknown[] = [];
}
export function setIcon() {}
export const requestUrl = vi.fn().mockResolvedValue({ status: 200, json: {} });
