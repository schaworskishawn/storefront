"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";

export type Faq = { q: string; a: string; link?: { href: string; label: string } };

/** Searchable, single-open accordion list. `text` is the plain-text answer used for matching. */
export function FaqExperience({
	faqs,
	intro,
	visual,
	aside,
}: {
	faqs: Faq[];
	intro: ReactNode;
	visual: ReactNode;
	aside: ReactNode;
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState<number | null>(0);

	const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
	const shown = useMemo(
		() =>
			faqs
				.map((f, i) => ({ f, i }))
				.filter(({ f }) =>
					terms.every((t) => f.q.toLowerCase().includes(t) || f.a.toLowerCase().includes(t)),
				),
		[faqs, terms],
	);

	return (
		<>
			<section className="flex flex-col gap-6 md:gap-8 xl:flex-row xl:items-center xl:justify-between xl:gap-10 xl:pb-12 xl:pt-5">
				<div className="flex min-w-0 flex-col gap-5 xl:w-[680px] xl:gap-7">
					{intro}
					<form
						role="search"
						onSubmit={(e) => e.preventDefault()}
						className="flex h-12 items-center gap-3 rounded-lg border border-[var(--fq-search-border)] bg-[var(--fq-search-bg)] px-4 xl:h-14"
					>
						<span aria-hidden>🔍</span>
						<label htmlFor="faq-search" className="sr-only">
							Search FAQs
						</label>
						<input
							id="faq-search"
							type="search"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								setOpen(null);
							}}
							placeholder="Search for questions, keywords, or topics..."
							className={`${heyComic} min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-[var(--fq-search-text)] focus:shadow-none focus:outline-none focus:ring-0`}
						/>
						{query && (
							<button
								type="button"
								aria-label="Clear search"
								onClick={() => setQuery("")}
								className="text-[var(--fq-search-text)]"
							>
								✕
							</button>
						)}
					</form>
				</div>
				{visual}
			</section>
			<div className="mt-8 flex flex-col gap-8 xl:mt-0 xl:flex-row xl:items-start xl:gap-12">
				<div className="min-w-0 xl:w-[832px] xl:shrink-0">
					<div className="flex flex-col gap-7">
						<div className="flex flex-col gap-2">
							<h2 className={`${heyComic} text-base md:text-lg`}>
								{terms.length ? `RESULTS (${shown.length})` : "POPULAR QUESTIONS"}
							</h2>
							<span aria-hidden className="h-[2px] w-10 bg-[var(--ct-magenta)] md:w-12 xl:w-16" />
						</div>
						<p role="status" aria-live="polite" className="sr-only">
							{shown.length} question{shown.length === 1 ? "" : "s"} shown
						</p>
						{shown.length === 0 ? (
							<div className="flex flex-col gap-3 rounded-xl border border-[var(--ct-border)] bg-[var(--ct-card)] p-8 text-center">
								<p className={`${heyComic} text-lg`}>NO MATCHES</p>
								<p className="text-sm text-[var(--ct-text)]">
									We couldn&apos;t find an answer for &ldquo;{query}&rdquo;. Try a different word, or{" "}
									<Link href="/contact-us" className="text-[var(--ct-cyan)] underline">
										contact support
									</Link>
									.
								</p>
							</div>
						) : (
							<ul className="flex flex-col gap-3 xl:gap-4">
								{shown.map(({ f, i }) => {
									const isOpen = open === i;
									return (
										<li
											key={f.q}
											className={`rounded-xl border bg-[var(--ct-card)] p-4 transition-[border-color,box-shadow] duration-300 md:p-5 xl:p-6 ${isOpen ? "border-[var(--ct-cyan)] shadow-[0_0_8px_rgba(0,255,224,0.13)]" : "border-[var(--ct-border)]"}`}
										>
											<h3>
												<button
													type="button"
													aria-expanded={isOpen}
													aria-controls={`faq-${i}`}
													onClick={() => setOpen(isOpen ? null : i)}
													className="flex w-full items-center justify-between gap-4 text-left"
												>
													<span
														className={`${heyComic} text-sm md:text-[15px] ${isOpen ? "text-[var(--ct-cyan)]" : "text-white"}`}
													>
														{f.q}
													</span>
													<span
														aria-hidden
														className={`${bungee} text-xl ${isOpen ? "text-[var(--ct-cyan)]" : "text-[var(--ct-text)]"}`}
													>
														{isOpen ? "−" : "+"}
													</span>
												</button>
											</h3>
											{isOpen && (
												<div
													id={`faq-${i}`}
													role="region"
													className="wv-unfold mt-4 border-t border-[var(--ct-border)] pt-3 text-sm leading-[1.6] text-[var(--ct-text)]"
												>
													{f.a}
													{f.link && (
														<>
															{" "}
															<Link href={f.link.href} className="text-[var(--ct-cyan)] underline">
																{f.link.label}
															</Link>
														</>
													)}
												</div>
											)}
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</div>
				{aside}
			</div>
		</>
	);
}
