export class PluginRuntime {
	constructor(
		private readonly getApiKey: () => string,
		private readonly syncShelf: () => Promise<unknown>,
		private readonly syncNotes: () => Promise<unknown>,
		private readonly refreshViews: () => Promise<unknown> = async () => {},
	) {}

	async start(): Promise<void> {
		if (this.getApiKey().trim() !== '') {
			await this.syncShelf();
			await this.refreshViews();
		}
	}
}
