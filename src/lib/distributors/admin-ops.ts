import type { DistributorRecord } from "./records";
import { isDistributorTierId, type DistributorTierId } from "./tiers";

/** The owner's changes to a distributor's record on /distributor-admin, as pure rules (tested in admin-ops.test.ts). */

export type OpResult = { ok: true; record: DistributorRecord } | { ok: false; message: string };

const tierOrError = (raw: string): DistributorTierId | null => (isDistributorTierId(raw) ? raw : null);

/** Approves an application (or a rejected one, on a second look) at the tier the owner picked. */
export function approve(record: DistributorRecord, rawTier: string, now: Date): OpResult {
	const tierId = tierOrError(rawTier);
	if (!tierId) return { ok: false, message: "Choose a tier." };
	if (record.status === "approved")
		return { ok: false, message: "Already approved: change the tier below instead." };
	return { ok: true, record: { ...record, status: "approved", tierId, decidedAt: now.toISOString() } };
}

export function reject(record: DistributorRecord, now: Date): OpResult {
	if (record.status !== "pending")
		return { ok: false, message: "Only a pending application can be rejected." };
	return { ok: true, record: { ...record, status: "rejected", tierId: null, decidedAt: now.toISOString() } };
}

/** Moves an approved (or paused) distributor to another tier. */
export function setTier(record: DistributorRecord, rawTier: string, now: Date): OpResult {
	const tierId = tierOrError(rawTier);
	if (!tierId) return { ok: false, message: "Choose a tier." };
	if (record.status !== "approved" && record.status !== "paused")
		return { ok: false, message: "Approve the application first." };
	if (record.tierId === tierId) return { ok: false, message: "They're already at that tier." };
	return { ok: true, record: { ...record, tierId, decidedAt: now.toISOString() } };
}

/** Pauses wholesale pricing (their orders are charged retail) or resumes it. */
export function setPaused(record: DistributorRecord, paused: boolean, now: Date): OpResult {
	if (paused && record.status !== "approved")
		return { ok: false, message: "Only an approved distributor can be paused." };
	if (!paused && record.status !== "paused") return { ok: false, message: "They aren't paused." };
	return {
		ok: true,
		record: { ...record, status: paused ? "paused" : "approved", decidedAt: now.toISOString() },
	};
}
