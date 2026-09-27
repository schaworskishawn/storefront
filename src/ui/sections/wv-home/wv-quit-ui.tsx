export const inter = "font-[family-name:var(--font-inter)]";

/** Standard card — thin border, no glow. Used for metric/roadmap/tip tiles. */
export const cardClass = "rounded-2xl border border-[var(--qp-border)] bg-[var(--qp-surface)]";

/** The wizard's and hero's strong-glow "stage" frame — heavier border + soft cyan glow. */
export const stageFrame =
	"rounded-[18px] border-2 border-[var(--qp-primary)] bg-[var(--qp-surface)] shadow-[0_0_0_1px_rgba(105,235,255,0.18),0_0_34px_rgba(105,235,255,0.08)]";

export const eyebrowClass = "text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--qp-primary)]";

export const primaryBtn = `${inter} flex h-11 items-center justify-center rounded-xl border border-[var(--qp-secondary)]/70 bg-gradient-to-r from-[var(--qp-secondary)] to-[color-mix(in_srgb,var(--qp-secondary)_65%,white)] px-5 text-sm font-bold text-white shadow-[0_0_22px_rgba(241,121,251,0.35)] disabled:opacity-50`;

export const ghostBtn = `${inter} flex h-11 items-center justify-center rounded-xl border border-[var(--qp-border)] bg-[var(--qp-field)] px-5 text-sm font-bold text-[var(--qp-text)] disabled:opacity-50`;

export const fieldClass =
	"h-11 w-full min-w-0 rounded-lg border border-[var(--qp-border)] bg-[var(--qp-field)] px-3 text-sm text-[var(--qp-text)] placeholder:text-[var(--qp-dim)] focus:border-[var(--qp-primary)] focus:outline-none";
