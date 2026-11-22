import { isDistributorTierId, type DistributorTierId } from "./tiers";

/**
 * A distributor's record, kept on their Saleor customer account by the distributors app:
 *
 * - **Private** `wv_dist.record` holds it (status, tier, application) and is the only thing trusted.
 * - **Public** `wv_dist.status` and `wv_dist.tier` are copies Saleor can search on, to list applications and
 *   distributors. Customers can edit their own public metadata, so the copies are never trusted for pricing.
 *
 * Pure, so parsing is tested on its own.
 */

export const DISTRIBUTOR_KEYS = {
	record: "wv_dist.record",
	indexStatus: "wv_dist.status",
	indexTier: "wv_dist.tier",
} as const;

export type DistributorStatus = "pending" | "approved" | "paused" | "rejected";

export type DistributorApplicationRecord = {
	businessName: string;
	contactName: string;
	email: string;
	phone: string;
	country: string;
	region: string;
	businessType: string;
	licenseNumber: string;
	taxPermit: string;
	website: string;
	monthlyVolume: string;
	requestedTier: DistributorTierId;
	message: string;
};

export type DistributorRecord = {
	status: DistributorStatus;
	/** The tier the owner approved them at (null until approved). */
	tierId: DistributorTierId | null;
	application: DistributorApplicationRecord | null;
	appliedAt: string | null;
	/** When they were last approved, moved between tiers, paused or rejected. */
	decidedAt: string | null;
};

const STATUSES: readonly DistributorStatus[] = ["pending", "approved", "paused", "rejected"];
const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.slice(0, max) : "");
const isoOrNull = (v: unknown): string | null =>
	typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;

function parseApplication(v: unknown): DistributorApplicationRecord | null {
	if (!v || typeof v !== "object") return null;
	const a = v as Record<string, unknown>;
	if (!str(a.businessName) || !str(a.email)) return null;
	return {
		businessName: str(a.businessName, 120),
		contactName: str(a.contactName, 120),
		email: str(a.email, 200),
		phone: str(a.phone, 40),
		country: str(a.country, 80),
		region: str(a.region, 80),
		businessType: str(a.businessType, 80),
		licenseNumber: str(a.licenseNumber, 80),
		taxPermit: str(a.taxPermit, 80),
		website: str(a.website, 300),
		monthlyVolume: str(a.monthlyVolume, 80),
		requestedTier: isDistributorTierId(a.requestedTier) ? a.requestedTier : "small",
		message: str(a.message, 2000),
	};
}

/** A stored record, or null when there's none or it can't be read. */
export function parseDistributorRecord(raw: string | null | undefined): DistributorRecord | null {
	if (!raw) return null;
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!v || typeof v !== "object") return null;
	const r = v as Record<string, unknown>;
	const status = STATUSES.find((s) => s === r.status);
	if (!status) return null;
	return {
		status,
		tierId: isDistributorTierId(r.tierId) ? r.tierId : null,
		application: parseApplication(r.application),
		appliedAt: isoOrNull(r.appliedAt),
		decidedAt: isoOrNull(r.decidedAt),
	};
}

export const serializeDistributorRecord = (record: DistributorRecord): string => JSON.stringify(record);

export function newDistributorApplication(
	application: DistributorApplicationRecord,
	now: Date,
): DistributorRecord {
	return { status: "pending", tierId: null, application, appliedAt: now.toISOString(), decidedAt: null };
}

/** The tier a record earns wholesale prices at right now: only an approved distributor with a tier. */
export const activeTierId = (record: DistributorRecord | null): DistributorTierId | null =>
	record?.status === "approved" ? record.tierId : null;
