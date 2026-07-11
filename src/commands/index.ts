import type WereadShelfPlugin from '../main';

export function registerCommands(plugin: WereadShelfPlugin): void {
	plugin.addCommand({
		id: 'open-weread-shelf',
		name: 'Open WeRead shelf',
		callback: () => {
			void plugin.openShelfView();
		},
	});
	plugin.addCommand({
		id: 'sync-weread-shelf',
		name: 'Sync WeRead shelf',
		callback: () => {
			void plugin.syncShelfFromCommand();
		},
	});
	plugin.addCommand({
		id: 'sync-all-weread-notes',
		name: 'Sync all WeRead notes',
		callback: () => {
			void plugin.syncAllNotesFromCommand();
		},
	});
}
