"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

export type LegalSection = {
	id: string;
	title: string;
	body: string[];
	link?: { href: string; label: string };
};

/** Table of contents + single-open accordion for legal pages. The open section is mirrored in the URL hash. */
function SupportCard({ text }: { text: string }) {
	return (
		<div className="flex flex-col gap-5 rounded-2xl border border-[var(--wv-purple)] bg-[var(--lg-card)] p-6 shadow-[0_0_12px_rgba(217,0,255,0.07)] md:p-8">
			<div className="flex flex-col gap-2">
				<p className={`${heyComic} text-base`}>NEED HELP?</p>
				<span aria-hidden className="h-[2px] w-12 bg-[var(--wv-purple)]" />
			</div>
			<p className={`${orbitron} text-[13px] leading-[1.5] text-[var(--lg-body)]`}>{text}</p>
			<Link href="/contact-us" className={`${heyComic} text-xs uppercase text-[var(--wv-cyan)] underline`}>
				Contact support
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

	useEffect(() => {
		const fromHash = () => {
			const id = window.location.hash.slice(1);
			if (sections.some((s) => s.id === id)) setOpen(id);
		};
		fromHash();
		window.addEventListener("hashchange", fromHash);
		return () => window.removeEventListener("hashchange", fromHash);
	}, [sections]);

	const go = (id: string) => {
		setOpen(id);
		setTocOpen(false);
		window.history.replaceState(null, "", `#${id}`);
		document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
	};
	const toggle = (id: string) => {
		const next = open === id ? "" : id;
		setOpen(next);
		window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
	};

	const current = sections.find((s) => s.id === open);

	return (
		<div className="flex flex-col gap-6 px-4 pb-10 md:px-6 xl:flex-row xl:gap-12 xl:px-20 xl:pb-16 xl:pt-6">
			{/* Desktop sidebar */}
			<aside
				className="hidden w-[320px] shrink-0 flex-col gap-6 xl:sticky xl:top-6 xl:flex xl:self-start"
				aria-label="Table of contents"
			>
				<nav className="flex flex-col gap-4 rounded-2xl border border-[var(--lg-border)] bg-[var(--lg-card)] p-6">
					<p className={`${bungee} text-sm tracking-[0.5px]`}>ON THIS PAGE</p>
					<hr className="border-[var(--lg-border)]" />
					<ol className={`${orbitron} flex flex-col gap-3 text-[13px] tracking-[0.5px]`}>
						{sections.map((s, i) => (
							<li key={s.id}>
								<a
									href={`#${s.id}`}
									onClick={(e) => (e.preventDefault(), go(s.id))}
									className={
										open === s.id
											? "font-bold text-[var(--wv-cyan)]"
											: "text-[var(--lg-body)] hover:text-white"
									}
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
					className={`${orbitron} flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--lg-border)] bg-[var(--lg-card)] px-4 py-3 text-xs md:text-[13px]`}
				>
					<span>
						<span className="font-bold">ON THIS PAGE</span>{" "}
						<span className="ml-2 text-[var(--wv-cyan)]">
							{current ? `${sections.indexOf(current) + 1}. ${current.title}` : "Sections"}
						</span>
					</span>
					<span aria-hidden className={`transition-transform ${tocOpen ? "rotate-180" : ""}`}>
						⌄
					</span>
				</button>
				{tocOpen && (
					<ol
						className={`${orbitron} mt-2 flex flex-col gap-1 rounded-xl border border-[var(--lg-border)] bg-[var(--lg-card)] p-3 text-[13px]`}
					>
						{sections.map((s, i) => (
							<li key={s.id}>
								<button
									type="button"
									onClick={() => go(s.id)}
									className={`w-full rounded-md px-3 py-2 text-left ${open === s.id ? "font-bold text-[var(--wv-cyan)]" : "text-[var(--lg-body)]"}`}
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
					<h2 className={`${heyComic} text-base uppercase md:text-lg`}>{heading}</h2>
					<span aria-hidden className="h-[2px] w-12 bg-[var(--wv-cyan)] xl:w-16" />
				</div>
				<ul className="flex flex-col gap-3 xl:gap-4">
					{sections.map((s, i) => {
						const isOpen = open === s.id;
						return (
							<li
								key={s.id}
								id={s.id}
								className={`scroll-mt-6 rounded-xl border bg-[var(--lg-card)] p-4 md:p-5 xl:p-6 ${isOpen ? "border-[var(--wv-cyan-soft)] shadow-[0_0_8px_rgba(0,255,224,0.13)]" : "border-[var(--lg-border)]"}`}
							>
								<h3>
									<button
										type="button"
										aria-expanded={isOpen}
										aria-controls={`${s.id}-body`}
										onClick={() => toggle(s.id)}
										className="flex w-full items-center justify-between gap-4 text-left"
									>
										<span
											className={`${heyComic} text-sm uppercase md:text-[15px] ${isOpen ? "text-[var(--wv-cyan)]" : "text-white"}`}
										>
											{i + 1}. {s.title}
										</span>
										<span
											aria-hidden
											className={`${bungee} text-xl ${isOpen ? "text-[var(--wv-cyan)]" : "text-[var(--lg-body)]"}`}
										>
											{isOpen ? "−" : "+"}
										</span>
									</button>
								</h3>
								{isOpen && (
									<div
										id={`${s.id}-body`}
										role="region"
										className={`${orbitron} mt-4 flex flex-col gap-3 border-t border-[var(--lg-border)] pt-3 text-sm leading-[1.6] text-[var(--lg-body)]`}
									>
										{s.body.map((p) => (
											<p key={p}>{p}</p>
										))}
										{s.link && (
											<p>
												<Link href={s.link.href} className="text-[var(--wv-cyan)] underline">
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
