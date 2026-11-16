"use client";

import { useState } from "react";
import type { ShopFilterControls } from "@/lib/catalog/use-shop-filters";
import { FilterSection } from "./wv-filter-section";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

/** One ticked-or-not option row in the filter sidebar: "✓ Label (count)". */
function OptionButton({
	label,
	count,
	ticked,
	onClick,
}: {
	label: string;
	count: number;
	ticked: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={ticked}
			onClick={onClick}
			className={`${heyComic} wv-filter-row flex items-center justify-between gap-2 rounded-md text-left text-xs ${ticked ? "wv-filter-on" : "text-white"}`}
		>
			<span>
				{ticked ? "✓ " : ""}
				{label}
			</span>
			<span className={`${orbitron} wv-filter-count`}>{count}</span>
		</button>
	);
}

/**
 * The filter sidebar shared by the shop and the search page: categories (each opening into its attribute values and
 * sub-categories), a price range, and APPLY FILTERS. Ticking only changes the draft held by `useShopFilters`.
 *
 * The card styling is built in; `className` supplies how it sits on the page, including its `display` (`flex`, or
 * `hidden` while a mobile toggle has it closed) and its width.
 *
 * It is a glassy neon panel (`.wv-filter-*` in wv-home.css): a gradient edge that glows, a 3D heading over a neon rule,
 * glowing section titles between neon dividers, a neon dot for each category (lit cyan when ticked), counts in small
 * pills, a neon price slider with the chosen range in its own readout, and the glossy APPLY button.
 */
export function ShopFilterSidebar({
	filters,
	money,
	className,
}: {
	filters: ShopFilterControls;
	money: (n: number) => string;
	className: string;
}) {
	const { bounds, categories, categoryGroups, draft } = filters;
	// Category headings the shopper has opened or closed by hand (otherwise a heading is open while its category is ticked).
	const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});

	const span = Math.max(1, bounds.max - bounds.min);
	const left = ((draft.lo - bounds.min) / span) * 100;
	const right = ((draft.hi - bounds.min) / span) * 100;

	return (
		<aside aria-label="Filters" className={`wv-filter-card flex-col gap-4 rounded-2xl p-5 ${className}`}>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<h2 className={`${bungee} wv-heading-title text-base text-white`}>FILTERS</h2>
					{filters.hasAnyFilter && (
						<button
							type="button"
							onClick={filters.clearAll}
							className={`${heyComic} wv-filter-clear text-[11px] underline`}
						>
							Clear all
						</button>
					)}
				</div>
				<div aria-hidden className="wv-filter-rule" />
			</div>

			<FilterSection title="CATEGORIES" defaultOpen>
				<div className="flex flex-col gap-2">
					{categories.map((c) => {
						const on = draft.cats.includes(c.slug);
						const groupsHere = categoryGroups[c.slug] ?? [];
						const expandable = groupsHere.length > 0;
						// Open while ticked (e.g. after picking its tile) unless the shopper has opened or closed it themselves.
						const open = openOverride[c.slug] ?? on;
						return (
							<div key={c.slug} className="flex flex-col gap-2">
								<div className="flex items-center gap-2">
									<button
										type="button"
										aria-pressed={on}
										aria-label={`Select ${c.name}`}
										onClick={() => filters.toggleCategory(c.slug)}
										className="flex size-4 shrink-0 items-center justify-center"
									>
										<span aria-hidden className="wv-filter-dot" />
									</button>
									{/* The heading opens and closes what is under it (or ticks the category when nothing is). */}
									<button
										type="button"
										aria-expanded={expandable ? open : undefined}
										onClick={() =>
											expandable
												? setOpenOverride((cur) => ({ ...cur, [c.slug]: !open }))
												: filters.toggleCategory(c.slug)
										}
										className={`${heyComic} wv-filter-row flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md text-left text-xs ${on ? "wv-filter-on" : "text-white"}`}
									>
										<span>{c.name}</span>
										<span className="flex items-center gap-2">
											<span className={`${orbitron} wv-filter-count`}>{c.count}</span>
											{expandable && (
												<span
													aria-hidden
													className={`wv-filter-chevron transition-transform ${open ? "rotate-180" : ""}`}
												>
													▾
												</span>
											)}
										</span>
									</button>
								</div>
								{/* Under the heading: collapsible groups (Battery Capacity, Mods, …), or the items directly. */}
								{expandable && (
									<div className={open ? "wv-filter-branch ml-1 flex flex-col gap-3 pl-3" : "hidden"}>
										{groupsHere.map((group) => {
											const tickedValues =
												group.kind === "type"
													? draft.types
													: group.kind === "category"
														? draft.cats
														: ((group.key && draft.facets[c.slug]?.[group.key]) ?? []);
											const options = group.options.map((o) => (
												<OptionButton
													key={o.value}
													label={o.label}
													count={o.count}
													ticked={tickedValues.includes(o.value)}
													onClick={() =>
														group.kind === "category"
															? filters.toggleUnderNewArrivals(o.value)
															: group.kind === "type" || !group.key
																? filters.toggleType(o.value)
																: filters.toggleFacet(c.slug, group.key, o.value)
													}
												/>
											));
											if (!group.label) {
												return (
													<div key={group.id} className="flex flex-col gap-2">
														{options}
													</div>
												);
											}
											const tickedHere = group.options.filter((o) => tickedValues.includes(o.value)).length;
											return (
												<FilterSection
													key={group.id}
													nested
													title={group.label}
													defaultOpen={tickedHere > 0}
													badge={tickedHere > 0 ? `(${tickedHere})` : undefined}
												>
													<div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">{options}</div>
												</FilterSection>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</FilterSection>

			<FilterSection title="PRICE RANGE" defaultOpen>
				{/* The chosen range has a line of its own, above the slider; the scale's two ends sit under the slider's ends.
				    (On one line, the three labels ran into each other in the narrow tablet sidebar.) */}
				<div className="flex flex-col gap-3">
					<p
						className={`${orbitron} wv-price-readout self-center rounded-full px-3 py-1 text-center text-[11px]`}
					>
						{money(draft.lo)} – {money(draft.hi)}
					</p>
					<div className="wv-range-track relative mx-[7px] h-1 rounded-full">
						<div
							className="wv-range-fill absolute inset-y-0 rounded-full"
							style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
						/>
						<input
							type="range"
							aria-label="Minimum price"
							className="wv-range wv-range--aligned"
							min={bounds.min}
							max={bounds.max}
							value={draft.lo}
							onChange={(e) => filters.setRange([Math.min(Number(e.target.value), draft.hi), draft.hi])}
						/>
						<input
							type="range"
							aria-label="Maximum price"
							className="wv-range wv-range--aligned"
							min={bounds.min}
							max={bounds.max}
							value={draft.hi}
							onChange={(e) => filters.setRange([draft.lo, Math.max(Number(e.target.value), draft.lo)])}
						/>
					</div>
					<div className={`${orbitron} flex justify-between gap-2 text-[10px] text-[var(--wv-text-dim)]`}>
						<span>{money(bounds.min)}</span>
						<span>{money(bounds.max)}</span>
					</div>
				</div>
			</FilterSection>

			<button
				type="button"
				onClick={filters.apply}
				className={`${heyComic} wv-pc-cta h-[45px] w-full rounded-xl bg-[var(--wv-cyan-soft)] text-sm text-[var(--wv-bg)]`}
			>
				<span className="wv-pc-cta-label">APPLY FILTERS</span>
			</button>
		</aside>
	);
}
