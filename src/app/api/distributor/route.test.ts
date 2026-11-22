import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Auth = { status: "authenticated"; user: { id: string; email: string } } | { status: "anonymous" };
const auth = vi.fn<() => Promise<Auth>>();
const staff = vi.fn(async () => false);
const configured = vi.fn(() => true);
const getAccount = vi.fn();
const save = vi.fn(async (..._args: unknown[]) => ({ ok: true, value: undefined }));

vi.mock("@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user", () => ({
	getAccountAuthState: () => auth(),
}));
vi.mock("@/lib/affiliates/staff", () => ({ isSignedInStaff: () => staff() }));
vi.mock("@/lib/distributors/saleor-distributors", () => ({
	isDistributorAppConfigured: () => configured(),
	getDistributorAccount: (...a: unknown[]) => getAccount(...a),
	saveDistributorRecord: (...a: unknown[]) => save(...a),
}));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => false, sendNotification: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimited: () => false }));

import { POST } from "./route";

const valid = {
	businessName: "Neon Vapes Ltd.",
	contactName: "Sam Lee",
	email: "orders@neonvapes.example",
	country: "Canada",
	region: "Ontario",
	businessType: "Vape shop",
	licenseNumber: "ON-123456",
	monthlyVolume: "$5,000 – $25,000 / month",
	requestedTier: "partner",
	confirmAge: true,
	agree: true,
};
const apply = (body: unknown) =>
	POST(new Request("https://shop.example/api/distributor", { method: "POST", body: JSON.stringify(body) }));
const signedIn: Auth = { status: "authenticated", user: { id: "user-1", email: "sam@example.com" } };

beforeEach(() => {
	auth.mockResolvedValue(signedIn);
	staff.mockResolvedValue(false);
	configured.mockReturnValue(true);
	getAccount.mockResolvedValue({ ok: true, value: null });
});
afterEach(() => vi.clearAllMocks());

describe("applying to be a distributor", () => {
	it("needs a signed-in account, and saves nothing without one", async () => {
		auth.mockResolvedValue({ status: "anonymous" });
		const res = await apply(valid);
		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({ signIn: true });
		expect(save).not.toHaveBeenCalled();
	});

	it("refuses staff accounts", async () => {
		staff.mockResolvedValue(true);
		expect((await apply(valid)).status).toBe(403);
		expect(save).not.toHaveBeenCalled();
	});

	it("returns the field errors for an incomplete application", async () => {
		const res = await apply({ ...valid, licenseNumber: "" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { errors: Record<string, string> };
		expect(body.errors).toHaveProperty("licenseNumber");
	});

	it("saves the application as pending, never approved", async () => {
		const res = await apply({ ...valid, status: "approved", tierId: "master" });
		expect(res.status).toBe(200);
		const [userId, record] = save.mock.calls[0] as [string, { status: string; tierId: unknown }];
		expect(userId).toBe("user-1");
		expect(record).toMatchObject({ status: "pending", tierId: null });
	});

	it("doesn't let a distributor re-apply over their tier", async () => {
		getAccount.mockResolvedValue({ ok: true, value: { record: { status: "approved" } } });
		expect((await apply(valid)).status).toBe(409);
		expect(save).not.toHaveBeenCalled();
	});

	it("offers email instead while the program isn't set up", async () => {
		configured.mockReturnValue(false);
		const res = await apply(valid);
		expect(res.status).toBe(501);
		expect(await res.json()).toMatchObject({ fallback: true });
	});
});
