import type WereadShelfPlugin from '../main';

export function registerCommands(plugin: WereadShelfPlugin): void {
	plugin.addCommand({
		id: 'open-weread-shelf',
		name: 'Weread Shelf: Open WeRead shelf',
		callback: () => {
			void plugin.openShelfView();
		},
	});
	plugin.addCommand({
		id: 'sync-weread-shelf',
		name: 'Weread Shelf: Sync WeRead shelf',
		callback: () => {
			void plugin.syncShelfFromCommand();
		},
	});
	plugin.addCommand({
		id: 'sync-all-weread-notes',
		name: 'Weread Shelf: Sync all WeRead notes',
		callback: () => {
			void plugin.syncAllNotesFromCommand();
		},
	});
}
