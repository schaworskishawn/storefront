import Image from "next/image";
import Link from "next/link";
import { WvFooter, WvHeader } from "./wv-chrome";
import { LegalSections, type LegalSection } from "./wv-legal-client";
import "./wv-home.css";

/** Shared legal page layout — Figma "6.16 - High Fidelity - Terms and Conditions" (also used for Privacy). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const BADGES = [
	{ icon: "truck", title: "Fast Shipping", text: "Dispatched within 24 hours" },
	{ icon: "lock", title: "Secure Payments", text: "100% SSL protected" },
	{ icon: "support", title: "Dedicated Support", text: "We are always here to help" },
	{ icon: "award", title: "Quality Guarantee", text: "All products fully certified" },
];

export function WvLegal({
	crumb,
	titleLead,
	titleAccent,
	updated,
	intro,
	sectionsHeading,
	supportText,
	sections,
	image,
	accent = "magenta",
}: {
	crumb: string;
	titleLead: string;
	titleAccent: string;
	updated: string;
	intro: string;
	sectionsHeading: string;
	supportText: string;
	sections: LegalSection[];
	image: string;
	accent?: "magenta" | "cyan";
}) {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--ct-bg)] text-white">
			<div
				aria-hidden
				className="bg-[var(--wv-purple)]/20 pointer-events-none absolute -left-24 -top-24 size-[400px] rounded-full blur-[110px] xl:left-0 xl:top-0 xl:size-[500px]"
			/>
			<div
				aria-hidden
				className="bg-[var(--ct-cyan)]/5 pointer-events-none absolute right-0 top-[400px] hidden size-[450px] rounded-full blur-[110px] md:block xl:size-[600px]"
			/>
			<div className="relative">
				<WvHeader />

				<nav
					aria-label="Breadcrumb"
					className={`${orbitron} flex items-center gap-2 px-4 py-4 text-[11px] text-[var(--ct-placeholder)] md:px-6 xl:px-20 xl:py-6 xl:text-xs`}
				>
					<Link href="/home">Home</Link>
					<span aria-hidden>›</span>
					<span aria-current="page" className="text-[var(--wv-cyan)]">
						{crumb}
					</span>
				</nav>

				<section className="flex flex-col gap-6 px-4 pb-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-6 xl:px-20 xl:pb-12 xl:pt-5">
					<div className="flex max-w-[750px] flex-col gap-5 xl:gap-6">
						<div className="flex flex-col gap-3">
							<h1
								className={`${heyComic} text-[26px] leading-[30px] md:text-[34px] md:leading-10 xl:text-[44px] xl:leading-[52px]`}
							>
								{titleLead}{" "}
								<span className={accent === "magenta" ? "text-[var(--ct-magenta)]" : "text-[var(--wv-cyan)]"}>
									{titleAccent}
								</span>
							</h1>
							<span aria-hidden className="h-[2px] w-[100px] bg-[var(--wv-cyan-soft)] md:w-[120px] xl:w-40" />
						</div>
						<p
							className={`${orbitron} text-xs font-semibold tracking-[1px] text-[var(--wv-cyan)] md:text-sm`}
						>
							LAST UPDATED: {updated}
						</p>
						<p className={`${orbitron} text-sm leading-[1.6] text-[var(--lg-body)] xl:text-[15px]`}>
							{intro}
						</p>
					</div>
					<div className="relative h-[137px] w-full shrink-0 overflow-hidden rounded-2xl border border-[var(--wv-cyan-soft)] md:h-[180px] md:w-[200px] xl:h-[260px] xl:w-[400px]">
						<Image
							src={image}
							alt=""
							fill
							priority
							sizes="(min-width: 1280px) 400px, (min-width: 768px) 200px, 328px"
							className="object-cover"
						/>
					</div>
				</section>

				<LegalSections sections={sections} heading={sectionsHeading} supportText={supportText} />

				<ul className="grid gap-3 px-4 pb-10 md:grid-cols-2 md:gap-3 md:px-6 xl:hidden">
					{BADGES.map((b) => (
						<li
							key={b.title}
							className="flex items-center gap-4 rounded-lg border border-[var(--ct-border)] bg-[var(--ct-card)] p-4"
						>
							<span aria-hidden className="h-8 w-[3px] shrink-0 rounded-[2px] bg-[var(--ct-cyan)]" />
							<span className="flex min-w-0 flex-col gap-1">
								<span className={`${heyComic} flex items-center gap-[6px] text-[13px]`}>
									<Image src={`/home/contact/${b.icon}.svg`} alt="" width={14} height={14} />
									{b.title}
								</span>
								<span className={`${orbitron} text-xs text-[var(--ct-text)]`}>{b.text}</span>
							</span>
						</li>
					))}
				</ul>

				<WvFooter />
			</div>
		</div>
	);
}
