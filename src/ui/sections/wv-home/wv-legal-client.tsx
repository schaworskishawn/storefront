"use client";

import { ChevronDown, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

export type LegalSection = {
	id: string;
	title: string;
	body: string[];
	link?: { href: string; label: string };
};

/**
 * Table of contents + single-open accordion for legal pages. The open section is mirrored in the URL hash.
 *
 * Lit like the shipping page's answers, over a soft pink and cyan glow (`.wv-faq-glow`):
 * - each section is a glassy neon panel, pink while closed and glowing cyan once open, its title lifted and its +/− in a
 *   neon ring (`.wv-info-*`, `.wv-trust-*`);
 * - the heading is chrome 3D lettering over a glowing bar (`.wv-heading-*`);
 * - the table of contents and the help card are neon cards (`.wv-neon-card`) that don't lift (`.wv-legal-panel`), the
 *   section you're on lit in the list.
 */
function SupportCard({ text }: { text: string }) {
	return (
		<div className="wv-neon-card wv-neon-card--pink wv-legal-panel flex flex-col gap-5 rounded-2xl p-6 md:p-8">
			<div className="flex flex-col gap-2">
				<p className={`${bungee} wv-heading-title text-lg text-white`}>NEED HELP?</p>
				<span aria-hidden className="wv-hero-bar h-1 w-14 rounded-full" />
			</div>
			<p className={`${orbitron} wv-trust-text text-[13px] leading-[1.6]`}>{text}</p>
			<Link
				href="/contact-us"
				className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-6 text-sm text-[var(--wv-cyan-soft)] md:w-fit xl:w-full`}
			>
				<MessageCircle aria-hidden className="size-4" strokeWidth={2.5} />
				<span className="wv-btn-label">CONTACT SUPPORT</span>
			</Link>
		</div>
	);
}

export function LegalSections({
	sections,
	heading,
	supportText,
}: {
	sections: LegalSection[];
	heading: string;
	supportText: string;
}) {
	const support = <SupportCard text={supportText} />;
	const [open, setOpen] = useState<string>(sections[0].id);
	const [tocOpen, setTocOpen] = useState(false);

	/**
	 * Open a section and bring it into view. Opening it closes the one that was open above it (and the phone menu), which
	 * moves everything up, so the change is applied first (flushSync) and the scroll worked out from the new layout;
	 * worked out before, it would overshoot.
	 */
	const openAndShow = (id: string) => {
		flushSync(() => {
			setOpen(id);
			setTocOpen(false);
		});
		document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	useEffect(() => {
		// A link to a section (the hero's chips, or another page linking here). The first look runs just after mounting,
		// outside React's own work, where flushSync is allowed.
		const fromHash = () => {
			const id = window.location.hash.slice(1);
			if (sections.some((s) => s.id === id)) openAndShow(id);
		};
		const first = window.setTimeout(fromHash, 0);
		window.addEventListener("hashchange", fromHash);
		return () => {
			window.clearTimeout(first);
			window.removeEventListener("hashchange", fromHash);
		};
	}, [sections]);

	const go = (id: string) => {
		window.history.replaceState(null, "", `#${id}`);
		openAndShow(id);
	};
	const toggle = (id: string) => {
		const next = open === id ? "" : id;
		setOpen(next);
		window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
	};

	const current = sections.find((s) => s.id === open);

	return (
		<div className="wv-faq-glow flex flex-col gap-6 px-4 pb-10 md:px-6 xl:flex-row xl:gap-12 xl:px-20 xl:pb-16 xl:pt-6">
			{/* Desktop sidebar */}
			<aside
				className="hidden w-[320px] shrink-0 flex-col gap-6 xl:sticky xl:top-6 xl:flex xl:self-start"
				aria-label="Table of contents"
			>
				<nav className="wv-neon-card wv-legal-panel flex flex-col gap-4 rounded-2xl p-6">
					<div className="flex flex-col gap-2">
						<p className={`${bungee} wv-heading-title text-base text-white`}>ON THIS PAGE</p>
						<span aria-hidden className="wv-hero-bar h-1 w-14 rounded-full" />
					</div>
					<ol className={`${orbitron} flex flex-col gap-1 text-[13px] tracking-[0.5px]`}>
						{sections.map((s, i) => (
							<li key={s.id}>
								<a
									href={`#${s.id}`}
									onClick={(e) => (e.preventDefault(), go(s.id))}
									aria-current={open === s.id ? "location" : undefined}
									className="wv-legal-toc-link block rounded-lg px-3 py-2"
								>
									{i + 1}. {s.title}
								</a>
							</li>
						))}
					</ol>
				</nav>
				{support}
			</aside>

			{/* Tablet / mobile dropdown */}
			<div className="xl:hidden">
				<button
					type="button"
					aria-expanded={tocOpen}
					onClick={() => setTocOpen((v) => !v)}
					data-open={tocOpen}
					className={`${orbitron} wv-info-item flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs md:text-[13px]`}
				>
					<span className="min-w-0">
						<span className={`${heyComic} wv-trust-title`}>ON THIS PAGE</span>{" "}
						<span className="wv-hero-key ml-2">
							{current ? `${sections.indexOf(current) + 1}. ${current.title}` : "Sections"}
						</span>
					</span>
					<span aria-hidden className="wv-info-toggle">
						<ChevronDown
							className={`size-4 transition-transform ${tocOpen ? "rotate-180" : ""}`}
							strokeWidth={2.5}
						/>
					</span>
				</button>
				{tocOpen && (
					<ol
						className={`${orbitron} wv-neon-card wv-legal-panel wv-unfold mt-2 flex flex-col gap-1 rounded-xl p-3 text-[13px]`}
					>
						{sections.map((s, i) => (
							<li key={s.id}>
								<button
									type="button"
									onClick={() => go(s.id)}
									aria-current={open === s.id ? "location" : undefined}
									className="wv-legal-toc-link w-full rounded-lg px-3 py-2 text-left"
								>
									{i + 1}. {s.title}
								</button>
							</li>
						))}
					</ol>
				)}
			</div>

			{/* Sections */}
			<div className="flex min-w-0 flex-1 flex-col gap-6 xl:gap-7">
				<div className="flex flex-col gap-2">
					<h2 className={`${bungee} wv-heading-title text-lg uppercase text-white md:text-xl xl:text-2xl`}>
						{heading}
					</h2>
					<span
						aria-hidden
						className="wv-heading-bar mt-1 h-[3px] w-16 rounded-full bg-[var(--wv-cyan-soft)]"
					/>
				</div>
				<ul className="flex flex-col gap-3 xl:gap-4">
					{sections.map((s, i) => {
						const isOpen = open === s.id;
						return (
							<li
								key={s.id}
								id={s.id}
								data-open={isOpen}
								className="wv-info-item scroll-mt-6 rounded-xl p-4 md:p-5 xl:p-6"
							>
								<h3>
									<button
										type="button"
										aria-expanded={isOpen}
										aria-controls={`${s.id}-body`}
										onClick={() => toggle(s.id)}
										className="flex w-full items-center justify-between gap-4 text-left"
									>
										<span className={`${heyComic} wv-trust-title text-sm uppercase md:text-[15px]`}>
											{i + 1}. {s.title}
										</span>
										<span aria-hidden className="wv-info-toggle font-mono text-base">
											{isOpen ? "−" : "+"}
										</span>
									</button>
								</h3>
								{isOpen && (
									<div
										id={`${s.id}-body`}
										role="region"
										className={`${orbitron} wv-trust-text wv-unfold mt-4 flex flex-col gap-3 border-t border-[var(--lg-border)] pt-3 text-sm leading-[1.6]`}
									>
										{s.body.map((p) => (
											<p key={p}>{p}</p>
										))}
										{s.link && (
											<p>
												<Link href={s.link.href} className="wv-hero-key underline underline-offset-4">
													{s.link.label}
												</Link>
											</p>
										)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
				<div className="xl:hidden">{support}</div>
			</div>
		</div>
	);
}
