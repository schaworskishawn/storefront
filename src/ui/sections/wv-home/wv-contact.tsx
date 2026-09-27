import Image from "next/image";
import Link from "next/link";
import { whatsappHref } from "@/lib/whatsapp";
import { ContactForm } from "./wv-contact-form";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** Worldwide Vapor contact page — Figma "6.13 - High Fidelity - Contact Us" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUPPORT = "support@worldwidevapor.com";

const HELP_LINKS = [
	{ icon: "help", title: "FAQs", text: "Find answers to common questions", href: "/faqs" },
	{ icon: "ship", title: "Shipping Information", text: "Delivery times and policies", href: "/shipping" },
	{ icon: "returns", title: "Returns & Refunds", text: "Return policy and process", href: "/returns" },
	{
		icon: "package",
		title: "Track Your Order",
		text: "Check the status of your order",
		href: `mailto:${SUPPORT}?subject=Track%20my%20order&body=Order%20number%3A`,
	},
];

const BADGES = [
	{ icon: "truck", title: "Fast Shipping", text: "Dispatched within 24 hours" },
	{ icon: "lock", title: "Secure Payments", text: "100% SSL protected" },
	{ icon: "support", title: "Dedicated Support", text: "We are always here to help" },
	{ icon: "award", title: "Quality Guarantee", text: "All products fully certified" },
];

function MethodCard({
	tone,
	icon,
	title,
	headline,
	sub,
	href,
	external,
}: {
	tone: "cyan" | "magenta";
	icon: string;
	title: string;
	headline: string;
	sub: string;
	href?: string;
	external?: boolean;
}) {
	const color = tone === "cyan" ? "text-[var(--ct-cyan)]" : "text-[var(--ct-magenta)]";
	const inner = (
		<>
			<span
				className={`absolute -right-px -top-px size-3 opacity-30 ${tone === "cyan" ? "bg-[var(--ct-cyan)]" : "bg-[var(--ct-magenta)]"}`}
			/>
			<span
				className={`flex size-10 items-center justify-center rounded-md border bg-[var(--ct-icon)] ${tone === "cyan" ? "border-[var(--ct-cyan)]" : "border-[var(--ct-magenta)]"}`}
			>
				<Image src={`/home/contact/${icon}.svg`} alt="" width={20} height={20} />
			</span>
			<span className="flex flex-col gap-[6px]">
				<span className={`${bungee} text-[11px] text-white`}>{title}</span>
				<span className={`${heyComic} break-words text-sm ${color}`}>{headline}</span>
				<span className={`${orbitron} text-xs text-[var(--ct-text)]`}>{sub}</span>
			</span>
		</>
	);
	const cls = `relative flex flex-col gap-4 overflow-hidden rounded-lg border bg-[var(--ct-card)] p-5 md:p-4 xl:p-6 ${tone === "cyan" ? "border-[var(--ct-cyan)]/15" : "border-[var(--ct-magenta)]/15"}`;
	if (!href) return <div className={cls}>{inner}</div>;
	return (
		<a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={cls}>
			{inner}
		</a>
	);
}

export function WvContact() {
	const chat = whatsappHref();
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--ct-bg)] text-white">
			<div
				aria-hidden
				className="bg-[var(--wv-purple)]/20 pointer-events-none absolute left-0 top-0 size-[400px] rounded-full blur-[100px]"
			/>
			<div className="relative">
				<WvHeader />

				{/* Hero */}
				<section className="flex flex-col gap-6 px-4 py-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-8 md:py-16 xl:px-20 xl:py-[105px]">
					<div className="flex max-w-[640px] flex-col gap-5 xl:gap-6">
						<nav
							aria-label="Breadcrumb"
							className={`${orbitron} flex items-center gap-2 text-[11px] font-bold uppercase`}
						>
							<Link href="/home" className="text-[var(--ct-placeholder)]">
								Home
							</Link>
							<Image src="/home/contact/crumb.svg" alt="" width={8} height={8} />
							<span aria-current="page" className="text-[var(--ct-cyan)]">
								Contact Us
							</span>
						</nav>
						<div className="flex flex-col gap-2">
							<h1 className={`${bungee} text-[26px] leading-none md:text-4xl xl:text-5xl`}>
								CONTACT <span className="text-[var(--ct-cyan)]">US</span>
							</h1>
							<span aria-hidden className="h-[2px] w-[70px] bg-[var(--ct-cyan)] md:w-[90px] xl:w-[120px]" />
						</div>
						<p className={`${orbitron} text-sm leading-[1.6] text-[var(--ct-text)] xl:text-base`}>
							We&apos;re here to help! Reach out to us with any questions about our products, orders, or
							anything vaping related.
						</p>
					</div>
					<div className="border-[var(--ct-cyan)]/15 relative h-[150px] w-full shrink-0 overflow-hidden rounded-2xl border md:h-[236px] md:w-[240px] xl:h-[240px] xl:w-[400px]">
						<Image
							src="/home/contact/hero.png"
							alt="Neon email, chat and phone icons over a support console"
							fill
							priority
							sizes="(min-width: 1280px) 400px, (min-width: 768px) 240px, 328px"
							className="object-cover"
						/>
					</div>
				</section>

				{/* Methods */}
				<section className="grid gap-4 px-4 py-2 md:grid-cols-3 md:gap-6 md:px-8 md:py-4 xl:px-20 xl:py-6">
					<MethodCard
						tone="cyan"
						icon="mail"
						title="EMAIL US"
						headline={SUPPORT}
						sub="We typically reply within 24 hours"
						href={`mailto:${SUPPORT}`}
					/>
					<MethodCard
						tone="cyan"
						icon="chat"
						title="LIVE CHAT"
						headline="Chat with our support team"
						sub="Monday–Sunday"
						href={chat ?? undefined}
						external
					/>
					<MethodCard
						tone="magenta"
						icon="pin"
						title="OUR LOCATION"
						headline="123 Vapor Way, Vapecrest, NY 10001"
						sub="United States"
					/>
				</section>

				{/* Form + help */}
				<section className="flex flex-col gap-8 px-4 py-6 md:px-8 md:py-8 xl:flex-row xl:gap-12 xl:px-20 xl:py-12">
					<div className="flex flex-col gap-6 rounded-xl border border-[var(--ct-border)] bg-[var(--ct-card)] p-5 md:p-6 xl:w-[740px] xl:shrink-0 xl:gap-7 xl:p-8">
						<div className="flex flex-col gap-[6px]">
							<h2 className={`${bungee} text-base`}>SEND US A MESSAGE</h2>
							<span aria-hidden className="h-[2px] w-16 bg-[var(--ct-cyan)]" />
						</div>
						<ContactForm whatsapp={chat} />
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-6">
						<div className="flex flex-col gap-2">
							<h2 className="font-[family-name:var(--font-bungee)] text-base">BEFORE YOU CONTACT US</h2>
							<p className="text-sm text-[var(--ct-text)]">
								You may find your answer faster in our Help Center.
							</p>
						</div>
						<ul className="flex flex-col gap-3">
							{HELP_LINKS.map((h) => (
								<li key={h.title}>
									<a
										href={h.href}
										className="flex items-center gap-4 rounded-lg border border-[var(--ct-border)] bg-[var(--ct-card)] p-4"
									>
										<span className="flex size-9 shrink-0 items-center justify-center rounded bg-[var(--ct-icon)]">
											<Image src={`/home/contact/${h.icon}.svg`} alt="" width={18} height={18} />
										</span>
										<span className="flex min-w-0 flex-1 flex-col gap-1">
											<span className={`${heyComic} text-sm`}>{h.title}</span>
											<span className={`${orbitron} text-xs text-[var(--ct-text)]`}>{h.text}</span>
										</span>
										<Image src="/home/contact/arrow.svg" alt="" width={16} height={16} className="shrink-0" />
									</a>
								</li>
							))}
						</ul>
						<Link
							href="/learn"
							className={`${heyComic} flex items-center justify-center rounded border-[1.5px] border-[var(--ct-cyan)] px-7 py-[14px] text-xs uppercase text-[var(--ct-cyan)]`}
						>
							Visit Help Center
						</Link>
					</div>
				</section>

				{/* Trust badges */}
				<ul className="grid gap-3 px-4 py-8 md:grid-cols-4 md:gap-4 md:px-8 xl:gap-6 xl:px-20 xl:py-12">
					{BADGES.map((b) => (
						<li
							key={b.title}
							className="flex items-center gap-4 rounded-lg border border-[var(--ct-border)] bg-[var(--ct-card)] p-4 xl:p-5"
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
