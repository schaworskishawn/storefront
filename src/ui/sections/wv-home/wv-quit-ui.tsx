export const inter = "font-[family-name:var(--font-inter)]";

/** Standard card: neon glass inside a soft cyan-through-purple-to-pink edge (`.wv-quit-card`, wv-home.css). Used for
 * the explainer, the plan, the chart and the tips. */
export const cardClass = "wv-quit-card rounded-2xl";

/** The wizard's and hero's "stage": lit glass inside a glowing cyan-through-purple-to-pink edge (`.wv-quit-stage`,
 * wv-home.css). */
export const stageFrame = "wv-quit-stage rounded-[18px]";

/** A section's small label, glowing cyan (`.wv-quit-eyebrow`). */
export const eyebrowClass =
	"wv-quit-eyebrow text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--qp-primary)]";

/** A glossy pink neon button that lifts and glows brighter under the pointer (`.wv-quit-primary`, wv-home.css). */
export const primaryBtn = `${inter} wv-quit-primary flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-white disabled:opacity-50`;

/** Glass inside a soft neon edge that glows under the pointer (`.wv-quit-ghost`, wv-home.css). */
export const ghostBtn = `${inter} wv-quit-ghost flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-[var(--qp-text)] disabled:opacity-50`;

/** A text field set into the glass, glowing cyan while focused (`.wv-quit-field`, wv-home.css). */
export const fieldClass =
	"wv-quit-field h-11 w-full min-w-0 rounded-lg px-3 text-sm text-[var(--qp-text)] placeholder:text-[var(--qp-dim)] focus:outline-none";
