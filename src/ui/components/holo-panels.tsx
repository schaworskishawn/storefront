"use client";

import { useEffect } from "react";
import { colorAlpha, holoMode, holoPointer, type HoloMode, type PanelFacts } from "@/lib/motion/holo";
import { isHydrated } from "@/lib/motion/is-hydrated";

/**
 * Holographic hover panels for every page under the `(root)` layout: with a mouse over a card, an iridescent foil and glare
 * that follow the pointer shimmer over it, with a neon edge, faint scanlines, and (for panels of a card's size) a slight tilt
 * toward the pointer. Renders nothing; the look is in `src/styles/holo.css`.
 *
 * Panels are found by how they look (see `holoMode`), so nothing has to be tagged: a rounded, bordered or shadowed, solidly
 * filled box of a card's size under the pointer. The innermost one wins, so a card inside a bigger panel lights up, not
 * the bigger one. Mark something `data-no-holo` to keep it (and everything in it) out.
 *
 * It only runs for a real mouse and never for reduced motion, waits for React to hydrate an element before touching it, and
 * ignores the pointer while a button is held (dragging the brand carousel, a slider).
 */

/** How long a panel takes to settle back after the pointer leaves, before its marks are cleared. */
const SETTLE_MS = 450;
/** How long a decision about an element is trusted: panels resize with the window, but not from one mouse move to the next. */
const DECISION_TTL_MS = 800;
/** How many ancestors to try, innermost first, before giving up on finding a panel. */
const MAX_DEPTH = 10;

const VARS = ["--holo-x", "--holo-y", "--holo-rx", "--holo-ry"] as const;

const pixels = (value: string) => Number.parseFloat(value) || 0;

function factsFor(el: Element): PanelFacts {
	const style = getComputedStyle(el);
	const box = el.getBoundingClientRect();
	return {
		tag: el.tagName,
		width: box.width,
		height: box.height,
		radius: pixels(style.borderTopLeftRadius),
		borderWidth: pixels(style.borderTopWidth),
		borderAlpha: style.borderTopStyle === "none" ? 0 : colorAlpha(style.borderTopColor),
		hasShadow: style.boxShadow !== "none",
		bgAlpha: colorAlpha(style.backgroundColor),
		hasFields: el.querySelector("input, select, textarea") !== null,
		excluded: el.closest("[data-wv-header], footer, [data-no-holo]") !== null,
	};
}

export function HoloPanels() {
	useEffect(() => {
		const mouse = window.matchMedia("(hover: hover) and (pointer: fine)");
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (!mouse.matches || reduced.matches) return;

		const decisions = new WeakMap<Element, { at: number; mode: HoloMode | null }>();
		const settling = new Map<Element, number>();
		let current: Element | null = null;
		let frame = 0;
		let x = -1;
		let y = -1;
		let held = false;

		const decide = (el: Element): HoloMode | null => {
			const now = performance.now();
			const known = decisions.get(el);
			if (known && now - known.at < DECISION_TTL_MS) return known.mode;
			const mode = isHydrated(el) ? holoMode(factsFor(el)) : null;
			decisions.set(el, { at: now, mode });
			return mode;
		};

		/** The innermost panel at or above `start`. */
		const panelAt = (start: Element | null): { el: Element; mode: HoloMode } | null => {
			let el = start;
			for (
				let depth = 0;
				el && el !== document.body && depth < MAX_DEPTH;
				depth += 1, el = el.parentElement
			) {
				const mode = decide(el);
				if (mode) return { el, mode };
			}
			return null;
		};

		const clearVars = (el: HTMLElement) => VARS.forEach((name) => el.style.removeProperty(name));

		const release = (el: Element) => {
			el.setAttribute("data-holo", "leaving");
			clearVars(el as HTMLElement);
			window.clearTimeout(settling.get(el));
			settling.set(
				el,
				window.setTimeout(() => {
					settling.delete(el);
					if (el === current) return;
					["data-holo", "data-holo-static", "data-holo-tilt"].forEach((name) => el.removeAttribute(name));
				}, SETTLE_MS),
			);
		};

		const leave = () => {
			if (current) release(current);
			current = null;
		};

		const update = () => {
			frame = 0;
			if (held || x < 0) return leave();
			const found = panelAt(document.elementFromPoint(x, y));
			if (!found) return leave();
			const { el, mode } = found;
			if (el !== current) {
				leave();
				current = el;
				window.clearTimeout(settling.get(el));
				settling.delete(el);
				el.setAttribute("data-holo", "on");
				// The foil is a layer inside the panel, so the panel has to be a positioning context; most already are.
				if (getComputedStyle(el).position === "static") el.setAttribute("data-holo-static", "");
				else el.removeAttribute("data-holo-static");
				if (mode.tilt) el.setAttribute("data-holo-tilt", "");
				else el.removeAttribute("data-holo-tilt");
			}
			const point = holoPointer(el.getBoundingClientRect(), x, y);
			const style = (el as HTMLElement).style;
			style.setProperty("--holo-x", `${point.x}%`);
			style.setProperty("--holo-y", `${point.y}%`);
			style.setProperty("--holo-rx", mode.tilt ? `${point.rx}deg` : "0deg");
			style.setProperty("--holo-ry", mode.tilt ? `${point.ry}deg` : "0deg");
		};

		const schedule = () => {
			if (!frame) frame = window.requestAnimationFrame(update);
		};

		const onMove = (event: PointerEvent) => {
			// Touch and pen have no hover; a held button means dragging something.
			if (event.pointerType !== "mouse") return;
			x = event.clientX;
			y = event.clientY;
			held = event.buttons !== 0;
			schedule();
		};
		// The page moves under a still pointer when it scrolls, so look again from the same spot.
		const onScroll = () => {
			if (x >= 0) schedule();
		};
		const onOut = (event: MouseEvent) => {
			if (event.relatedTarget === null) {
				x = -1;
				schedule();
			}
		};

		document.addEventListener("pointermove", onMove, { passive: true });
		document.addEventListener("pointerdown", onMove, { passive: true });
		document.addEventListener("pointerup", onMove, { passive: true });
		document.addEventListener("scroll", onScroll, { passive: true, capture: true });
		document.addEventListener("mouseout", onOut);
		window.addEventListener("blur", onOut as unknown as EventListener);

		return () => {
			document.removeEventListener("pointermove", onMove);
			document.removeEventListener("pointerdown", onMove);
			document.removeEventListener("pointerup", onMove);
			document.removeEventListener("scroll", onScroll, { capture: true });
			document.removeEventListener("mouseout", onOut);
			window.removeEventListener("blur", onOut as unknown as EventListener);
			window.cancelAnimationFrame(frame);
			settling.forEach((timer) => window.clearTimeout(timer));
			document.querySelectorAll("[data-holo]").forEach((el) => {
				["data-holo", "data-holo-static", "data-holo-tilt"].forEach((name) => el.removeAttribute(name));
				clearVars(el as HTMLElement);
			});
		};
	}, []);

	return null;
}
