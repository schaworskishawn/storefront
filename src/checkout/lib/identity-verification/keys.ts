import type { CheckoutFragment } from "@/checkout/graphql";

/**
 * Namespace for checkout metadata written by the identity-verification step and read back
 * by `IdentityStep` (initial state on refresh) and the Stripe Identity webhook (durable status).
 * Mirrors the `paper.marketing_opt_in_*` convention in `lib/marketing-consent/keys.ts`.
 */
export const IDENTITY_VERIFICATION_METADATA = {
	sessionId: "paper.identity_verification_session_id",
	status: "paper.identity_verification_status",
	updatedAt: "paper.identity_verification_updated_at",
} as const;

/**
 * Mirrors Stripe Identity's `VerificationSession.status`
 * (https://docs.stripe.com/api/identity/verification_sessions/object#identity_verification_session_object-status).
 * `requires_input` covers both "not started yet" and "Stripe needs another attempt" — Stripe
 * itself does not distinguish those with a separate status.
 */
export type IdentityVerificationStatus = "requires_input" | "processing" | "verified" | "canceled";

export type IdentityVerificationMetadataInput = { key: string; value: string };

export function buildIdentityVerificationMetadata(
	sessionId: string,
	status: IdentityVerificationStatus,
): IdentityVerificationMetadataInput[] {
	return [
		{ key: IDENTITY_VERIFICATION_METADATA.sessionId, value: sessionId },
		{ key: IDENTITY_VERIFICATION_METADATA.status, value: status },
		{ key: IDENTITY_VERIFICATION_METADATA.updatedAt, value: new Date().toISOString() },
	];
}

export type IdentityVerificationState = {
	sessionId: string | null;
	status: IdentityVerificationStatus | null;
};

const VALID_STATUSES: ReadonlySet<string> = new Set<IdentityVerificationStatus>([
	"requires_input",
	"processing",
	"verified",
	"canceled",
]);

function isIdentityVerificationStatus(value: string): value is IdentityVerificationStatus {
	return VALID_STATUSES.has(value);
}

/** Reads the persisted verification state off `CheckoutFragment.metadata` (survives page refresh). */
export function readIdentityVerificationState(
	metadata: CheckoutFragment["metadata"] | null | undefined,
): IdentityVerificationState {
	let sessionId: string | null = null;
	let status: IdentityVerificationStatus | null = null;

	for (const entry of metadata ?? []) {
		if (entry.key === IDENTITY_VERIFICATION_METADATA.sessionId) {
			sessionId = entry.value;
		} else if (
			entry.key === IDENTITY_VERIFICATION_METADATA.status &&
			isIdentityVerificationStatus(entry.value)
		) {
			status = entry.value;
		}
	}

	return { sessionId, status };
}
