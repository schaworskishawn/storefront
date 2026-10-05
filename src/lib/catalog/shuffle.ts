/**
 * Seeded shuffle for the shop's "random" sorts.
 *
 * Each product gets a rank that depends only on the seed and its own key (its slug), so the same seed always
 * gives the same order — it stays put while the shopper filters or pages — and a new seed gives a new order.
 * Sorting by `shuffleRank(seed, key)` is a shuffle of whatever subset is being shown, with no state to keep.
 */
export function shuffleRank(seed: number, key: string): number {
	// FNV-1a over the key, started from the seed, then an avalanche step so neighbouring keys don't stay neighbours.
	let h = (2166136261 ^ seed) >>> 0;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	h ^= h >>> 16;
	h = Math.imul(h, 2246822507);
	h ^= h >>> 13;
	h = Math.imul(h, 3266489909);
	h ^= h >>> 16;
	return h >>> 0;
}

/** Comparator that puts items in the seed's random order. */
export function byShuffle<T>(seed: number, keyOf: (item: T) => string): (a: T, b: T) => number {
	return (a, b) => shuffleRank(seed, keyOf(a)) - shuffleRank(seed, keyOf(b));
}
