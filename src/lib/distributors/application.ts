import type { DistributorApplicationRecord } from "./records";
import { DISTRIBUTOR_TIERS, isDistributorTierId } from "./tiers";

/** The distributor application's fields and checks, shared by the form and /api/distributor. Pure. */

export const BUSINESS_TYPES = [
	"Vape shop",
	"Convenience / smoke shop",
	"Online store",
	"Wholesaler / distributor",
	"Chain / multiple locations",
	"Other",
] as const;

export const MONTHLY_VOLUMES = [
	"Under $1,000 / month",
	"$1,000 – $5,000 / month",
	"$5,000 – $25,000 / month",
	"$25,000 – $100,000 / month",
	"$100,000+ / month",
] as const;

export const TIER_OPTIONS = DISTRIBUTOR_TIERS.map((t) => ({ value: t.id, label: t.name }));

export type DistributorApplicationInput = DistributorApplicationRecord & {
	confirmAge: boolean;
	agree: boolean;
};
export type DistributorFieldErrors = Partial<Record<keyof DistributorApplicationInput, string>>;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizeDistributorApplication(raw: unknown): DistributorApplicationInput {
	const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return {
		businessName: text(r.businessName, 120),
		contactName: text(r.contactName, 120),
		email: text(r.email, 200).toLowerCase(),
		phone: text(r.phone, 40),
		country: text(r.country, 80),
		region: text(r.region, 80),
		businessType: text(r.businessType, 80),
		licenseNumber: text(r.licenseNumber, 80),
		taxPermit: text(r.taxPermit, 80),
		website: text(r.website, 300),
		monthlyVolume: text(r.monthlyVolume, 80),
		requestedTier: isDistributorTierId(r.requestedTier) ? r.requestedTier : "small",
		message: text(r.message, 2000),
		confirmAge: r.confirmAge === true,
		agree: r.agree === true,
	};
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDistributorApplication(a: DistributorApplicationInput): DistributorFieldErrors {
	const e: DistributorFieldErrors = {};
	if (a.businessName.length < 2) e.businessName = "Enter your business's legal or trading name.";
	if (a.contactName.length < 2) e.contactName = "Enter the name of the person we should talk to.";
	if (!EMAIL.test(a.email)) e.email = "Enter a valid email address.";
	if (a.country.length < 2) e.country = "Enter your country.";
	if (a.region.length < 2) e.region = "Enter your province or state.";
	if (!(BUSINESS_TYPES as readonly string[]).includes(a.businessType))
		e.businessType = "Choose your type of business.";
	if (a.licenseNumber.length < 3) e.licenseNumber = "Enter your business licence or registration number.";
	if (!(MONTHLY_VOLUMES as readonly string[]).includes(a.monthlyVolume))
		e.monthlyVolume = "Choose your expected monthly volume.";
	if (a.website && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}/i.test(a.website))
		e.website = "Enter a valid website address.";
	if (!a.confirmAge) e.confirmAge = "You must be of legal age and licensed to sell where you operate.";
	if (!a.agree) e.agree = "Please accept the program terms.";
	return e;
}

/** The record to keep: the application without the two consent ticks (they're checked, not stored). */
export function toApplicationRecord(a: DistributorApplicationInput): DistributorApplicationRecord {
	const { confirmAge: _age, agree: _agree, ...record } = a;
	return record;
}

/** The application as plain text, for the owner's notification email. */
export function applicationText(a: DistributorApplicationRecord): string {
	const tier = DISTRIBUTOR_TIERS.find((t) => t.id === a.requestedTier)?.name ?? a.requestedTier;
	return [
		`Business: ${a.businessName}`,
		`Contact: ${a.contactName} <${a.email}>${a.phone ? `, ${a.phone}` : ""}`,
		`Location: ${a.region}, ${a.country}`,
		`Type: ${a.businessType}`,
		`Licence / registration: ${a.licenseNumber}`,
		a.taxPermit ? `Tobacco / vapour permit: ${a.taxPermit}` : "",
		a.website ? `Website: ${a.website}` : "",
		`Expected volume: ${a.monthlyVolume}`,
		`Tier requested: ${tier}`,
		a.message ? `\n${a.message}` : "",
	]
		.filter(Boolean)
		.join("\n");
}
