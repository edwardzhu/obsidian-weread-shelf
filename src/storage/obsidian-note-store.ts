import { App, TAbstractFile, TFile, TFolder } from 'obsidian';

export interface StoredNote {
	path: string;
	content: string;
	frontmatter: Record<string, unknown>;
}

export interface NoteStore {
	listMarkdown(folder: string): Promise<StoredNote[]>;
	read(path: string): Promise<StoredNote | null>;
	create(path: string, content: string): Promise<StoredNote>;
	modify(path: string, content: string): Promise<void>;
	setFrontmatter(path: string, values: Record<string, string>): Promise<void>;
}

export class ObsidianNoteStore implements NoteStore {
	constructor(private readonly app: App) {}

	async listMarkdown(folder: string): Promise<StoredNote[]> {
		const root = this.app.vault.getAbstractFileByPath(folder);
		if (!(root instanceof TFolder)) {
			return [];
		}
		const files = this.collectMarkdown(root.children);
		return Promise.all(files.map((file) => this.toStoredNote(file)));
	}

	async read(path: string): Promise<StoredNote | null> {
		const abstract = this.app.vault.getAbstractFileByPath(path);
		return abstract instanceof TFile && abstract.extension === 'md'
			? this.toStoredNote(abstract)
			: null;
	}

	async create(path: string, content: string): Promise<StoredNote> {
		return this.toStoredNote(await this.app.vault.create(path, content));
	}

	async modify(path: string, content: string): Promise<void> {
		const note = await this.read(path);
		if (note === null) {
			throw new Error(`Missing note: ${path}`);
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			throw new Error(`Missing note file: ${path}`);
		}
		await this.app.vault.modify(file, content);
	}

	async setFrontmatter(path: string, values: Record<string, string>): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			throw new Error(`Missing note file: ${path}`);
		}
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			Object.assign(frontmatter, values);
		});
	}

	private collectMarkdown(children: TAbstractFile[]): TFile[] {
		return children.flatMap((child) => {
			if (child instanceof TFile) {
				return child.extension === 'md' ? [child] : [];
			}
			return child instanceof TFolder ? this.collectMarkdown(child.children) : [];
		});
	}

	private async toStoredNote(file: TFile): Promise<StoredNote> {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		return { path: file.path, content: await this.app.vault.read(file), frontmatter };
	}
}
