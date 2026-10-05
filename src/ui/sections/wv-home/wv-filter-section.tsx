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
			className={
				nested ? "group" : "group border-t border-[var(--wv-purple)] pt-4 first:border-t-0 first:pt-0"
			}
		>
			<summary
				className={`flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden ${
					nested
						? `${orbitron} text-[10px] uppercase tracking-[1px] text-[var(--wv-text-dim)]`
						: `${bungee} text-xs text-[var(--wv-cyan-soft)]`
				}`}
			>
				<span>
					{title}
					{badge && <span className="ml-2 text-[var(--wv-cyan-soft)]">{badge}</span>}
				</span>
				<span aria-hidden className="transition-transform group-open:rotate-180">
					▾
				</span>
			</summary>
			<div className={nested ? "mt-2" : "mt-3"}>{children}</div>
		</details>
	);
}
