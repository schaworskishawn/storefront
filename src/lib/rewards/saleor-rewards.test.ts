import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	addRewardsOrderNote,
	adjustLot,
	createLot,
	deactivateLot,
	fetchRewardsOrder,
	findLotsByOrder,
	listLots,
	listUsageForOrder,
	markRestored,
	readLotCode,
	storeLotCode,
	toLot,
	toRewardsOrder,
	usageForOrder,
} from "./saleor-rewards";
import { LOT_CODE_KEY, LOT_ORDER_KEY, LOT_RESTORED_PREFIX, TOKEN_TAG } from "./tokens";

const options = (impl: typeof fetch) => ({
	apiUrl: "https://saleor.example/graphql/",
	token: "app-token",
	fetchImpl: impl,
});
const reply = (data: unknown, extra: Record<string, unknown> = {}) =>
	vi.fn(() => Promise.resolve(Response.json({ data, ...extra }))) as unknown as typeof fetch;
const bodyOf = (impl: typeof fetch, call = 0) =>
	JSON.parse((vi.mocked(impl).mock.calls[call][1] as { body: string }).body) as {
		query: string;
		variables: Record<string, any>;
	};

const rawOrder = (patch: Record<string, unknown> = {}) => ({
	id: "T3JkZXI6MQ==",
	number: "1042",
	created: "2026-10-06T15:00:00+00:00",
	status: "UNFULFILLED",
	userEmail: "buyer@example.com",
	user: { id: "VXNlcjox", email: "buyer@example.com" },
	channel: { slug: "cad" },
	total: { gross: { amount: 123, currency: "cad" }, tax: { amount: 13 } },
	subtotal: { gross: { amount: 100 } },
	shippingPrice: { gross: { amount: 10 } },
	totalCharged: { amount: 123, currency: "CAD" },
	...patch,
});

const rawLot = (patch: Record<string, unknown> = {}) => ({
	id: "R2lmdENhcmQ6MQ==",
	isActive: true,
	expiryDate: "2027-10-06",
	created: "2026-10-06T15:00:00+00:00",
	currentBalance: { amount: 3, currency: "cad" },
	initialBalance: { amount: 3, currency: "cad" },
	orderId: "T3JkZXI6MQ==",
	code: "CODE-ABC",
	...patch,
});

describe("toRewardsOrder", () => {
	it("reads an order into cents, the customer's id and the amounts that decide what it earns", () => {
		expect(toRewardsOrder(rawOrder())).toEqual({
			id: "T3JkZXI6MQ==",
			number: "1042",
			createdAt: "2026-10-06T15:00:00+00:00",
			status: "UNFULFILLED",
			email: "buyer@example.com",
			userId: "VXNlcjox",
			channel: "cad",
			currency: "CAD",
			chargedCents: 12300,
			shippingCents: 1000,
			taxCents: 1300,
			subtotalCents: 10000,
		});
	});

	it("has no customer id for a guest order, and no tax when there is none", () => {
		const order = toRewardsOrder(
			rawOrder({ user: null, total: { gross: { amount: 110, currency: "CAD" }, tax: null } }),
		);
		expect(order).toMatchObject({ userId: null, taxCents: 0 });
	});

	it("rounds money without floating-point drift", () => {
		expect(toRewardsOrder(rawOrder({ totalCharged: { amount: 19.99 } }))?.chargedCents).toBe(1999);
	});

	it("is null for an order missing what we need", () => {
		expect(toRewardsOrder(null)).toBeNull();
		expect(toRewardsOrder(rawOrder({ id: undefined }))).toBeNull();
		expect(toRewardsOrder(rawOrder({ channel: null }))).toBeNull();
		expect(toRewardsOrder(rawOrder({ total: null }))).toBeNull();
	});
});

describe("toLot", () => {
	it("reads a gift card into a lot in cents, with its expiry, order and stored code", () => {
		expect(toLot(rawLot())).toEqual({
			id: "R2lmdENhcmQ6MQ==",
			currency: "CAD",
			balanceCents: 300,
			initialCents: 300,
			expiryDate: "2027-10-06",
			createdAt: "2026-10-06T15:00:00+00:00",
			isActive: true,
			orderId: "T3JkZXI6MQ==",
			code: "CODE-ABC",
		});
	});

	it("has no expiry for a lot that never expires, and no code when none was asked for", () => {
		expect(toLot(rawLot({ expiryDate: null, code: undefined }))).toMatchObject({
			expiryDate: null,
			code: null,
		});
	});

	it("is null for a card that can't be read", () => {
		expect(toLot(null)).toBeNull();
		expect(toLot(rawLot({ id: undefined }))).toBeNull();
		expect(toLot(rawLot({ currentBalance: null }))).toBeNull();
	});
});

describe("fetchRewardsOrder", () => {
	it("asks Saleor for the order with the rewards app's token", async () => {
		const impl = reply({ order: rawOrder() });
		expect(await fetchRewardsOrder("T3JkZXI6MQ==", options(impl))).toMatchObject({
			ok: true,
			value: { number: "1042" },
		});
		expect(vi.mocked(impl).mock.calls[0][1]).toMatchObject({
			headers: { Authorization: "Bearer app-token" },
		});
	});

	it("says what's missing rather than throwing", async () => {
		const noToken = await fetchRewardsOrder("x", { apiUrl: "https://s/", token: null, fetchImpl: reply({}) });
		expect(noToken).toMatchObject({ ok: false, message: expect.stringContaining("REWARDS_APP_TOKEN") });
		const offline = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
		expect(await fetchRewardsOrder("x", options(offline))).toMatchObject({
			ok: false,
			message: "Couldn't reach Saleor.",
		});
		const denied = reply(
			{ order: null },
			{
				errors: [
					{ message: "To access this path, you need one of the following permissions: MANAGE_ORDERS" },
				],
			},
		);
		expect(await fetchRewardsOrder("x", options(denied))).toMatchObject({ ok: false });
	});
});

describe("listing lots", () => {
	const page = (ids: string[], next: string | null) => ({
		giftCards: {
			edges: ids.map((id) => ({ node: rawLot({ id }) })),
			pageInfo: { hasNextPage: next !== null, endCursor: next },
		},
	});

	it("lists a customer's lots through every page, filtered to the customer and the token tag", async () => {
		const impl = vi
			.fn()
			.mockImplementationOnce(() => Promise.resolve(Response.json({ data: page(["a", "b"], "c1") })))
			.mockImplementationOnce(() =>
				Promise.resolve(Response.json({ data: page(["c"], null) })),
			) as unknown as typeof fetch;
		const result = await listLots("VXNlcjox", options(impl));
		expect(result.ok && result.value.map((lot) => lot.id)).toEqual(["a", "b", "c"]);
		expect(bodyOf(impl, 0).variables).toEqual({ assignedTo: ["VXNlcjox"], after: null, withCode: false });
		expect(bodyOf(impl, 0).query).toContain(`tags: ["${TOKEN_TAG}"]`);
		expect(bodyOf(impl, 1).variables.after).toBe("c1");
	});

	it("only asks for the stored codes when told to", async () => {
		const impl = reply(page(["a"], null));
		await listLots("VXNlcjox", { ...options(impl), withCode: true });
		expect(bodyOf(impl).variables.withCode).toBe(true);
		expect(bodyOf(impl).query).toContain(`privateMetafield(key: "${LOT_CODE_KEY}")`);
	});

	it("skips a card it can't read, and reports a permission failure rather than an empty list", async () => {
		const impl = reply({
			giftCards: {
				edges: [{ node: rawLot({ id: "ok" }) }, { node: { id: "broken" } }],
				pageInfo: { hasNextPage: false },
			},
		});
		expect(await listLots("VXNlcjox", options(impl))).toMatchObject({ ok: true, value: [{ id: "ok" }] });
		const denied = reply({ giftCards: null }, { errors: [{ message: "permission" }] });
		expect(await listLots("VXNlcjox", options(denied))).toMatchObject({ ok: false });
	});
});

describe("findLotsByOrder", () => {
	it("finds the lot an order earned by the order id on it", async () => {
		const impl = reply({ giftCards: { edges: [{ node: rawLot() }] } });
		const result = await findLotsByOrder("T3JkZXI6MQ==", options(impl));
		expect(result.ok && result.value).toHaveLength(1);
		expect(bodyOf(impl).variables).toEqual({ orderId: "T3JkZXI6MQ==", withCode: true });
		expect(bodyOf(impl).query).toContain(`key: "${LOT_ORDER_KEY}"`);
	});
});

describe("createLot", () => {
	const lot = {
		tokens: 300,
		currency: "CAD",
		expiryDate: "2027-10-06",
		userId: "VXNlcjox",
		orderId: "T3JkZXI6MQ==",
		orderNumber: "1042",
	};

	it("creates a tagged gift card worth a cent a token, restricted to the customer and marked with its order", async () => {
		const impl = reply({ giftCardCreate: { giftCard: { id: "GC1", code: "NEW-CODE" }, errors: [] } });
		expect(await createLot(lot, options(impl))).toEqual({ ok: true, value: { id: "GC1", code: "NEW-CODE" } });

		const { input } = bodyOf(impl).variables;
		expect(input).toMatchObject({
			balance: { amount: 3, currency: "CAD" },
			isActive: true,
			expiryDate: "2027-10-06",
			addTags: [TOKEN_TAG],
			assignedTo: "VXNlcjox",
		});
		expect(input.metadata).toContainEqual({ key: LOT_ORDER_KEY, value: "T3JkZXI6MQ==" });
	});

	it("never gives Saleor an email address, which would make it email the customer a gift-card code", async () => {
		const impl = reply({ giftCardCreate: { giftCard: { id: "GC1", code: "C" }, errors: [] } });
		await createLot(lot, options(impl));
		expect(bodyOf(impl).variables.input).not.toHaveProperty("userEmail");
	});

	it("leaves the expiry out for a lot that never expires", async () => {
		const impl = reply({ giftCardCreate: { giftCard: { id: "GC1", code: "C" }, errors: [] } });
		await createLot({ ...lot, expiryDate: null }, options(impl));
		expect(bodyOf(impl).variables.input).not.toHaveProperty("expiryDate");
	});

	it("reports Saleor's reason when it refuses, and when it returns no card", async () => {
		const refused = reply({ giftCardCreate: { giftCard: null, errors: [{ message: "Invalid currency." }] } });
		expect(await createLot(lot, options(refused))).toEqual({ ok: false, message: "Invalid currency." });
		const empty = reply({ giftCardCreate: { giftCard: null, errors: [] } });
		expect(await createLot(lot, options(empty))).toMatchObject({ ok: false });
	});
});

describe("changing a lot", () => {
	it("stores the code privately, and marks an order's spending as returned", async () => {
		const ok = reply({ updatePrivateMetadata: { errors: [] } });
		expect(await storeLotCode("GC1", "CODE", options(ok))).toEqual({ ok: true, value: true });
		expect(bodyOf(ok).variables).toEqual({ id: "GC1", input: [{ key: LOT_CODE_KEY, value: "CODE" }] });

		const marked = reply({ updatePrivateMetadata: { errors: [] } });
		await markRestored("GC1", "1042", options(marked));
		expect(bodyOf(marked).variables.input).toEqual([{ key: `${LOT_RESTORED_PREFIX}1042`, value: "1" }]);
	});

	it("deactivates a lot", async () => {
		const impl = reply({ giftCardDeactivate: { errors: [] } });
		expect(await deactivateLot("GC1", options(impl))).toEqual({ ok: true, value: true });
	});

	it("adjusts a lot by a change in whole dollars, in either direction", async () => {
		const up = reply({ giftCardBalanceAdjust: { errors: [] } });
		await adjustLot("GC1", 550, options(up));
		expect(bodyOf(up).variables).toEqual({ id: "GC1", amount: 5.5 });
		const down = reply({ giftCardBalanceAdjust: { errors: [] } });
		await adjustLot("GC1", -300, options(down));
		expect(bodyOf(down).variables.amount).toBe(-3);
	});

	it("reports a refusal for each", async () => {
		const refused = (key: string) => reply({ [key]: { errors: [{ message: "No." }] } });
		expect(await deactivateLot("GC1", options(refused("giftCardDeactivate")))).toEqual({
			ok: false,
			message: "No.",
		});
		expect(await adjustLot("GC1", 1, options(refused("giftCardBalanceAdjust")))).toEqual({
			ok: false,
			message: "No.",
		});
		expect(await storeLotCode("GC1", "C", options(refused("updatePrivateMetadata")))).toEqual({
			ok: false,
			message: "No.",
		});
	});
});

describe("readLotCode", () => {
	it("reads Saleor's own code for an unused lot", async () => {
		expect(await readLotCode("GC1", options(reply({ giftCard: { code: "NATIVE" } })))).toEqual({
			ok: true,
			value: "NATIVE",
		});
		expect(await readLotCode("GC1", options(reply({ giftCard: null })))).toEqual({ ok: true, value: null });
	});
});

describe("usageForOrder", () => {
	const usedIn = (orderId: string, before: number, after: number) => ({
		type: "USED_IN_ORDER",
		orderId,
		balance: { currentBalance: { amount: after }, oldCurrentBalance: { amount: before } },
	});

	it("reads how much an order took from a lot out of the lot's own history", () => {
		const usage = usageForOrder(
			[
				{
					id: "A",
					currentBalance: { currency: "cad" },
					events: [usedIn("ORDER-1", 10, 7.5), usedIn("OTHER", 7.5, 5)],
				},
			],
			"ORDER-1",
			"1042",
		);
		expect(usage).toEqual([{ lotId: "A", currency: "CAD", usedCents: 250, restored: false }]);
	});

	it("adds up an order that used a lot more than once, and skips lots it never touched", () => {
		const usage = usageForOrder(
			[
				{
					id: "A",
					currentBalance: { currency: "CAD" },
					events: [usedIn("ORDER-1", 10, 8), usedIn("ORDER-1", 8, 7)],
				},
				{ id: "B", currentBalance: { currency: "CAD" }, events: [usedIn("OTHER", 10, 1)] },
				{ id: "C", currentBalance: { currency: "CAD" }, events: [] },
			],
			"ORDER-1",
			"1042",
		);
		expect(usage).toEqual([{ lotId: "A", currency: "CAD", usedCents: 300, restored: false }]);
	});

	it("knows when this order's spending has already been returned", () => {
		const usage = usageForOrder(
			[
				{
					id: "A",
					currentBalance: { currency: "CAD" },
					privateMetadata: [{ key: `${LOT_RESTORED_PREFIX}1042`, value: "1" }],
					events: [usedIn("ORDER-1", 10, 7)],
				},
			],
			"ORDER-1",
			"1042",
		);
		expect(usage[0].restored).toBe(true);
	});

	it("ignores events that aren't a use, or whose amounts are missing", () => {
		const usage = usageForOrder(
			[
				{
					id: "A",
					currentBalance: { currency: "CAD" },
					events: [
						{ type: "BALANCE_ADJUSTED", orderId: "ORDER-1" },
						{ type: "USED_IN_ORDER", orderId: "ORDER-1", balance: null },
					],
				},
			],
			"ORDER-1",
			"1042",
		);
		expect(usage).toEqual([]);
	});
});

describe("listUsageForOrder and notes", () => {
	it("reads a customer's lots with their history and works out what an order spent", async () => {
		const impl = reply({
			giftCards: {
				edges: [
					{
						node: {
							id: "A",
							currentBalance: { currency: "CAD" },
							privateMetadata: [],
							events: [
								{
									type: "USED_IN_ORDER",
									orderId: "ORDER-1",
									balance: { currentBalance: { amount: 2 }, oldCurrentBalance: { amount: 5 } },
								},
							],
						},
					},
				],
				pageInfo: { hasNextPage: false },
			},
		});
		const result = await listUsageForOrder("VXNlcjox", "ORDER-1", "1042", options(impl));
		expect(result).toEqual({
			ok: true,
			value: [{ lotId: "A", currency: "CAD", usedCents: 300, restored: false }],
		});
		expect(bodyOf(impl).variables).toEqual({ assignedTo: ["VXNlcjox"], after: null });
	});

	it("adds a note to an order, and reports a refusal", async () => {
		const ok = reply({ orderNoteAdd: { errors: [] } });
		expect(await addRewardsOrderNote("o", "hello", options(ok))).toEqual({ ok: true, value: true });
		const refused = reply({ orderNoteAdd: { errors: [{ message: "Not allowed." }] } });
		expect(await addRewardsOrderNote("o", "x", options(refused))).toEqual({
			ok: false,
			message: "Not allowed.",
		});
	});
});
