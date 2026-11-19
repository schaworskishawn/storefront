"use client";

import { Coins, Landmark, Save, Sparkles, type LucideIcon } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { savePayoutMethodAction } from "@/app/(root)/account/affiliate/actions";
import { CRYPTO_COINS, type PayoutMethod } from "@/lib/affiliates/records";

/**
 * "How you get paid" on the affiliate dashboard: Vapor Tokens with the bonus (automatic), a crypto wallet (USDT on TRON
 * or USDC on Polygon), or Interac e-Transfer. Saved by a server action under the affiliate's own session, which checks
 * the details, emails the account about the change and holds a new wallet for 72 hours.
 */

const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const input = `${orbitron} wv-acct-field h-10 w-full min-w-0 rounded-lg px-3 text-[13px] text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const label = `${orbitron} flex flex-col gap-1.5 text-[11px] tracking-[0.5px] text-[var(--wv-text-dim)]`;
const primary = `${heyComic} wv-pc-cta flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-[var(--wv-cyan-soft)] px-5 text-sm text-[var(--wv-ink)] disabled:opacity-60`;

type Kind = PayoutMethod["kind"];

function Choice({
	value,
	checked,
	onChange,
	Icon,
	title,
	note,
	children,
}: {
	value: Kind;
	checked: boolean;
	onChange: (kind: Kind) => void;
	Icon: LucideIcon;
	title: string;
	note: string;
	children?: ReactNode;
}) {
	return (
		<div className="wv-af-choice flex flex-col gap-3 rounded-xl p-3">
			<label className="flex cursor-pointer items-start gap-3">
				<input
					type="radio"
					name="kind"
					value={value}
					checked={checked}
					onChange={() => onChange(value)}
					className="mt-1 size-4 shrink-0"
				/>
				<Icon aria-hidden className="wv-af-inline-icon mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
				<span className="flex min-w-0 flex-col gap-1">
					<span className={`${heyComic} text-sm text-white`}>{title}</span>
					<span className={`${orbitron} wv-neon-card-text text-xs leading-5`}>{note}</span>
				</span>
			</label>
			{checked && children}
		</div>
	);
}

export function PayoutMethodForm({
	method,
	bonusPercent,
	holdHours,
}: {
	method: PayoutMethod;
	bonusPercent: number;
	holdHours: number;
}) {
	const [state, action, pending] = useActionState(savePayoutMethodAction, null);
	const [kind, setKind] = useState<Kind>(method.kind);

	return (
		<form action={action} className="flex flex-col gap-3">
			<fieldset className="flex flex-col gap-3">
				<legend className="sr-only">How you get paid</legend>
				<Choice
					value="tokens"
					checked={kind === "tokens"}
					onChange={setKind}
					Icon={Sparkles}
					title={`VAPOR TOKENS (+${bonusPercent}% BONUS)`}
					note={`Paid automatically on each payout date, with ${bonusPercent}% extra, into your token balance. Spend them on anything at checkout; they never expire.`}
				/>
				<Choice
					value="crypto"
					checked={kind === "crypto"}
					onChange={setKind}
					Icon={Coins}
					title="CRYPTO (USDT OR USDC)"
					note={`Sent to your own wallet. A new wallet is paid from ${holdHours} hours after you add it, to keep your earnings safe.`}
				>
					<div className="grid gap-3 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
						<label className={label}>
							COIN AND NETWORK
							<select
								name="currency"
								defaultValue={method.kind === "crypto" ? method.currency : "usdttrc20"}
								className={input}
							>
								{Object.entries(CRYPTO_COINS).map(([value, coin]) => (
									<option key={value} value={value}>
										{coin.label}
									</option>
								))}
							</select>
						</label>
						<label className={label}>
							WALLET ADDRESS
							<input
								name="address"
								defaultValue={method.kind === "crypto" ? method.address : ""}
								required
								autoComplete="off"
								spellCheck={false}
								placeholder="Paste it from your wallet"
								className={input}
							/>
						</label>
					</div>
					<p className={`${orbitron} text-xs leading-5 text-[var(--wv-muted)]`}>
						Make sure the network matches: USDT must go to a TRON address (starts with T) and USDC to a
						Polygon address (starts with 0x). Coins sent on the wrong network can be lost.
					</p>
				</Choice>
				<Choice
					value="etransfer"
					checked={kind === "etransfer"}
					onChange={setKind}
					Icon={Landmark}
					title="INTERAC E-TRANSFER (CANADA)"
					note="Sent by hand to your bank email on each payout date."
				>
					<label className={label}>
						E-TRANSFER EMAIL
						<input
							name="email"
							type="email"
							defaultValue={method.kind === "etransfer" ? method.email : ""}
							required
							autoComplete="email"
							className={input}
						/>
					</label>
				</Choice>
			</fieldset>
			<button type="submit" disabled={pending} className={primary}>
				<Save aria-hidden className="size-4" strokeWidth={2.5} />
				<span className="wv-pc-cta-label">{pending ? "SAVING…" : "SAVE"}</span>
			</button>
			{state && (
				<p
					role={state.ok ? "status" : "alert"}
					className={`${orbitron} text-xs ${state.ok ? "text-[var(--wv-cyan-soft)]" : "text-[var(--q-red)]"}`}
				>
					{state.message}
				</p>
			)}
		</form>
	);
}
