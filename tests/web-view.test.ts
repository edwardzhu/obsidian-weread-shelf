import { describe, expect, it } from 'vitest';
import { WereadWebView } from '../src/views/web-view';

describe('WereadWebView', () => {
	it('uses a bookshelf icon for the WeRead tab', () => {
		const view = new WereadWebView({} as never);

		expect(view.getIcon()).toBe('library');
	});
});
