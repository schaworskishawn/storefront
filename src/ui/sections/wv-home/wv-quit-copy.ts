/** Wording and small display helpers for the /quit dashboard, kept out of the component so they can be tested. */
import { puffTargetFor, type Stage } from "./wv-quit-model";

/** One plain-language line per stage name (Stabilize is only here for plans saved before the current plan existed). */
export const STAGE_TEXT: Record<string, string> = {
	Baseline: "Track normal use before changing strength.",
	Reduction: "Strength drops 2 mg. Puff a bit more at first, then ease your puffs back down.",
	Stabilize: "Hold steady. Avoid compensating with extra puffs.",
	"Final Taper": "Now at 0 mg. Ease your puffs down day by day until you're done.",
};

export const TIPS_BY_STAGE: Record<string, { title: string; text: string }[]> = {
	Baseline: [
		{ title: "Track honestly", text: "Log your normal use so your starting point is accurate." },
		{ title: "Notice triggers", text: "Pay attention to time, place, mood, and routine." },
		{ title: "Don't change yet", text: "Baseline is about observation first, not perfection." },
	],
	Reduction: [
		{
			title: "Expect to puff more at first",
			text: "A weaker liquid is less satisfying, so your target starts a little higher. That's part of the plan.",
		},
		{
			title: "Ease back down each day",
			text: "Your daily puff target comes down a little every day. Stay at or under it.",
		},
		{ title: "Swap the habit", text: "Replace the puff reflex with water, a walk, or a stretch." },
	],
	Stabilize: [
		{ title: "Resist compensating", text: "More puffs at a lower strength cancels out the reduction." },
		{ title: "Notice the wins", text: "Fewer cravings at this level is a real sign of progress." },
		{ title: "Prepare for the next step", text: "Read ahead so the next reduction feels familiar." },
	],
	"Final Taper": [
		{ title: "You're nearly there", text: "The last stretch is the hardest — go slower if you need to." },
		{ title: "Plan for zero", text: "Decide now what you'll do instead of a puff." },
		{ title: "Celebrate the finish", text: "Line up something to mark being nicotine-free." },
	],
};

/** A stage in words a person would say, e.g. "Step down to 18 mg". */
export function stageTitle(st: Stage): string {
	switch (st.name) {
		case "Baseline":
			return "Get started: track your normal use";
		case "Reduction":
			return `Step down to ${st.strength} mg`;
		case "Final Taper":
			return "Final step: ease off puffs at 0 mg";
		case "Stabilize":
			return `Hold steady at ${st.strength} mg`;
		default:
			return st.name;
	}
}

/** " · 228 → 190 puffs/day" for a stage, or "" when there is no baseline to work it out from. */
export function puffRange(st: Stage, baseline: number): string {
	const from = puffTargetFor(st, baseline, 0);
	const to = puffTargetFor(st, baseline, st.days - 1);
	if (from === null || to === null) return "";
	return from === to ? ` · ${from} puffs/day` : ` · ${from} → ${to} puffs/day`;
}

export type PuffStatus = {
	/** ok: well within the target · near: close to it · over: past it · none: no target to compare with. */
	tone: "ok" | "near" | "over" | "none";
	/** How full the meter is (0–100). */
	pct: number;
	/** One kind sentence about where today stands. */
	text: string;
};

/** Where today's puffs stand against the target, in words that don't scold. */
export function puffStatus(used: number, target: number | null): PuffStatus {
	if (target === null) {
		return {
			tone: "none",
			pct: 0,
			text: "Keep logging. Your puff target appears once you've logged a few days.",
		};
	}
	if (target <= 0) {
		return used === 0
			? { tone: "ok", pct: 0, text: "No puffs so far today. You've got this." }
			: { tone: "over", pct: 100, text: "Aim for none today. Every puff you skip counts." };
	}
	const pct = Math.min(100, Math.round((used / target) * 100));
	if (used > target) {
		return {
			tone: "over",
			pct,
			text: `${used - target} over your target. No stress, aim a little lower tomorrow.`,
		};
	}
	if (used === target) return { tone: "near", pct, text: "You're right at your target." };
	const left = target - used;
	return {
		tone: used / target >= 0.8 ? "near" : "ok",
		pct,
		text: `${left} ${left === 1 ? "puff" : "puffs"} left today.`,
	};
}
