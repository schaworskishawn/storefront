import { WvFooter, WvHeader } from "./wv-chrome";
import { DeskApp } from "./wv-desk-app";
import "./wv-home.css";

/**
 * My Desk: a visitor's own corner of the site (cover, shortcuts, private notes, clock, appearance). The page is just the frame;
 * everything on the desk is drawn in the browser from what that visitor saved there.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

export function WvDesk() {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
				<header className="flex flex-col gap-2">
					<p className={`${marker} text-lg uppercase tracking-[2px] text-[var(--wv-pink)]`}>Just for you</p>
					<h1 className={`${heyComic} text-[34px] leading-[38px] md:text-[44px] md:leading-[50px]`}>
						MY <span className="text-[var(--wv-cyan-soft)]">DESK</span>
					</h1>
					<p
						className={`${orbitron} max-w-[640px] text-[13px] leading-[1.7] text-[var(--wv-text-dim)] md:text-sm`}
					>
						Make this corner yours: pick a cover, keep your favourite pages close, jot private notes, and tune
						how the site looks. Drag a panel by its handle, or use its arrows, to put things where you like.
						It is all saved in this browser only, with nothing to sign in to and nothing for us to see.
					</p>
				</header>
				<DeskApp />
			</main>
			<WvFooter />
		</div>
	);
}
