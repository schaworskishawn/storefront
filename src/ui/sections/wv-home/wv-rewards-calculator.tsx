"use client";

import { Coins, Ticket } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import { previewEarn, tokenCount } from "@/lib/rewards/program-copy";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const PRESETS = [25, 50, 100, 250];
const MIN = 5;
const MAX = 500;

/**
 * "What would I earn?": slide an order total, see the tokens it earns and what they take off a later order.
 *
 * In the site's neon style (`.wv-calc-*` in wv-home.css): a neon card with the total glowing; the slider drawn in neon,
 * filled cyan into pink up to a glowing knob; the presets neon pills, the chosen one glossy; and the result a glass panel
 * set into the card, laid out like the page's stats (`.wv-stat`): the tokens glowing cyan beside coins, what they're worth
 * glowing pink beside a ticket, a neon line between them.
 */
export function RewardsCalculator({ tokensPerDollar }: { tokensPerDollar: number }) {
	const [dollars, setDollars] = useState(100);
	const id = useId();
	const { tokens, worthCents } = previewEarn(dollars, tokensPerDollar);
	const fill = { "--fill": `${((dollars - MIN) / (MAX - MIN)) * 100}%` } as CSSProperties;

	return (
		<div className="wv-neon-card wv-rw-card flex w-full max-w-[860px] flex-col gap-6 rounded-[20px] p-5 md:gap-8 md:p-8 xl:p-10">
			<div className="flex flex-col gap-4">
				<div className="flex items-baseline justify-between gap-4">
					<label htmlFor={id} className={`${heyComic} wv-pc-name text-sm md:text-base`}>
						IF YOUR ORDER OF PRODUCTS COMES TO
					</label>
					<output htmlFor={id} className={`${bungee} wv-stat-value text-2xl md:text-3xl`}>
						${dollars}
					</output>
				</div>
				<input
					id={id}
					type="range"
					min={MIN}
					max={MAX}
					step={5}
					value={dollars}
					onChange={(event) => setDollars(Number(event.target.value))}
					style={fill}
					className="wv-calc-range w-full cursor-pointer"
				/>
				<div className="flex flex-wrap gap-2">
					{PRESETS.map((preset) => (
						<button
							key={preset}
							type="button"
							onClick={() => setDollars(preset)}
							aria-pressed={dollars === preset}
							className={`${bungee} wv-calc-chip rounded-lg px-4 py-[6px] text-[13px]`}
						>
							${preset}
						</button>
					))}
				</div>
			</div>

			<div
				role="status"
				aria-live="polite"
				className="wv-calc-result grid grid-cols-1 gap-4 rounded-2xl p-5 text-center md:grid-cols-2 md:gap-6"
			>
				<div className="wv-trust-item wv-stat flex flex-col items-center gap-2">
					<span aria-hidden className="wv-trust-icon text-xl">
						<Coins className="size-[0.75em]" strokeWidth={2} />
					</span>
					<p className={`${bungee} wv-stat-value text-[32px] leading-tight md:text-[36px]`}>
						{tokens.toLocaleString("en-CA")}
					</p>
					<p className={`${orbitron} wv-trust-text text-xs`}>Vapor Tokens earned</p>
				</div>
				<div className="wv-trust-item wv-stat flex flex-col items-center gap-2">
					<span aria-hidden className="wv-trust-icon text-xl">
						<Ticket className="size-[0.75em]" strokeWidth={2} />
					</span>
					<p className={`${bungee} wv-stat-value text-[32px] leading-tight md:text-[36px]`}>
						${(worthCents / 100).toFixed(2)}
					</p>
					<p className={`${orbitron} wv-trust-text text-xs`}>off a future order</p>
				</div>
			</div>

			<p className={`${orbitron} text-[11px] leading-[1.6] text-[var(--wv-muted)] md:text-xs`}>
				{`Based on ${tokenCount(tokensPerDollar)} per $1 spent on products. Shipping, tax, and anything paid with a gift card or tokens don't count, and you need to be signed in when you check out.`}
			</p>
		</div>
	);
}
