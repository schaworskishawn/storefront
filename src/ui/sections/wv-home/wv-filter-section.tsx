import { type ReactNode } from "react";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

/**
 * One collapsible filter group in the shop sidebar. A native <details>, so it is keyboard accessible and needs no
 * state of its own; `defaultOpen` only sets how it starts (open groups with ticked values stay visible).
 * `nested` is the smaller version used for a group listed under a category heading.
 */
export function FilterSection({
	title,
	defaultOpen = false,
	badge,
	nested = false,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	/** Short note after the title, e.g. how many values are ticked. */
	badge?: string;
	nested?: boolean;
	children: ReactNode;
}) {
	return (
		<details
			open={defaultOpen}
			// A top-level group sits under a neon divider (`.wv-filter-section`, wv-home.css) and has a glowing title.
			className={nested ? "group" : "wv-filter-section group relative pt-4 first:pt-0"}
		>
			<summary
				className={`flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden ${
					nested
						? `${orbitron} text-[10px] uppercase tracking-[1px] text-[var(--wv-text-dim)]`
						: `${bungee} wv-filter-title text-xs`
				}`}
			>
				<span>
					{title}
					{badge && <span className="ml-2 text-[var(--wv-cyan-soft)]">{badge}</span>}
				</span>
				<span aria-hidden className="wv-filter-chevron transition-transform group-open:rotate-180">
					▾
				</span>
			</summary>
			<div className={nested ? "mt-2" : "mt-3"}>{children}</div>
		</details>
	);
}
