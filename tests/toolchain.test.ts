import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
	it('executes Vitest in the Node environment', () => {
		expect(typeof globalThis.fetch).toBe('function');
	});
});
