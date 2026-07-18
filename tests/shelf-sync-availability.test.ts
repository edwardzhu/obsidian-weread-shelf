import { describe, expect, it } from 'vitest';
import { hasConfiguredApiKey } from '../src/utils/shelf-sync-availability';

describe('shelf sync availability', () => {
	it('rejects blank API keys before starting a shelf sync', () => {
		expect(hasConfiguredApiKey('')).toBe(false);
		expect(hasConfiguredApiKey('   ')).toBe(false);
	});

	it('accepts a configured API key', () => {
		expect(hasConfiguredApiKey(' wrk-test ')).toBe(true);
	});
});
