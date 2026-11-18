import type { AccountEmailKind } from "./manifest";
import { accountEmail, actionLink, type AccountEmail } from "./messages";

/**
 * What the emails app does with one of Saleor's account events: work out who it's for and the link, and send the email.
 * The sending comes in through `deps`, so it's tested with a fake (handle.test.ts).
 *
 * The answer tells Saleor whether to try again: a send that failed answers 500, so Saleor re-sends the event later; an
 * event that can't produce an email (no address or link, an account already confirmed, email not set up here) answers
 * 200, so it isn't retried for nothing. The token is never logged.
 */

export type AccountEventPayload = {
	redirectUrl?: string | null;
	token?: string | null;
	user?: { email?: string | null; firstName?: string | null; isConfirmed?: boolean | null } | null;
};

export type AccountEmailDeps = {
	configured: () => boolean;
	send: (to: string, email: AccountEmail) => Promise<{ ok: boolean }>;
};

export type AccountEmailOutcome =
	| "sent"
	| "failed"
	| "not-configured"
	| "already-confirmed"
	| "missing-recipient"
	| "missing-link";

export async function handleAccountEmail(
	kind: AccountEmailKind,
	payload: AccountEventPayload,
	deps: AccountEmailDeps,
): Promise<{ status: 200 | 500; outcome: AccountEmailOutcome }> {
	const to = payload.user?.email?.trim();
	if (!to) return { status: 200, outcome: "missing-recipient" };
	// Saleor sends this event even when the store doesn't ask new customers to confirm; their account is already confirmed.
	if (kind === "confirm-account" && payload.user?.isConfirmed)
		return { status: 200, outcome: "already-confirmed" };

	const link =
		payload.token && payload.redirectUrl ? actionLink(payload.redirectUrl, to, payload.token) : null;
	if (!link) return { status: 200, outcome: "missing-link" };

	if (!deps.configured()) {
		console.error(`[emails-app] can't send a ${kind} email: email (RESEND_API_KEY) isn't set up`);
		return { status: 200, outcome: "not-configured" };
	}
	const sent = await deps.send(to, accountEmail(kind, { firstName: payload.user?.firstName ?? "", link }));
	if (!sent.ok) {
		console.error(`[emails-app] a ${kind} email couldn't be sent; Saleor will retry`);
		return { status: 500, outcome: "failed" };
	}
	return { status: 200, outcome: "sent" };
}
