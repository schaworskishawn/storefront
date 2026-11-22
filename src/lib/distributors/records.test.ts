import { describe, expect, it } from "vitest";
import { approve, reject, setPaused, setTier } from "./admin-ops";
import {
	normalizeDistributorApplication,
	toApplicationRecord,
	validateDistributorApplication,
} from "./application";
import {
	activeTierId,
	newDistributorApplication,
	parseDistributorRecord,
	serializeDistributorRecord,
	type DistributorRecord,
} from "./records";

const NOW = new Date("2026-11-22T12:00:00.000Z");

const form = {
	businessName: "  Neon Vapes Ltd. ",
	contactName: "Sam Lee",
	email: "Orders@NeonVapes.example",
	phone: "",
	country: "Canada",
	region: "Ontario",
	businessType: "Vape shop",
	licenseNumber: "ON-123456",
	taxPermit: "",
	website: "neonvapes.example",
	monthlyVolume: "$5,000 – $25,000 / month",
	requestedTier: "authorized",
	message: "",
	confirmAge: true,
	agree: true,
};

const pending = newDistributorApplication(toApplicationRecord(normalizeDistributorApplication(form)), NOW);
const approved: DistributorRecord = { ...pending, status: "approved", tierId: "authorized" };

describe("the distributor application", () => {
	it("accepts a complete application and tidies it", () => {
		const app = normalizeDistributorApplication(form);
		expect(validateDistributorApplication(app)).toEqual({});
		expect(app.businessName).toBe("Neon Vapes Ltd.");
		expect(app.email).toBe("orders@neonvapes.example");
		expect(toApplicationRecord(app)).not.toHaveProperty("agree");
	});

	it("names every missing or invalid field", () => {
		const errors = validateDistributorApplication(
			normalizeDistributorApplication({
				...form,
				businessName: "",
				email: "not-an-email",
				businessType: "Lemonade stand",
				licenseNumber: "1",
				monthlyVolume: "lots",
				website: "nope",
				confirmAge: false,
				agree: "yes",
			}),
		);
		expect(Object.keys(errors).sort()).toEqual(
			[
				"agree",
				"businessName",
				"businessType",
				"confirmAge",
				"email",
				"licenseNumber",
				"monthlyVolume",
				"website",
			].sort(),
		);
	});

	it("falls back to the first tier when the requested one is made up", () => {
		expect(normalizeDistributorApplication({ ...form, requestedTier: "platinum" }).requestedTier).toBe(
			"small",
		);
		expect(normalizeDistributorApplication(null).requestedTier).toBe("small");
	});
});

describe("the distributor record", () => {
	it("round-trips through Saleor metadata", () => {
		expect(parseDistributorRecord(serializeDistributorRecord(approved))).toEqual(approved);
	});

	it("treats missing or broken metadata as no record", () => {
		expect(parseDistributorRecord(null)).toBeNull();
		expect(parseDistributorRecord("{not json")).toBeNull();
		expect(parseDistributorRecord(JSON.stringify({ status: "boss" }))).toBeNull();
	});

	it("drops a tier it doesn't know", () => {
		const parsed = parseDistributorRecord(JSON.stringify({ ...approved, tierId: "platinum" }));
		expect(parsed?.tierId).toBeNull();
		expect(activeTierId(parsed)).toBeNull();
	});

	it("earns wholesale prices only while approved", () => {
		expect(activeTierId(approved)).toBe("authorized");
		expect(activeTierId(pending)).toBeNull();
		expect(activeTierId({ ...approved, status: "paused" })).toBeNull();
		expect(activeTierId({ ...approved, status: "rejected" })).toBeNull();
		expect(activeTierId(null)).toBeNull();
	});
});

describe("the owner's distributor actions", () => {
	it("approves at the tier the owner picks", () => {
		const r = approve(pending, "regional", NOW);
		expect(r).toEqual({
			ok: true,
			record: { ...pending, status: "approved", tierId: "regional", decidedAt: NOW.toISOString() },
		});
		expect(approve(pending, "platinum", NOW).ok).toBe(false);
		expect(approve(approved, "small", NOW).ok).toBe(false);
	});

	it("rejects only a pending application", () => {
		expect(reject(pending, NOW)).toMatchObject({ ok: true, record: { status: "rejected", tierId: null } });
		expect(reject(approved, NOW).ok).toBe(false);
	});

	it("moves a distributor between tiers, keeping a pause", () => {
		expect(setTier(approved, "master", NOW)).toMatchObject({ ok: true, record: { tierId: "master" } });
		expect(setTier({ ...approved, status: "paused" }, "small", NOW)).toMatchObject({
			ok: true,
			record: { status: "paused", tierId: "small" },
		});
		expect(setTier(approved, "authorized", NOW).ok).toBe(false);
		expect(setTier(pending, "small", NOW).ok).toBe(false);
	});

	it("pauses and resumes wholesale pricing", () => {
		const paused = setPaused(approved, true, NOW);
		expect(paused).toMatchObject({ ok: true, record: { status: "paused", tierId: "authorized" } });
		if (!paused.ok) throw new Error("expected a pause");
		expect(setPaused(paused.record, false, NOW)).toMatchObject({ ok: true, record: { status: "approved" } });
		expect(setPaused(pending, true, NOW).ok).toBe(false);
		expect(setPaused(approved, false, NOW).ok).toBe(false);
	});
});
