"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** Wishlist of product slugs (in the order they were saved), stored only in this browser. */
const KEY = "wv-wishlist-v1";
const EVENT = "wv-wishlist-change";

function readRaw(): string {
	try {
		return window.localStorage.getItem(KEY) ?? "[]";
	} catch {
		return "[]";
	}
}

function write(slugs: string[]) {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(slugs));
	} catch {
		/* storage unavailable — the list just won't persist */
	}
	window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
	window.addEventListener(EVENT, cb);
	window.addEventListener("storage", cb);
	return () => {
		window.removeEventListener(EVENT, cb);
		window.removeEventListener("storage", cb);
	};
}

function parse(raw: string): string[] {
	try {
		const v = JSON.parse(raw) as unknown;
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
	} catch {
		return [];
	}
}

export function useWishlist() {
	const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
	const slugs = useMemo(() => parse(raw), [raw]);

	const has = useCallback((slug: string) => slugs.includes(slug), [slugs]);
	const add = useCallback((list: string[]) => write([...new Set([...parse(readRaw()), ...list])]), []);
	const remove = useCallback(
		(list: string[]) => write(parse(readRaw()).filter((s) => !list.includes(s))),
		[],
	);
	const toggle = useCallback((slug: string) => {
		const cur = parse(readRaw());
		write(cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]);
	}, []);
	const clear = useCallback(() => write([]), []);

	return { slugs, count: slugs.length, has, add, remove, toggle, clear };
}
