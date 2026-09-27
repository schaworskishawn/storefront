import Image from "next/image";
import { whatsappHref } from "@/lib/whatsapp";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** Worldwide Vapor returns page — Figma "6.12 - High Fidelity - Returns" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUPPORT = "support@worldwidevapor.com";
const START_HREF = `mailto:${SUPPORT}?subject=Start%20a%20return&body=Order%20number%3A%0AItem(s)%20to%20return%3A%0AReason%3A`;
const STATUS_HREF = `mailto:${SUPPORT}?subject=Return%20status&body=Order%20number%3A`;
const HELP_HREF = `mailto:${SUPPORT}?subject=Returns%20help`;

const TOP_BADGES = [
	{
		icon: "calendar",
		title: "15-DAY RETURN WINDOW",
		text: "Returns accepted within 15 days of delivery date.",
	},
	{ icon: "shield", title: "EASY & HASSLE-FREE", text: "Simple process with clear digital steps." },
	{ icon: "zap", title: "QUALITY GUARANTEED", text: "Damaged or defective items are fully covered." },
];
const BOTTOM_BADGES = [
	{ icon: "truck", title: "FAST SHIPPING", text: "Dispatched within 24 hours." },
	{ icon: "lock", title: "SECURE PAYMENT", text: "100% SSL protected payments." },
	{ icon: "support", title: "EXPERT SUPPORT", text: "We are always here to help." },
];

const STEPS = [
	{ n: "01", title: "START RETURN", text: "Submit return request with your order details." },
	{ n: "02", title: "PACK YOUR ITEM", text: "Securely pack the items in original packaging." },
	{ n: "03", title: "SHIP YOUR RETURN", text: "Print the label and drop off at local carrier." },
	{ n: "04", title: "RECEIVE REFUND", text: "We process, inspect and credit your account." },
];

const FAQS = [
	{
		q: "HOW LONG DOES A REFUND TAKE TO PROCESS?",
		a: "Once your package is scanned at our facility, refunds are issued within 3-5 business days to your original payment method.",
	},
	{
		q: "ARE THERE FEES FOR RETURN SHIPPING?",
		a: "No hidden restocking fees. For standard returns within 15 days, we provide a prepaid label and deduct a flat $4.99 return postage fee.",
	},
	{
		q: "CAN I EXCHANGE AN ITEM INSTEAD OF A REFUND?",
		a: "Absolutely. Choose exchange when initiating your digital return to receive immediate store credit or reserve your replacement item.",
	},
	{
		q: "WHAT ITEMS ARE ELIGIBLE FOR RETURN?",
		a: "Unopened hardware, sealed coils, and unused accessories in original condition are fully eligible for return within 15 days.",
	},
];

const NOT_ELIGIBLE = [
	"E-liquids that have been opened or unsealed",
	"Disposable pods/devices once unboxed or unpackaged",
	"Clearance, final sale, or promotional mystery items",
];

function Badge({ b }: { b: { icon: string; title: string; text: string } }) {
	return (
		<li className="flex items-center gap-4 p-4">
			<span className="border-[var(--rt-cyan)]/20 bg-[var(--rt-cyan)]/[0.06] flex size-12 shrink-0 items-center justify-center rounded-full border">
				<Image src={`/home/returns/${b.icon}.svg`} alt="" width={20} height={20} />
			</span>
			<span className="flex min-w-0 flex-col gap-1">
				<span className={`${heyComic} text-xs`}>{b.title}</span>
				<span className={`${orbitron} text-[13px] leading-[1.4] text-[var(--rt-text)]`}>{b.text}</span>
			</span>
		</li>
	);
}

const primary = `${heyComic} flex h-[49px] items-center justify-center rounded-lg bg-[var(--rt-cyan)] px-7 text-[13px] text-[var(--rt-bg)] shadow-[0_0_8px_rgba(0,255,224,0.4)]`;
const secondary = `${heyComic} flex h-[49px] items-center justify-center rounded-lg border-[1.5px] border-[var(--rt-cyan)] px-7 text-[13px] text-[var(--rt-cyan)]`;

export function WvReturns() {
	const chat = whatsappHref("Hi Worldwide Vapor, I need help with a return.");
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--rt-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			<section className="flex flex-col gap-8 px-4 py-8 md:px-10 md:py-12 xl:flex-row-reverse xl:items-center xl:gap-20 xl:p-20">
				<div className="border-[var(--rt-magenta)]/20 relative h-[180px] w-full shrink-0 overflow-hidden rounded-3xl border-[1.5px] bg-[var(--rt-card)] shadow-[0_0_24px_rgba(255,0,160,0.13)] md:h-[260px] xl:h-[400px] xl:w-[560px]">
					<Image
						src="/home/returns/hero.png"
						alt="A parcel returning through a secure logistics network"
						fill
						priority
						sizes="(min-width: 1280px) 560px, 100vw"
						className="object-cover"
					/>
					<div className="bg-[var(--rt-purple)]/15 absolute inset-0" />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-6 xl:gap-8">
					<div className="flex flex-col gap-3 md:items-center md:text-center xl:items-start xl:text-left">
						<p className={`${bungee} text-xs text-[var(--rt-magenta)]`}>
							SECURE SYSTEM // RETURNS &amp; REFUNDS
						</p>
						<h1 className={`${heyComic} text-[28px] leading-[1.1] md:text-[44px] xl:text-[56px]`}>
							RETURNS &amp; REFUNDS
						</h1>
					</div>
					<p
						className={`${orbitron} text-sm leading-[1.6] text-[var(--rt-text)] md:text-center md:text-base xl:text-left`}
					>
						We want you to be 100% satisfied with your purchase. If something isn&apos;t right, we are here to
						help you get it sorted immediately with zero stress.
					</p>
					<div className="flex flex-col gap-3 md:flex-row md:justify-center xl:justify-start xl:gap-4">
						<a href={START_HREF} className={`${primary} hidden md:flex`}>
							START A RETURN
						</a>
						<a href={STATUS_HREF} className={`${secondary} w-full md:w-auto`}>
							VIEW STATUS
						</a>
					</div>
				</div>
			</section>

			{/* Top badges */}
			<ul className="grid gap-3 border-y border-[var(--rt-border)] bg-[var(--rt-band)] px-4 py-8 md:grid-cols-3 md:gap-4 md:px-10 xl:gap-10 xl:px-20">
				{TOP_BADGES.map((b) => (
					<Badge key={b.title} b={b} />
				))}
			</ul>

			{/* How it works */}
			<section className="flex flex-col items-center gap-8 px-4 py-12 md:px-10 md:py-16 xl:gap-14 xl:px-20 xl:py-24">
				<div className="flex flex-col items-center gap-3 text-center xl:gap-4">
					<p className={`${bungee} text-xs text-[var(--rt-magenta)]`}>WORLDWIDE VAPOR</p>
					<h2 className={`${heyComic} text-2xl md:text-3xl xl:text-4xl`}>HOW RETURNS WORK</h2>
				</div>
				<ol className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
					{STEPS.map((s) => (
						<li
							key={s.n}
							className="border-[var(--rt-cyan)]/20 flex flex-col gap-5 rounded-xl border bg-[var(--rt-card)] p-6 shadow-[inset_0_1px_8px_rgba(0,255,224,0.06)]"
						>
							<div className="flex items-center justify-between">
								<span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-r from-[var(--rt-magenta)] to-[var(--rt-purple)] text-sm font-extrabold">
									{s.n}
								</span>
								<span aria-hidden className="bg-[var(--rt-cyan)]/25 h-px w-10" />
							</div>
							<div className="flex flex-col gap-2">
								<h3 className={`${heyComic} text-sm`}>{s.title}</h3>
								<p className={`${orbitron} text-[13px] leading-[1.5] text-[var(--rt-text)]`}>{s.text}</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{/* FAQ + eligibility */}
			<section className="flex flex-col gap-10 border-y border-[var(--rt-border)] bg-[var(--rt-band)] px-4 py-12 md:px-10 md:py-16 xl:flex-row xl:gap-20 xl:p-20">
				<div className="flex min-w-0 flex-1 flex-col gap-6 xl:gap-8">
					<h2 className="font-[family-name:var(--font-bungee)] text-xl md:text-2xl">RETURN POLICY FAQ</h2>
					<div className="flex flex-col gap-4">
						{FAQS.map((f, i) => (
							<details
								key={f.q}
								open={i === 0}
								className="group rounded-lg border border-[var(--rt-border)] bg-[var(--rt-card)] p-5"
							>
								<summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
									<span className={`${heyComic} text-xs`}>{f.q}</span>
									<Image
										src="/home/returns/chevron.svg"
										alt=""
										width={16}
										height={16}
										className="shrink-0 transition-transform group-open:rotate-180"
									/>
								</summary>
								<p className={`${orbitron} mt-3 text-sm leading-[1.5] text-[var(--rt-text)]`}>{f.a}</p>
							</details>
						))}
					</div>
				</div>
				<aside
					className="border-[var(--rt-magenta)]/20 flex flex-col gap-8 rounded-2xl border-[1.5px] bg-[var(--rt-card)] p-6 shadow-[0_0_8px_rgba(255,0,160,0.07)] md:p-10 xl:flex-1 xl:self-start"
					aria-labelledby="not-eligible"
				>
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-[10px]">
							<Image src="/home/returns/alert.svg" alt="" width={20} height={20} />
							<h2 id="not-eligible" className={`${bungee} text-base`}>
								NOT ELIGIBLE FOR RETURN
							</h2>
						</div>
						<hr className="border-[var(--rt-magenta)]/20" />
					</div>
					<ul className="flex flex-col gap-5">
						{NOT_ELIGIBLE.map((t) => (
							<li
								key={t}
								className={`${orbitron} flex items-center gap-3 text-sm leading-[1.4] text-[var(--rt-text)]`}
							>
								<span aria-hidden className="size-[6px] shrink-0 rounded-[3px] bg-[var(--rt-magenta)]" />
								{t}
							</li>
						))}
					</ul>
					<p className={`${heyComic} text-xs leading-[1.5] text-[var(--rt-muted)]`}>
						Due to strict sanitation, safety, and health regulations, the items specified above cannot be
						returned once unsealed. Please double check model compatibility before unboxing.
					</p>
				</aside>
			</section>

			{/* Need help */}
			<section className="flex justify-center px-4 py-12 md:px-10 md:py-16 xl:px-20 xl:py-24">
				<div className="border-[var(--rt-cyan)]/20 flex w-full max-w-[800px] flex-col items-center gap-6 rounded-2xl border bg-[var(--rt-card)] p-6 text-center shadow-[0_0_16px_rgba(0,255,224,0.07)] md:p-10 xl:gap-9 xl:p-12">
					<div className="flex flex-col gap-3">
						<h2 className={`${bungee} text-xl xl:text-2xl`}>NEED HELP?</h2>
						<p className={`${orbitron} text-sm text-[var(--rt-text)]`}>
							Contact our support team and we will guide you step by step.
						</p>
					</div>
					<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:gap-4">
						<a href={HELP_HREF} className={secondary}>
							EMAIL US
						</a>
						{chat ? (
							<a href={chat} target="_blank" rel="noopener noreferrer" className={primary}>
								LIVE CHAT
							</a>
						) : (
							<a href={START_HREF} className={`${primary} hidden md:flex`}>
								START A RETURN
							</a>
						)}
					</div>
				</div>
			</section>

			{/* Bottom badges */}
			<ul className="grid gap-3 border-t border-[var(--rt-border)] bg-[var(--rt-band)] px-4 py-8 md:grid-cols-3 md:gap-4 md:px-10 xl:gap-10 xl:px-20 xl:py-10">
				{BOTTOM_BADGES.map((b) => (
					<Badge key={b.title} b={b} />
				))}
			</ul>

			<WvFooter />
		</div>
	);
}
