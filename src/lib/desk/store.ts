"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_DESK, normalizeDesk, type DeskState } from "./model";

/** The desk, stored only in this visitor's browser. */
export const DESK_KEY = "wv-desk-v1";
const EVENT = "wv-desk-change";

/**
 * Turns the stored text into the desk, handing back the very same object while the text hasn't changed (a store that returns a
 * new object every read makes React re-render forever). Anything that doesn't parse is the default desk.
 */
export function makeSnapshotReader(read: () => string | null): () => DeskState {
	let lastRaw: string | null | undefined;
	let last: DeskState = DEFAULT_DESK;
	return () => {
		const raw = read();
		if (raw === lastRaw) return last;
		lastRaw = raw;
		try {
			last = raw ? normalizeDesk(JSON.parse(raw)) : DEFAULT_DESK;
		} catch {
			last = DEFAULT_DESK;
		}
		return last;
	};
}

// If storage is blocked (a private window, a full disk) the desk still works for this visit, held in memory.
let memoryRaw: string | null = null;

function readRaw(): string | null {
	try {
		return window.localStorage.getItem(DESK_KEY) ?? memoryRaw;
	} catch {
		return memoryRaw;
	}
}

function writeDesk(next: DeskState) {
	const raw = JSON.stringify(next);
	memoryRaw = raw;
	try {
		window.localStorage.setItem(DESK_KEY, raw);
	} catch {
		/* storage unavailable: the desk lives in memory until the page is closed */
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
const serverSnapshot = () => DEFAULT_DESK;

/** The visitor's desk and the ways to change it. Every change is cleaned (`normalizeDesk`) before it is saved. */
export function useDesk() {
	const desk = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
	const update = useCallback((change: (current: DeskState) => DeskState) => {
		writeDesk(normalizeDesk(change(snapshot())));
	}, []);
	const reset = useCallback(() => {
		memoryRaw = null;
		try {
			window.localStorage.removeItem(DESK_KEY);
		} catch {
			/* nothing to remove */
		}
		window.dispatchEvent(new Event(EVENT));
	}, []);
	return { desk, update, reset };
}

const subscribeNever = () => () => {};

/**
 * False while the page is rendering on the server and during hydration, true once it is running in the browser. The desk is
 * drawn from what is saved in this browser, which the server can't know, so screens built from it wait for this and show a
 * placeholder first (instead of flashing the default desk, or disagreeing with the server's HTML).
 */
export function useMounted(): boolean {
	return useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false,
	);
}

const tickEvery = (callback: () => void) => {
	const timer = window.setInterval(callback, 1000);
	return () => window.clearInterval(timer);
};

/** The current time in whole seconds since 1970, updating once a second: for the clock. 0 on the server. */
export function useSecondTick(): number {
	return useSyncExternalStore(
		tickEvery,
		() => Math.floor(Date.now() / 1000),
		() => 0,
	);
}
