"use client";

import {
	BadgeCheck,
	Ban,
	Bot,
	Coins,
	KeyRound,
	Pause,
	Play,
	Save,
	Send,
	ShieldCheck,
	Wallet,
	X,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
	approveAffiliateAction,
	clearHoldAction,
	createCryptoBatchAction,
	payTokensNowAction,
	recordAffiliatePayoutAction,
	rejectAffiliateAction,
	setAffiliatePausedAction,
	runAiReviewNowAction,
	setAffiliateVouchersAction,
	verifyCryptoBatchAction,
	type AdminActionState,
} from "@/app/(root)/affiliate-admin/actions";

/** The forms on /affiliate-admin. Each posts to a server action that re-checks the staff session, and says what happened. */

const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const input = `${orbitron} wv-acct-field h-10 w-full min-w-0 rounded-lg px-3 text-[13px] text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const label = `${orbitron} flex flex-col gap-1.5 text-[11px] tracking-[0.5px] text-[var(--wv-text-dim)]`;
const pill =
	"wv-review-btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] disabled:opacity-60";
const primary = `${heyComic} wv-pc-cta flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--wv-cyan-soft)] px-5 text-sm text-[var(--wv-ink)] disabled:opacity-60`;

/**
 * A confirm step that belongs to the action's latest result: once the action answers (a new result), it closes by itself,
 * so a payout can't be recorded twice by pressing the confirm button again.
 */
function useConfirm(state: AdminActionState) {
	const [openedFor, setOpenedFor] = useState<AdminActionState | "closed">("closed");
	return { open: openedFor === state, show: () => setOpenedFor(state), hide: () => setOpenedFor("closed") };
}

function Message({ state }: { state: AdminActionState }) {
	if (!state) return null;
	return (
		<p
			role={state.ok ? "status" : "alert"}
			className={`${orbitron} text-xs ${state.ok ? "text-[var(--wv-cyan-soft)]" : "text-[var(--q-red)]"}`}
		>
			{state.message}
		</p>
	);
}

export function ApproveForm({ userId, suggested }: { userId: string; suggested: string }) {
	const [state, action, pending] = useActionState(approveAffiliateAction, null);
	const [rejectState, rejectAction, rejecting] = useActionState(rejectAffiliateAction, null);
	const confirmReject = useConfirm(rejectState);
	return (
		<div className="flex flex-col gap-3">
			<form action={action} className="flex flex-col gap-3 md:flex-row md:items-end">
				<input type="hidden" name="userId" value={userId} />
				<label className={`${label} flex-1`}>
					REFERRAL CODE (THEIR LINK WILL BE ?aff=CODE; IT CAN&apos;T BE CHANGED LATER)
					<input name="code" defaultValue={suggested} required className={input} autoComplete="off" />
				</label>
				<button type="submit" disabled={pending} className={primary}>
					<BadgeCheck aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">{pending ? "APPROVING…" : "APPROVE"}</span>
				</button>
			</form>
			<Message state={state} />
			<form action={rejectAction} className={`${orbitron} flex flex-wrap items-center gap-2`}>
				<input type="hidden" name="userId" value={userId} />
				{confirmReject.open ? (
					<>
						<span className="text-xs text-white">Reject this application?</span>
						<button type="submit" disabled={rejecting} className={`${pill} wv-review-btn--pink`}>
							<Ban aria-hidden className="size-3" strokeWidth={2.5} />
							YES, REJECT
						</button>
						<button type="button" onClick={confirmReject.hide} className={pill}>
							<X aria-hidden className="size-3" strokeWidth={2.5} />
							KEEP IT
						</button>
					</>
				) : (
					<button type="button" onClick={confirmReject.show} className={`${pill} wv-review-btn--pink`}>
						<Ban aria-hidden className="size-3" strokeWidth={2.5} />
						REJECT
					</button>
				)}
			</form>
			<Message state={rejectState} />
		</div>
	);
}

export function PauseButton({ userId, paused }: { userId: string; paused: boolean }) {
	const [state, action, pending] = useActionState(setAffiliatePausedAction, null);
	return (
		<form action={action} className={`${orbitron} flex flex-col items-start gap-2`}>
			<input type="hidden" name="userId" value={userId} />
			<input type="hidden" name="paused" value={paused ? "false" : "true"} />
			<button type="submit" disabled={pending} className={`${pill} ${paused ? "" : "wv-review-btn--pink"}`}>
				{paused ? (
					<Play aria-hidden className="size-3" strokeWidth={2.5} />
				) : (
					<Pause aria-hidden className="size-3" strokeWidth={2.5} />
				)}
				{paused ? "RESUME CREDITING" : "PAUSE CREDITING"}
			</button>
			<Message state={state} />
		</form>
	);
}

export function VouchersForm({ userId, vouchers }: { userId: string; vouchers: string[] }) {
	const [state, action, pending] = useActionState(setAffiliateVouchersAction, null);
	return (
		<form action={action} className="flex flex-col gap-2">
			<input type="hidden" name="userId" value={userId} />
			<label className={label}>
				LINKED DISCOUNT CODES (CREATE THEM IN THE SALEOR DASHBOARD FIRST; SEPARATE WITH COMMAS)
				<div className="flex gap-2">
					<input
						name="vouchers"
						defaultValue={vouchers.join(", ")}
						placeholder="e.g. NEO10"
						className={input}
						autoComplete="off"
					/>
					<button type="submit" disabled={pending} className={`${pill} shrink-0`}>
						<Save aria-hidden className="size-3" strokeWidth={2.5} />
						SAVE
					</button>
				</div>
			</label>
			<Message state={state} />
		</form>
	);
}

export function PayoutForm({
	userId,
	name,
	owed,
}: {
	userId: string;
	name: string;
	/** Each currency the affiliate has commission or payouts in, with what's owed now (cents, may be zero). */
	owed: { currency: string; cents: number }[];
}) {
	const [state, action, pending] = useActionState(recordAffiliatePayoutAction, null);
	const confirm = useConfirm(state);
	const currencies = owed.length ? owed : [{ currency: "USD", cents: 0 }];
	return (
		<form action={action} className="flex flex-col gap-3">
			<input type="hidden" name="userId" value={userId} />
			<div className="grid gap-3 md:grid-cols-2">
				{currencies.map(({ currency, cents }) => (
					<label key={currency} className={label}>
						PAID IN {currency}
						<input
							name={`amount_${currency}`}
							defaultValue={cents > 0 ? (cents / 100).toFixed(2) : ""}
							inputMode="decimal"
							placeholder="0.00"
							className={input}
						/>
					</label>
				))}
				<label className={label}>
					HOW YOU PAID
					<input name="method" defaultValue="Interac e-Transfer" required className={input} />
				</label>
				<label className={label}>
					NOTE (OPTIONAL; THE AFFILIATE SEES IT)
					<input name="note" className={input} />
				</label>
			</div>
			{confirm.open ? (
				<div className={`${orbitron} flex flex-wrap items-center gap-2`}>
					<span className="text-xs text-white">
						Only record it once you&apos;ve actually sent the money. {name} will be emailed.
					</span>
					<button type="submit" disabled={pending} className={primary}>
						<Wallet aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-pc-cta-label">{pending ? "RECORDING…" : "YES, I'VE PAID"}</span>
					</button>
					<button type="button" onClick={confirm.hide} className={pill}>
						<X aria-hidden className="size-3" strokeWidth={2.5} />
						CANCEL
					</button>
				</div>
			) : (
				<button type="button" onClick={confirm.show} className={`${primary} self-start`}>
					<Wallet aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">RECORD A PAYOUT</span>
				</button>
			)}
			<Message state={state} />
		</form>
	);
}

/** Pays everything owed now in Vapor Tokens: the owner's OK for a payout over the limit, held, or early. */
export function PayTokensNowButton({ userId, owed }: { userId: string; owed: string }) {
	const [state, action, pending] = useActionState(payTokensNowAction, null);
	const confirm = useConfirm(state);
	return (
		<form action={action} className={`${orbitron} flex flex-col items-start gap-2`}>
			<input type="hidden" name="userId" value={userId} />
			{confirm.open ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-white">Pay {owed} now in Vapor Tokens (+bonus)?</span>
					<button type="submit" disabled={pending} className={pill}>
						<Coins aria-hidden className="size-3" strokeWidth={2.5} />
						{pending ? "PAYING…" : "YES, PAY"}
					</button>
					<button type="button" onClick={confirm.hide} className={pill}>
						<X aria-hidden className="size-3" strokeWidth={2.5} />
						CANCEL
					</button>
				</div>
			) : (
				<button type="button" onClick={confirm.show} className={pill}>
					<Coins aria-hidden className="size-3" strokeWidth={2.5} />
					PAY IN TOKENS NOW
				</button>
			)}
			<Message state={state} />
		</form>
	);
}

export function ClearHoldButton({ userId }: { userId: string }) {
	const [state, action, pending] = useActionState(clearHoldAction, null);
	return (
		<form action={action} className={`${orbitron} flex flex-col items-start gap-2`}>
			<input type="hidden" name="userId" value={userId} />
			<button type="submit" disabled={pending} className={pill}>
				<ShieldCheck aria-hidden className="size-3" strokeWidth={2.5} />
				{pending ? "CLEARING…" : "CHECKED: CLEAR THE HOLD"}
			</button>
			<Message state={state} />
		</form>
	);
}

/** Creates one NOWPayments batch for every crypto payout that's due; it then waits for the 2FA code below. */
export function CryptoBatchButton({ count }: { count: number }) {
	const [state, action, pending] = useActionState(createCryptoBatchAction, null);
	const confirm = useConfirm(state);
	return (
		<form action={action} className={`${orbitron} flex flex-col items-start gap-2`}>
			{confirm.open ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-white">
						Create a NOWPayments batch for {count} crypto payout{count === 1 ? "" : "s"}? Nothing is sent
						until you enter your 2FA code.
					</span>
					<button type="submit" disabled={pending} className={primary}>
						<Send aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-pc-cta-label">{pending ? "CREATING…" : "CREATE BATCH"}</span>
					</button>
					<button type="button" onClick={confirm.hide} className={pill}>
						<X aria-hidden className="size-3" strokeWidth={2.5} />
						CANCEL
					</button>
				</div>
			) : (
				<button type="button" onClick={confirm.show} className={primary}>
					<Send aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">SEND CRYPTO PAYOUTS</span>
				</button>
			)}
			<Message state={state} />
		</form>
	);
}

/** Releases a created batch with the NOWPayments 2FA code (one code for the whole batch, within an hour). */
export function VerifyBatchForm({ batchId, summary }: { batchId: string; summary: string }) {
	const [state, action, pending] = useActionState(verifyCryptoBatchAction, null);
	return (
		<form action={action} className="flex flex-col gap-2">
			<input type="hidden" name="batchId" value={batchId} />
			<label className={label}>
				BATCH {batchId}: {summary.toUpperCase()}. ENTER YOUR NOWPAYMENTS 2FA CODE TO SEND IT
				<div className="flex gap-2">
					<input
						name="code"
						inputMode="numeric"
						autoComplete="one-time-code"
						maxLength={6}
						placeholder="123456"
						className={input}
						required
					/>
					<button type="submit" disabled={pending} className={`${pill} shrink-0`}>
						<KeyRound aria-hidden className="size-3" strokeWidth={2.5} />
						{pending ? "SENDING…" : "SEND"}
					</button>
				</div>
			</label>
			<Message state={state} />
		</form>
	);
}

export function RunAiReviewButton() {
	const [state, action, pending] = useActionState(runAiReviewNowAction, null);
	return (
		<form action={action} className={`${orbitron} flex flex-col items-start gap-2`}>
			<button type="submit" disabled={pending} className={pill}>
				<Bot aria-hidden className="size-3" strokeWidth={2.5} />
				{pending ? "REVIEWING… (UP TO A MINUTE)" : "RUN THE AI REVIEW NOW"}
			</button>
			<Message state={state} />
		</form>
	);
}
