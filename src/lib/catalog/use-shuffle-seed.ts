import { useSyncExternalStore } from "react";

// The shop and the home page's collections both shuffle with this seed, so they show the same order within a visit.
// The server render uses a fixed seed so hydration matches; in the browser each page load picks its own, so every
// visit gets a fresh order (see shuffle.ts). Navigating between pages keeps it, which keeps the two in step.
let pageSeed: number | undefined;
const subscribeNever = () => () => {};
const getPageSeed = () => {
	if (pageSeed === undefined) pageSeed = 1 + Math.floor(Math.random() * 0x7fffffff);
	return pageSeed;
};
const getServerSeed = () => 0;

/** The seed for this page load (0 while rendering on the server). Client components only. */
export function useShuffleSeed(): number {
	return useSyncExternalStore(subscribeNever, getPageSeed, getServerSeed);
}
