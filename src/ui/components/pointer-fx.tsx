"use client";

import { useEffect, useRef } from "react";
import { colorAlpha } from "@/lib/motion/holo";
import { isHydrated } from "@/lib/motion/is-hydrated";
import {
	GLOW_EASE,
	HALO_EASE,
	MAX_PULSES,
	follow,
	hasArrived,
	isMagneticTarget,
	magnetOffset,
	type MagnetFacts,
	type Point,
} from "@/lib/motion/pointer-fx";

/**
 * Pointer effects for every page under the `(root)` layout, in one component with one set of listeners and one animation loop:
 *
 * - **Halo and trail.** A ring that follows the pointer a little behind it (opening up over anything clickable, closing in
 *   while pressed), and a softer glow that follows more slowly, so it trails the ring.
 * - **Magnetic lettering.** A button under the pointer drifts toward it, and its lettering splits into a cyan and a pink ghost
 *   that lean the same way (`[data-magnet]`, `--mag-x`, `--mag-y`; see `src/styles/pointer-fx.css`).
 * - **Click pulses.** Twin rings ripple out from every click or tap.
 *
 * The halo and the magnetic buttons are for a real mouse only; the pulses also answer a tap. None of it runs for reduced motion. Buttons are
 * found by how they look (see `isMagneticTarget`), so nothing needs tagging; `data-no-magnet` keeps one out. The brand logo's
 * glitch is plain CSS (`.wv-glitch`) and needs nothing from here.
 */

const DECISION_TTL_MS = 800;
const MAX_DEPTH = 4;
const SETTLE_MS = 450;
const PULSE_MS = 800;

const pixels = (value: string) => Number.parseFloat(value) || 0;

function magnetFactsFor(el: Element): MagnetFacts {
	const style = getComputedStyle(el);
	const box = el.getBoundingClientRect();
	return {
		tag: el.tagName,
		width: box.width,
		height: box.height,
		radius: pixels(style.borderTopLeftRadius),
		bgAlpha: colorAlpha(style.backgroundColor),
		borderWidth: pixels(style.borderTopWidth),
		borderAlpha: style.borderTopStyle === "none" ? 0 : colorAlpha(style.borderTopColor),
		disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
		hasText: (el.textContent ?? "").trim().length >= 2,
		excluded: el.closest("[data-wv-header], [data-no-magnet]") !== null,
	};
}

export function PointerFx() {
	const rootRef = useRef<HTMLDivElement>(null);
	const glowRef = useRef<HTMLDivElement>(null);
	const haloRef = useRef<HTMLDivElement>(null);
	const pulsesRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = rootRef.current;
		const glow = glowRef.current;
		const halo = haloRef.current;
		const pulses = pulsesRef.current;
		if (!root || !glow || !halo || !pulses) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const mouse = window.matchMedia("(hover: hover) and (pointer: fine)");

		let target: Point = { x: -1, y: -1 };
		let glowAt: Point = target;
		let haloAt: Point = target;
		let shown = false;
		let dirty = false;
		let frameId = 0;

		// The individual `translate` property, not `transform`: the halo's `scale` (for hovering a link) is applied around the
		// position it is given, and a position written as `transform` would be multiplied by it, drawing the ring far off.
		const place = (el: HTMLElement, at: Point) => {
			el.style.translate = `${at.x}px ${at.y}px`;
		};

		// ----- Magnetic buttons -----
		const decisions = new WeakMap<Element, { at: number; magnetic: boolean }>();
		const settling = new Map<Element, number>();
		let magnet: Element | null = null;
		let magnetRect: DOMRect | null = null;

		const isMagnet = (el: Element) => {
			const now = performance.now();
			const known = decisions.get(el);
			if (known && now - known.at < DECISION_TTL_MS) return known.magnetic;
			const magnetic = isHydrated(el) && isMagneticTarget(magnetFactsFor(el));
			decisions.set(el, { at: now, magnetic });
			return magnetic;
		};

		const releaseMagnet = () => {
			const el = magnet;
			if (!el) return;
			magnet = null;
			magnetRect = null;
			el.setAttribute("data-magnet", "leaving");
			const style = (el as HTMLElement).style;
			style.removeProperty("--mag-x");
			style.removeProperty("--mag-y");
			window.clearTimeout(settling.get(el));
			settling.set(
				el,
				window.setTimeout(() => {
					settling.delete(el);
					if (el !== magnet) el.removeAttribute("data-magnet");
				}, SETTLE_MS),
			);
		};

		const updateMagnet = (under: Element | null) => {
			let found: Element | null = null;
			let el = under;
			for (
				let depth = 0;
				el && el !== document.body && depth < MAX_DEPTH;
				depth += 1, el = el.parentElement
			) {
				if (isMagnet(el)) {
					found = el;
					break;
				}
			}
			if (found !== magnet) {
				releaseMagnet();
				if (found) {
					magnet = found;
					window.clearTimeout(settling.get(found));
					settling.delete(found);
					found.setAttribute("data-magnet", "on");
				}
			}
			if (!magnet) return;
			// The rect is taken once per button (and again after a scroll or resize), not every frame: the button itself drifts,
			// and measuring a moving button would make the pull chase itself.
			magnetRect ??= magnet.getBoundingClientRect();
			const offset = magnetOffset(magnetRect, target.x, target.y);
			const style = (magnet as HTMLElement).style;
			style.setProperty("--mag-x", String(offset.x));
			style.setProperty("--mag-y", String(offset.y));
		};

		// ----- The animation loop -----
		const logic = () => {
			const under = document.elementFromPoint(target.x, target.y);
			// What the cursor says about it: a pointing hand (ours or the system's) means clickable.
			const clickable = under !== null && getComputedStyle(under).cursor.includes("pointer");
			if (clickable) root.setAttribute("data-halo", "link");
			else root.removeAttribute("data-halo");
			updateMagnet(under);
		};

		const frame = () => {
			frameId = 0;
			if (dirty) {
				dirty = false;
				if (shown) logic();
			}
			if (!shown) return;
			haloAt = follow(haloAt, target, HALO_EASE);
			glowAt = follow(glowAt, target, GLOW_EASE);
			place(halo, haloAt);
			place(glow, glowAt);
			if (!(hasArrived(haloAt, target) && hasArrived(glowAt, target))) {
				frameId = window.requestAnimationFrame(frame);
			}
		};
		const kick = () => {
			if (!frameId) frameId = window.requestAnimationFrame(frame);
		};

		const hide = () => {
			shown = false;
			root.removeAttribute("data-on");
			root.removeAttribute("data-halo");
			root.removeAttribute("data-press");
			releaseMagnet();
		};

		// ----- Click pulses -----
		const pulseTimers = new Set<number>();
		const spawnPulse = (x: number, y: number) => {
			while (pulses.childElementCount >= MAX_PULSES) pulses.firstElementChild?.remove();
			const pulse = document.createElement("div");
			pulse.className = "wv-pulse";
			pulse.style.left = `${x}px`;
			pulse.style.top = `${y}px`;
			pulses.appendChild(pulse);
			const timer = window.setTimeout(() => {
				pulse.remove();
				pulseTimers.delete(timer);
			}, PULSE_MS);
			pulseTimers.add(timer);
		};

		// ----- Listeners -----
		const onMove = (event: PointerEvent) => {
			if (event.pointerType !== "mouse" || !mouse.matches) return;
			target = { x: event.clientX, y: event.clientY };
			if (!shown) {
				// Appear at the pointer, not flying in from a corner.
				shown = true;
				haloAt = glowAt = target;
				place(halo, haloAt);
				place(glow, glowAt);
				root.setAttribute("data-on", "");
			}
			dirty = true;
			kick();
		};
		const onDown = (event: PointerEvent) => {
			if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
			spawnPulse(event.clientX, event.clientY);
			if (event.pointerType === "mouse") root.setAttribute("data-press", "");
		};
		const onUp = () => root.removeAttribute("data-press");
		// The page moves under a still pointer when it scrolls or resizes: look again from the same spot.
		const onShift = () => {
			magnetRect = null;
			if (!shown) return;
			dirty = true;
			kick();
		};
		const onOut = (event: MouseEvent) => {
			if (event.relatedTarget === null) hide();
		};

		document.addEventListener("pointermove", onMove, { passive: true });
		document.addEventListener("pointerdown", onDown, { passive: true });
		document.addEventListener("pointerup", onUp, { passive: true });
		document.addEventListener("pointercancel", onUp, { passive: true });
		document.addEventListener("scroll", onShift, { passive: true, capture: true });
		window.addEventListener("resize", onShift, { passive: true });
		document.addEventListener("mouseout", onOut);
		window.addEventListener("blur", hide);

		return () => {
			document.removeEventListener("pointermove", onMove);
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("pointerup", onUp);
			document.removeEventListener("pointercancel", onUp);
			document.removeEventListener("scroll", onShift, { capture: true });
			window.removeEventListener("resize", onShift);
			document.removeEventListener("mouseout", onOut);
			window.removeEventListener("blur", hide);
			window.cancelAnimationFrame(frameId);
			settling.forEach((timer) => window.clearTimeout(timer));
			pulseTimers.forEach((timer) => window.clearTimeout(timer));
			pulses.replaceChildren();
			document.querySelectorAll("[data-magnet]").forEach((el) => {
				el.removeAttribute("data-magnet");
				(el as HTMLElement).style.removeProperty("--mag-x");
				(el as HTMLElement).style.removeProperty("--mag-y");
			});
		};
	}, []);

	return (
		<div ref={rootRef} aria-hidden className="wv-fx">
			<div ref={glowRef} className="wv-fx-glow" />
			<div ref={haloRef} className="wv-fx-halo" />
			<div ref={pulsesRef} />
		</div>
	);
}
