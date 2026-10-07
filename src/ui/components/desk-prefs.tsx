"use client";

import { useEffect } from "react";
import { useDesk } from "@/lib/desk/store";

/**
 * Carries one of a visitor's My Desk choices to every page: whether the cursor halo, click pulses, magnetic buttons and card
 * shimmer are on. It sets `data-wv-fx="off"` on <html> when they turned them off, which those effects check. Renders nothing.
 */
export function DeskPrefs() {
	const { desk } = useDesk();
	const effects = desk.appearance.effects;
	useEffect(() => {
		document.documentElement.dataset.wvFx = effects ? "on" : "off";
	}, [effects]);
	return null;
}
