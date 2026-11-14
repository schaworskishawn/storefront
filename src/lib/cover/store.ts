"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_PROFILE, normalizeProfile, type Profile } from "./model";

/** The cover, stored only in this visitor's browser. */
export const COVER_KEY = "wv-cover-v1";
const EVENT = "wv-cover-change";

/**
 * Turns the stored text into the cover, handing back the very same object while the text hasn't changed (a store that returns a
 * new object every read makes React re-render forever). Anything that doesn't parse is the default cover.
 */
export function makeSnapshotReader(read: () => string | null): () => Profile {
	let lastRaw: string | null | undefined;
	let last: Profile = DEFAULT_PROFILE;
	return () => {
		const raw = read();
		if (raw === lastRaw) return last;
		lastRaw = raw;
		try {
			last = raw ? normalizeProfile(JSON.parse(raw)) : DEFAULT_PROFILE;
		} catch {
			last = DEFAULT_PROFILE;
		}
		return last;
	};
}

// If storage is blocked (a private window, a full disk) the cover still works for this visit, held in memory.
let memoryRaw: string | null = null;

function readRaw(): string | null {
	try {
		return window.localStorage.getItem(COVER_KEY) ?? memoryRaw;
	} catch {
		return memoryRaw;
	}
}

function writeProfile(next: Profile) {
	const raw = JSON.stringify(next);
	memoryRaw = raw;
	try {
		window.localStorage.setItem(COVER_KEY, raw);
	} catch {
		/* storage unavailable: the cover lives in memory until the page is closed */
	}
	window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
	window.addEventListener(EVENT, callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener(EVENT, callback);
		window.removeEventListener("storage", callback);
	};
}

const snapshot = makeSnapshotReader(readRaw);
const serverSnapshot = () => DEFAULT_PROFILE;

/** The visitor's cover and the way to change it. Every change is cleaned (`normalizeProfile`) before it is saved. */
export function useCover() {
	const profile = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
	const update = useCallback((patch: Partial<Profile>) => {
		writeProfile(normalizeProfile({ ...snapshot(), ...patch }));
	}, []);
	return { profile, update };
}

const subscribeNever = () => () => {};

/**
 * False while the page is rendering on the server and during hydration, true once it is running in the browser. The cover is
 * drawn from what is saved in this browser, which the server can't know, so it waits for this and shows a placeholder first
 * (instead of flashing the default cover, or disagreeing with the server's HTML).
 */
export function useMounted(): boolean {
	return useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false,
	);
}
