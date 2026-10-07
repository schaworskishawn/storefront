"use client";

import { useId, useState } from "react";
import { previewEarn, tokenCount } from "@/lib/rewards/program-copy";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const PRESETS = [25, 50, 100, 250];
const MIN = 5;
const MAX = 500;

/** "What would I earn?": slide an order total, see the tokens it earns and what they take off a later order. */
export function RewardsCalculator({ tokensPerDollar }: { tokensPerDollar: number }) {
	const [dollars, setDollars] = useState(100);
	const id = useId();
	const { tokens, worthCents } = previewEarn(dollars, tokensPerDollar);

	return (
		<div className="flex w-full max-w-[860px] flex-col gap-6 rounded-[20px] border-[1.5px] border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-5 md:gap-8 md:p-8 xl:p-10">
			<div className="flex flex-col gap-3">
				<div className="flex items-baseline justify-between gap-4">
					<label htmlFor={id} className={`${heyComic} text-sm md:text-base`}>
						IF YOUR ORDER OF PRODUCTS COMES TO
					</label>
					<output htmlFor={id} className={`${bungee} text-2xl text-[var(--wv-cyan-soft)] md:text-3xl`}>
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
					className="h-2 w-full cursor-pointer accent-[var(--wv-cyan)]"
				/>
				<div className="flex flex-wrap gap-2">
					{PRESETS.map((preset) => (
						<button
							key={preset}
							type="button"
							onClick={() => setDollars(preset)}
							aria-pressed={dollars === preset}
							className={`${bungee} rounded-lg border px-4 py-[6px] text-[13px] transition-colors ${
								dollars === preset
									? "border-[var(--wv-cyan-soft)] bg-[var(--wv-cyan-soft)] text-[var(--wv-ink)]"
									: "border-[var(--wv-cyan-soft)] text-[var(--wv-cyan-soft)]"
							}`}
						>
							${preset}
						</button>
					))}
				</div>
			</div>

			<div
				role="status"
				aria-live="polite"
				className="grid grid-cols-1 gap-4 rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-bg)] p-5 text-center md:grid-cols-2 md:gap-6"
			>
				<div className="flex flex-col gap-1">
					<p className={`${bungee} text-[32px] text-[var(--wv-cyan-soft)]`}>
						{tokens.toLocaleString("en-CA")}
					</p>
					<p className={`${orbitron} text-xs text-[var(--wv-text-dim)]`}>Vapor Tokens earned</p>
				</div>
				<div className="flex flex-col gap-1">
					<p className={`${bungee} text-[32px] text-[var(--wv-pink)]`}>${(worthCents / 100).toFixed(2)}</p>
					<p className={`${orbitron} text-xs text-[var(--wv-text-dim)]`}>off a future order</p>
				</div>
			</div>

			<p className={`${orbitron} text-[11px] leading-[1.6] text-[var(--wv-muted)] md:text-xs`}>
				{`Based on ${tokenCount(tokensPerDollar)} per $1 spent on products. Shipping, tax, and anything paid with a gift card or tokens don't count, and you need to be signed in when you check out.`}
			</p>
		</div>
	);
}
