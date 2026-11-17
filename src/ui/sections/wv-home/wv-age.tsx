import { BadgeCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AgeGate } from "./wv-age-form";
import "./wv-home.css";

/** Worldwide Vapor age gate — full-screen version of Figma "6.15 - High Fidelity - Age Verification". */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

/** The notes under the gate, each led by its icon in a neon tile (`.wv-age-notice*` in wv-home.css). */
const NOTICES = [
	{
		Icon: TriangleAlert,
		tone: "cyan",
		title: "Nicotine Warning",
		text: "Nicotine is highly addictive. Use responsibly.",
	},
	{
		Icon: ShieldCheck,
		tone: "cyan",
		title: "Privacy Assured",
		text: "Your date of birth is never stored or sent.",
	},
	{
		Icon: BadgeCheck,
		tone: "magenta",
		title: "Valid ID Required",
		text: "Age may be confirmed with government ID at delivery.",
	},
] as const;

export function WvAgeVerification() {
	return (
		<div className="relative flex min-h-dvh flex-col items-center overflow-x-clip bg-[var(--ct-bg)] px-4 py-8 text-white md:py-12">
			{/* Backdrop */}
			<Image
				src="/home/contact/hero.png"
				alt=""
				fill
				priority
				sizes="100vw"
				className="pointer-events-none object-cover opacity-20 blur-sm"
			/>
			<div
				aria-hidden
				className="via-[var(--ct-bg)]/70 pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--ct-bg)] to-[var(--ct-bg)]"
			/>
			<div
				aria-hidden
				className="bg-[var(--wv-purple)]/30 pointer-events-none absolute -left-24 top-10 size-[380px] rounded-full blur-[110px]"
			/>
			<div
				aria-hidden
				className="bg-[var(--ct-cyan)]/10 pointer-events-none absolute -right-24 bottom-24 size-[380px] rounded-full blur-[110px]"
			/>

			<div className="relative flex w-full max-w-[680px] flex-1 flex-col items-center justify-center gap-8">
				<Link
					href="/home"
					aria-label="Worldwide Vapor home"
					className="wv-header-logo relative block h-[70px] w-[140px] md:h-[90px] md:w-[180px]"
				>
					<Image
						src="/home/imgBrand.png"
						alt="Worldwide Vapor"
						fill
						sizes="180px"
						className="object-contain"
						priority
					/>
				</Link>

				{/* The gate in a glowing cyan-through-purple-to-pink frame (`.wv-age-frame`). */}
				<div className="wv-age-frame w-full max-w-[620px] rounded-[15px] p-[1.5px]">
					<h1 className="sr-only">Age verification</h1>
					<AgeGate />
				</div>

				<ul className="grid w-full gap-3 md:grid-cols-3">
					{NOTICES.map(({ Icon, ...n }) => (
						<li
							key={n.title}
							data-tone={n.tone}
							className="wv-age-notice flex items-start gap-3 rounded-xl p-3 backdrop-blur"
						>
							<span
								aria-hidden
								className="wv-age-notice-icon flex size-9 shrink-0 items-center justify-center rounded-lg"
							>
								<Icon className="size-4" strokeWidth={2.25} />
							</span>
							<span className="flex min-w-0 flex-col gap-[2px]">
								<span className={`${heyComic} wv-age-notice-title text-xs`}>{n.title}</span>
								<span className={`${orbitron} wv-hero-copy text-[11px] leading-[1.4]`}>{n.text}</span>
							</span>
						</li>
					))}
				</ul>
			</div>

			<p className={`${orbitron} relative mt-8 text-center text-[11px] text-[var(--ct-placeholder)]`}>
				© 2026 Worldwide Vapor ·{" "}
				<Link href="/contact-us" className="underline">
					Contact
				</Link>{" "}
				·{" "}
				<Link href="/returns" className="underline">
					Returns
				</Link>{" "}
				· FDA compliant · 256-bit SSL
			</p>
		</div>
	);
}
