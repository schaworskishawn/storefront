"use client";

import { Ban, BadgeCheck, Pause, Play, Save, X } from "lucide-react";
import { useActionState, useState } from "react";
import {
	approveDistributorAction,
	rejectDistributorAction,
	setDistributorPausedAction,
	setDistributorTierAction,
	type DistributorAdminState,
} from "@/app/(root)/distributor-admin/actions";
import { DISTRIBUTOR_TIERS, discountLabel, minimumLabel } from "@/lib/distributors/tiers";

/** The forms on /distributor-admin. Each posts to a server action that re-checks the staff session, and says what happened. */

const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const select = `${orbitron} wv-acct-field h-10 w-full min-w-0 rounded-lg px-3 text-[13px] text-white focus:outline-none [&>option]:bg-[var(--wv-control)]`;
const label = `${orbitron} flex flex-col gap-1.5 text-[11px] tracking-[0.5px] text-[var(--wv-text-dim)]`;
const pill =
	"wv-review-btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] disabled:opacity-60";
const primary = `${heyComic} wv-pc-cta flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--wv-cyan-soft)] px-5 text-sm text-[var(--wv-ink)] disabled:opacity-60`;

function Message({ state }: { state: DistributorAdminState }) {
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

function TierSelect({ name, defaultValue }: { name: string; defaultValue: string }) {
	return (
		<select name={name} defaultValue={defaultValue} className={select}>
			{DISTRIBUTOR_TIERS.map((t) => (
				<option key={t.id} value={t.id}>
					{t.name} ({discountLabel(t)} off, {minimumLabel(t)} min.)
				</option>
			))}
		</select>
	);
}

/** Approve at a chosen tier (the one they asked for, preselected), or reject after a confirm step. */
export function ApproveDistributorForm({ userId, requestedTier }: { userId: string; requestedTier: string }) {
	const [state, action, pending] = useActionState(approveDistributorAction, null);
	const [rejectState, rejectAction, rejecting] = useActionState(rejectDistributorAction, null);
	const [confirming, setConfirming] = useState(false);
	return (
		<div className="flex flex-col gap-3">
			<form action={action} className="flex flex-col gap-3 md:flex-row md:items-end">
				<input type="hidden" name="userId" value={userId} />
				<label className={`${label} flex-1`}>
					APPROVE AT TIER
					<TierSelect name="tier" defaultValue={requestedTier} />
				</label>
				<button type="submit" disabled={pending} className={primary}>
					<BadgeCheck aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">{pending ? "APPROVING…" : "APPROVE"}</span>
				</button>
			</form>
			<Message state={state} />
			<form action={rejectAction} className={`${orbitron} flex flex-wrap items-center gap-2`}>
				<input type="hidden" name="userId" value={userId} />
				{confirming ? (
					<>
						<span className="text-xs text-white">Reject this application?</span>
						<button type="submit" disabled={rejecting} className={`${pill} wv-review-btn--pink`}>
							<Ban aria-hidden className="size-3" strokeWidth={2.5} />
							YES, REJECT
						</button>
						<button type="button" onClick={() => setConfirming(false)} className={pill}>
							<X aria-hidden className="size-3" strokeWidth={2.5} />
							KEEP IT
						</button>
					</>
				) : (
					<button type="button" onClick={() => setConfirming(true)} className={`${pill} wv-review-btn--pink`}>
						<Ban aria-hidden className="size-3" strokeWidth={2.5} />
						REJECT
					</button>
				)}
			</form>
			<Message state={rejectState} />
		</div>
	);
}

export function DistributorTierForm({ userId, tierId }: { userId: string; tierId: string }) {
	const [state, action, pending] = useActionState(setDistributorTierAction, null);
	return (
		<form action={action} className="flex flex-col gap-2">
			<input type="hidden" name="userId" value={userId} />
			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<label className={`${label} flex-1`}>
					TIER
					<TierSelect name="tier" defaultValue={tierId} />
				</label>
				<button type="submit" disabled={pending} className={primary}>
					<Save aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">{pending ? "SAVING…" : "SAVE TIER"}</span>
				</button>
			</div>
			<Message state={state} />
		</form>
	);
}

export function PauseDistributorButton({ userId, paused }: { userId: string; paused: boolean }) {
	const [state, action, pending] = useActionState(setDistributorPausedAction, null);
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
				{paused ? "RESUME WHOLESALE PRICING" : "PAUSE WHOLESALE PRICING"}
			</button>
			<Message state={state} />
		</form>
	);
}
