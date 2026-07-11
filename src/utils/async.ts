export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	map: (item: T) => Promise<R>,
): Promise<R[]> {
	if (limit < 1) {
		throw new Error('Concurrency limit must be at least 1');
	}

	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(limit, items.length);

	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < items.length) {
				const currentIndex = nextIndex;
				nextIndex += 1;
				results[currentIndex] = await map(items[currentIndex] as T);
			}
		}),
	);

	return results;
}
