import Image from "next/image";
import Link from "next/link";
import { AgeGate } from "./wv-age-form";
import "./wv-home.css";

/** Worldwide Vapor age gate — full-screen version of Figma "6.15 - High Fidelity - Age Verification". */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const NOTICES = [
	{
		icon: "mail",
		tone: "cyan",
		title: "Nicotine Warning",
		text: "Nicotine is highly addictive. Use responsibly.",
	},
	{
		icon: "chat",
		tone: "cyan",
		title: "Privacy Assured",
		text: "Your date of birth is never stored or sent.",
	},
	{
		icon: "pin",
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
					className="relative block h-[70px] w-[140px] md:h-[90px] md:w-[180px]"
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

				<div className="w-full max-w-[620px] rounded-[13px] p-px shadow-[0_0_60px_rgba(0,255,224,0.12)] [background:linear-gradient(135deg,var(--ct-cyan),transparent_35%,transparent_65%,var(--ct-magenta))]">
					<h1 className="sr-only">Age verification</h1>
					<AgeGate />
				</div>

				<ul className="grid w-full gap-3 md:grid-cols-3">
					{NOTICES.map((n) => (
						<li
							key={n.title}
							className="bg-[var(--ct-card)]/80 flex items-start gap-3 rounded-lg border border-[var(--ct-border)] p-3 backdrop-blur"
						>
							<span
								className={`flex size-8 shrink-0 items-center justify-center rounded-md border bg-[var(--ct-icon)] ${n.tone === "cyan" ? "border-[var(--ct-cyan)]" : "border-[var(--ct-magenta)]"}`}
							>
								<Image src={`/home/contact/${n.icon}.svg`} alt="" width={16} height={16} />
							</span>
							<span className="flex min-w-0 flex-col gap-[2px]">
								<span
									className={`${heyComic} text-xs ${n.tone === "cyan" ? "text-[var(--ct-cyan)]" : "text-[var(--ct-magenta)]"}`}
								>
									{n.title}
								</span>
								<span className={`${orbitron} text-[11px] leading-[1.4] text-[var(--ct-text)]`}>
									{n.text}
								</span>
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
