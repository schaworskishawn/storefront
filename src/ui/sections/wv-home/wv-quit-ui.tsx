export const inter = "font-[family-name:var(--font-inter)]";

/** Standard card — thin border, no glow. Used for metric/roadmap/tip tiles. */
export const cardClass = "rounded-2xl border border-[var(--qp-border)] bg-[var(--qp-surface)]";

/** The wizard's and hero's "stage": lit glass inside a glowing cyan-through-purple-to-pink edge (`.wv-quit-stage`,
 * wv-home.css). */
export const stageFrame = "wv-quit-stage rounded-[18px]";

export const eyebrowClass = "text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--qp-primary)]";

/** A glossy pink neon button that lifts and glows brighter under the pointer (`.wv-quit-primary`, wv-home.css). */
export const primaryBtn = `${inter} wv-quit-primary flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-white disabled:opacity-50`;

/** Glass inside a soft neon edge that glows under the pointer (`.wv-quit-ghost`, wv-home.css). */
export const ghostBtn = `${inter} wv-quit-ghost flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-[var(--qp-text)] disabled:opacity-50`;

export const fieldClass =
	"h-11 w-full min-w-0 rounded-lg border border-[var(--qp-border)] bg-[var(--qp-field)] px-3 text-sm text-[var(--qp-text)] placeholder:text-[var(--qp-dim)] focus:border-[var(--qp-primary)] focus:outline-none";
