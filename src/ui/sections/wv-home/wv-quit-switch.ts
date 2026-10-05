/**
 * Cigarette smokers who come to the quit plan are switching to vaping, so they can't say what strength they "use now".
 * Instead the wizard asks how much they smoke and suggests a vape nicotine strength to start from; the plan then
 * steps that strength down like any other. These are general starting points, not medical advice — the visitor can
 * always pick a different strength. Worldwide Vapor's strongest e-liquid is 20 mg/mL, so even the heaviest smokers
 * start there at most.
 */
export type SwitchBand = {
	id: string;
	/** Cigarettes smoked on a typical day. */
	label: string;
	/** The e-liquid strength (mg/mL) suggested for that much smoking. */
	strength: number;
};

export const SWITCH_BANDS: SwitchBand[] = [
	{ id: "up-to-5", label: "Up to 5 a day", strength: 6 },
	{ id: "6-10", label: "6–10 a day", strength: 12 },
	{ id: "11-20", label: "11–20 a day (about a pack)", strength: 18 },
	{ id: "over-20", label: "More than a pack a day", strength: 20 },
];

/** The strength a cigarette smoker starts on when they have not picked one. */
export const DEFAULT_SWITCH_STRENGTH = 18;
