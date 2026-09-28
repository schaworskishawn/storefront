import type { CheckoutFragment } from "@/checkout/graphql";

/**
 * Namespace for checkout metadata written by the AgeChecker verification step. Independent of
 * `../keys.ts` (the Stripe Identity namespace) — different provider, different status vocabulary,
 * per the "keep both, decide later" call.
 */
export const AGECHECKER_METADATA = {
	uuid: "paper.agechecker_verification_uuid",
	status: "paper.agechecker_verification_status",
	updatedAt: "paper.agechecker_verification_updated_at",
} as const;

/** Exactly AgeChecker's documented `/v1/create` and `/v1/status` status values. */
export type AgeCheckerStatus =
	| "accepted"
	| "denied"
	| "signature"
	| "photo_id"
	| "phone_validation"
	| "sms_sent"
	| "pending"
	| "not_created";

const VALID_STATUSES: ReadonlySet<string> = new Set<AgeCheckerStatus>([
	"accepted",
	"denied",
	"signature",
	"photo_id",
	"phone_validation",
	"sms_sent",
	"pending",
	"not_created",
]);

function isAgeCheckerStatus(value: string): value is AgeCheckerStatus {
	return VALID_STATUSES.has(value);
}

/** Statuses where AgeChecker's own popup can resolve things further (see `AgeCheckerAPI.show`). */
export function needsAgeCheckerPopup(status: AgeCheckerStatus): boolean {
	return (
		status === "signature" || status === "photo_id" || status === "phone_validation" || status === "sms_sent"
	);
}

export type AgeCheckerMetadataInput = { key: string; value: string };

export function buildAgeCheckerMetadata(
	uuid: string | undefined,
	status: AgeCheckerStatus,
): AgeCheckerMetadataInput[] {
	return [
		...(uuid ? [{ key: AGECHECKER_METADATA.uuid, value: uuid }] : []),
		{ key: AGECHECKER_METADATA.status, value: status },
		{ key: AGECHECKER_METADATA.updatedAt, value: new Date().toISOString() },
	];
}

export type AgeCheckerVerificationState = {
	uuid: string | null;
	status: AgeCheckerStatus | null;
};

/** Reads the persisted verification state off `CheckoutFragment.metadata` (survives page refresh). */
export function readAgeCheckerVerificationState(
	metadata: CheckoutFragment["metadata"] | null | undefined,
): AgeCheckerVerificationState {
	let uuid: string | null = null;
	let status: AgeCheckerStatus | null = null;

	for (const entry of metadata ?? []) {
		if (entry.key === AGECHECKER_METADATA.uuid) {
			uuid = entry.value;
		} else if (entry.key === AGECHECKER_METADATA.status && isAgeCheckerStatus(entry.value)) {
			status = entry.value;
		}
	}

	return { uuid, status };
}
