"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { shouldStartProgress } from "@/lib/motion/nav-progress";
import { isRevealable, planReveal, staggerDelay, type RevealMode } from "@/lib/motion/reveal-plan";

/**
 * Site-wide motion for the Worldwide Vapor pages (everything under the `(root)` layout), in one place instead of a
 * wrapper on every page. Renders only the thin progress bar; the rest works on the DOM:
 *
 * - **Scroll reveal.** Every block after the page header, every card (`<article>`) and anything marked
 *   `data-motion="reveal"` fades up as it is scrolled to; blocks that appear together cascade. Mark something
 *   `data-no-reveal` to keep it out. The styles live in `src/styles/motion.css` (`[data-reveal]`).
 * - **Entrance on navigation.** Following a link plays the same fade-up for what is on screen. The first load of a page
 *   does not: the server has already painted it, and hiding it now would make it flash.
 * - **Progress bar.** A thin bar along the top while a page loads, since these routes have no loading screen. If the load takes
 *   more than a moment, the current page also eases back (its blocks get `data-leaving`) until the next one arrives.
 *
 * Nothing here can leave content hidden for good: reduced-motion visitors get none of it (the hidden state is only
 * defined for `prefers-reduced-motion: no-preference`, and the observer is not even started), a safety check reveals
 * anything on screen that the observer missed, and a browser without IntersectionObserver is left alone.
 */

/** Page blocks (siblings after the header marked in `WvHeader`), cards, and explicit opt-ins. */
const CANDIDATES = '[data-wv-header] ~ *:not(footer), article, [data-motion="reveal"]';
const IGNORED_TAGS = new Set([
	"SCRIPT",
	"STYLE",
	"LINK",
	"TEMPLATE",
	"NOSCRIPT",
	"IFRAME",
	"FOOTER",
	"HEADER",
]);
/** How long each mode lasts after it starts, then everything counts as "idle". */
const INITIAL_WINDOW_MS = 1500;
const NAVIGATION_WINDOW_MS = 900;
/** The reveal transition is 650ms plus up to five 70ms steps; past this it is surely finished. */
const CLEANUP_AFTER_MS = 1800;
/**
 * Elements the server sent that React has not hydrated yet must not be touched: React compares them with what it
 * renders and reports any attribute it did not put there. It marks hydrated elements with a `__reactFiber$…` property, so
 * wait for that (re-checking every 150ms), and give up waiting after a few seconds.
 */
const HYDRATION_RECHECK_MS = 150;
const HYDRATION_WAIT_MS = 4000;
const isHydrated = (el: Element) => Object.keys(el).some((key) => key.startsWith("__reactFiber$"));

/** How long a navigation has to take before the current page eases back (quicker ones never flicker). */
const LEAVE_AFTER_MS = 90;

/** How often to check for something on screen that is still hidden, in case the observer never reported it. */
const SAFETY_CHECK_MS = 2500;

export function PageMotion() {
	const pathname = usePathname();
	const barRef = useRef<HTMLDivElement>(null);
	const mode = useRef<RevealMode>("initial");
	const modeTimer = useRef<number | undefined>(undefined);
	const progressTimer = useRef<number | undefined>(undefined);
	const progressActive = useRef(false);
	const leaveTimer = useRef<number | undefined>(undefined);
	const firstPath = useRef(pathname);

	// The page easing back while the next one loads: the blocks on screen get `data-leaving` (styled in motion.css). Only the
	// old blocks are marked, so the new page's blocks never inherit it.
	const stopLeaving = useCallback(() => {
		window.clearTimeout(leaveTimer.current);
		document.querySelectorAll("[data-leaving]").forEach((el) => el.removeAttribute("data-leaving"));
	}, []);

	const finishProgress = useCallback(() => {
		stopLeaving();
		const bar = barRef.current;
		if (!bar || !progressActive.current) return;
		progressActive.current = false;
		window.clearTimeout(progressTimer.current);
		bar.style.transition = "transform 180ms ease-out";
		bar.style.transform = "scaleX(1)";
		progressTimer.current = window.setTimeout(() => {
			bar.style.transition = "opacity 220ms ease-out";
			bar.style.opacity = "0";
		}, 200);
	}, [stopLeaving]);

	// A new page arrived: what is on screen now is unpainted, so it can play its entrance without flashing.
	// (A layout effect, so it runs in the same commit as the new page, before the observer below reacts to it.)
	useLayoutEffect(() => {
		finishProgress();
		if (pathname === firstPath.current) return;
		firstPath.current = pathname;
		mode.current = "navigation";
		window.clearTimeout(modeTimer.current);
		modeTimer.current = window.setTimeout(() => {
			mode.current = "idle";
		}, NAVIGATION_WINDOW_MS);
	}, [pathname, finishProgress]);

	useEffect(() => {
		modeTimer.current = window.setTimeout(() => {
			if (mode.current === "initial") mode.current = "idle";
		}, INITIAL_WINDOW_MS);

		const start = () => {
			const bar = barRef.current;
			if (!bar) return;
			window.clearTimeout(progressTimer.current);
			progressActive.current = true;
			bar.style.transition = "none";
			bar.style.opacity = "1";
			bar.style.transform = "scaleX(0.04)";
			void bar.offsetWidth;
			bar.style.transition = "transform 9s cubic-bezier(0.1, 0.5, 0.2, 1)";
			bar.style.transform = "scaleX(0.85)";
			// If the page never arrives, don't leave the bar hanging.
			progressTimer.current = window.setTimeout(finishProgress, 15000);
			window.clearTimeout(leaveTimer.current);
			leaveTimer.current = window.setTimeout(() => {
				document
					.querySelectorAll("[data-wv-header] ~ *:not(footer)")
					.forEach((el) => el.setAttribute("data-leaving", ""));
			}, LEAVE_AFTER_MS);
		};
		const onClick = (event: MouseEvent) => {
			const anchor = event.target instanceof Element ? event.target.closest("a") : null;
			const link =
				anchor instanceof HTMLAnchorElement
					? { href: anchor.href, target: anchor.target, download: anchor.hasAttribute("download") }
					: null;
			if (shouldStartProgress(event, link, { origin: location.origin, pathname: location.pathname })) start();
		};
		// Capture phase: runs before Next's own click handler, which cancels the browser's default.
		document.addEventListener("click", onClick, true);
		// Coming back to this page from the browser's back/forward cache must not leave it dimmed.
		window.addEventListener("pageshow", stopLeaving);

		const cleanupTimers: number[] = [];
		const seen = new WeakSet<Element>();
		const startedAt = Date.now();
		const unhydrated = new Set<Element>();
		let recheckTimer: number | undefined;
		let observer: IntersectionObserver | undefined;
		let mutations: MutationObserver | undefined;
		let safetyTimer: number | undefined;

		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if ("IntersectionObserver" in window && !reducedMotion) {
			const settle = (el: Element) => {
				el.removeAttribute("data-reveal");
				(el as HTMLElement).style.removeProperty("--reveal-delay");
			};
			const reveal = (el: Element, delay: number) => {
				if (el.getAttribute("data-reveal") !== "out") return;
				(el as HTMLElement).style.setProperty("--reveal-delay", `${delay}ms`);
				el.setAttribute("data-reveal", "in");
				cleanupTimers.push(window.setTimeout(() => settle(el), delay + CLEANUP_AFTER_MS));
			};

			observer = new IntersectionObserver(
				(entries) => {
					const visible = entries
						.filter((e) => e.isIntersecting)
						.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
					visible.forEach((entry, i) => {
						observer?.unobserve(entry.target);
						reveal(entry.target, staggerDelay(i));
					});
				},
				// Reveal a little before something reaches the bottom edge, so it is already moving as it arrives.
				{ rootMargin: "0px 0px -8% 0px" },
			);

			const process = (nodes: Element[]) => {
				const entering: Element[] = [];
				for (const el of nodes) {
					if (seen.has(el) || IGNORED_TAGS.has(el.tagName)) continue;
					if (!isHydrated(el) && Date.now() - startedAt < HYDRATION_WAIT_MS) {
						unhydrated.add(el);
						continue;
					}
					seen.add(el);
					unhydrated.delete(el);
					if (el.closest("[data-no-reveal]") || el.hasAttribute("data-reveal")) continue;
					const style = getComputedStyle(el);
					const rect = el.getBoundingClientRect();
					if (!isRevealable(style, rect.height)) continue;
					const plan = planReveal(rect, window.innerHeight, mode.current);
					if (plan === "skip") continue;
					el.setAttribute("data-reveal", "out");
					if (plan === "scroll") observer?.observe(el);
					else entering.push(el);
				}
				if (unhydrated.size > 0 && recheckTimer === undefined) {
					recheckTimer = window.setTimeout(() => {
						recheckTimer = undefined;
						process([...unhydrated]);
					}, HYDRATION_RECHECK_MS);
				}
				if (entering.length === 0) return;
				// Commit the hidden state, then release it in the same frame so it animates from there.
				void document.body.offsetWidth;
				entering.forEach((el, i) => reveal(el, staggerDelay(i)));
			};

			const collect = (root: ParentNode): Element[] => {
				const found: Element[] = [];
				if (root instanceof Element && root.matches(CANDIDATES)) found.push(root);
				found.push(...root.querySelectorAll(CANDIDATES));
				return found;
			};

			process(collect(document));

			// Pages stream in and update after the first render; catch what is added before it can be painted.
			mutations = new MutationObserver((records) => {
				const added: Element[] = [];
				for (const record of records) {
					record.addedNodes.forEach((node) => {
						if (node instanceof Element) added.push(...collect(node));
					});
				}
				if (added.length) process(added);
			});
			mutations.observe(document.body, { childList: true, subtree: true });

			// Only things already on screen: anything still below the fold is meant to wait for its scroll.
			safetyTimer = window.setInterval(() => {
				document.querySelectorAll('[data-reveal="out"]').forEach((el) => {
					const { top, bottom } = el.getBoundingClientRect();
					if (top >= window.innerHeight || bottom <= 0) return;
					observer?.unobserve(el);
					reveal(el, 0);
				});
			}, SAFETY_CHECK_MS);
		}

		return () => {
			document.removeEventListener("click", onClick, true);
			window.removeEventListener("pageshow", stopLeaving);
			stopLeaving();
			observer?.disconnect();
			mutations?.disconnect();
			window.clearTimeout(modeTimer.current);
			window.clearTimeout(progressTimer.current);
			window.clearTimeout(recheckTimer);
			window.clearInterval(safetyTimer);
			cleanupTimers.forEach((t) => window.clearTimeout(t));
			// Don't strand anything hidden if this unmounts (e.g. hot reload).
			document.querySelectorAll("[data-reveal]").forEach((el) => {
				el.removeAttribute("data-reveal");
				(el as HTMLElement).style.removeProperty("--reveal-delay");
			});
		};
	}, [finishProgress, stopLeaving]);

	return <div ref={barRef} aria-hidden className="wv-nav-progress" />;
}
