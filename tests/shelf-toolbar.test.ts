import { describe, expect, it } from 'vitest';
import { FORCE_SYNC_ACTION } from '../src/ui/shelf-toolbar';

describe('shelf toolbar', () => {
	it('defines the forced refresh action with the sync icon', () => {
		expect(FORCE_SYNC_ACTION).toEqual({
			icon: 'sync',
			label: '强制刷新书架',
		});
	});
});
