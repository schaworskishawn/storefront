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
			className={`${heyComic} flex items-center justify-between gap-2 text-left text-xs ${ticked ? "text-[var(--wv-cyan-soft)]" : "text-white"}`}
		>
			<span>
				{ticked ? "✓ " : ""}
				{label}
			</span>
			<span className={`${orbitron} text-[var(--wv-text-dim)]`}>({count})</span>
		</button>
	);
}

/**
 * The filter sidebar shared by the shop and the search page: categories (each opening into its attribute values and
 * sub-categories), a price range, and APPLY FILTERS. Ticking only changes the draft held by `useShopFilters`.
 *
 * The card styling is built in; `className` supplies how it sits on the page, including its `display` (`flex`, or
 * `hidden` while a mobile toggle has it closed) and its width.
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
		<aside
			aria-label="Filters"
			className={`flex-col gap-4 rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] p-5 ${className}`}
		>
			<div className="flex flex-col gap-[6px]">
				<div className="flex items-center justify-between gap-2">
					<h2 className={`${bungee} text-base text-white`}>FILTERS</h2>
					{filters.hasAnyFilter && (
						<button
							type="button"
							onClick={filters.clearAll}
							className={`${heyComic} text-[11px] text-[var(--wv-cyan-soft)] underline`}
						>
							Clear all
						</button>
					)}
				</div>
				<div className="h-px bg-[var(--wv-purple)]" />
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
										className={`flex size-4 shrink-0 items-center justify-center text-base leading-none ${
											on ? "text-[var(--wv-cyan-soft)]" : "text-[var(--wv-purple)]"
										}`}
									>
										•
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
										className={`${heyComic} flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-xs ${on ? "text-[var(--wv-cyan-soft)]" : "text-white"}`}
									>
										<span>{c.name}</span>
										<span className="flex items-center gap-2">
											<span className={`${orbitron} text-[var(--wv-text-dim)]`}>({c.count})</span>
											{expandable && (
												<span
													aria-hidden
													className={`text-[var(--wv-cyan-soft)] transition-transform ${open ? "rotate-180" : ""}`}
												>
													▾
												</span>
											)}
										</span>
									</button>
								</div>
								{/* Under the heading: collapsible groups (Battery Capacity, Mods, …), or the items directly. */}
								{expandable && (
									<div
										className={
											open ? "ml-1 flex flex-col gap-3 border-l border-[var(--wv-purple)] pl-3" : "hidden"
										}
									>
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
				<div className="flex flex-col gap-3">
					<div className="relative h-1 rounded-sm bg-[var(--wv-purple)]">
						<div
							className="absolute inset-y-0 bg-[var(--wv-cyan-soft)]"
							style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
						/>
						<input
							type="range"
							aria-label="Minimum price"
							className="wv-range"
							min={bounds.min}
							max={bounds.max}
							value={draft.lo}
							onChange={(e) => filters.setRange([Math.min(Number(e.target.value), draft.hi), draft.hi])}
						/>
						<input
							type="range"
							aria-label="Maximum price"
							className="wv-range"
							min={bounds.min}
							max={bounds.max}
							value={draft.hi}
							onChange={(e) => filters.setRange([draft.lo, Math.max(Number(e.target.value), draft.lo)])}
						/>
					</div>
					<div className={`${orbitron} flex justify-between text-[11px]`}>
						<span className="text-[var(--wv-text-dim)]">{money(bounds.min)}</span>
						<span className="text-white">
							{money(draft.lo)} - {money(draft.hi)}
						</span>
						<span className="text-[var(--wv-text-dim)]">{money(bounds.max)}</span>
					</div>
				</div>
			</FilterSection>

			<button
				type="button"
				onClick={filters.apply}
				className={`${heyComic} h-[45px] w-full rounded-xl bg-[var(--wv-cyan-soft)] text-sm text-[var(--wv-bg)]`}
			>
				APPLY FILTERS
			</button>
		</aside>
	);
}
