import Image from "next/image";
import { type UnlockState } from "@/lib/site-password";
import { SitePasswordForm } from "./wv-site-password-form";
import "./wv-home.css";

/** Full-screen password gate, styled to match the age-verification page. Only shown while SITE_PASSWORD is set. */

export function WvSitePassword({
	unlock,
}: {
	unlock: (previous: UnlockState, formData: FormData) => Promise<UnlockState>;
}) {
	return (
		<div className="relative flex min-h-dvh flex-col items-center overflow-x-clip bg-[var(--ct-bg)] px-4 py-8 text-white md:py-12">
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

			<div className="relative flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-8">
				<span className="relative block h-[70px] w-[140px] md:h-[90px] md:w-[180px]">
					<Image
						src="/home/imgBrand.png"
						alt="Worldwide Vapor"
						fill
						sizes="180px"
						className="object-contain"
						priority
					/>
				</span>
				<div className="w-full rounded-[13px] p-px [background:linear-gradient(135deg,var(--ct-cyan),transparent_35%,transparent_65%,var(--ct-magenta))]">
					<SitePasswordForm unlock={unlock} />
				</div>
			</div>
		</div>
	);
}
