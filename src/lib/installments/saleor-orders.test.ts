import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildInstallmentPlan } from "./plan";
import { RECORD_METADATA_KEY, STATUS_METADATA_KEY, createRecord, serializeRecord } from "./record";
import {
	addOrderNote,
	fetchOrder,
	listActiveOrders,
	listOrdersSince,
	savePlan,
	toSnapshot,
} from "./saleor-orders";

const record = createRecord({
	plan: buildInstallmentPlan(100)!,
	currency: "CAD",
	depositTransactionId: "60001",
	saleorTransactionId: "txn",
	card: { customerProfileId: "9001", paymentProfileId: "8001" },
	orderedAt: new Date("2026-10-06T15:00:00Z"),
	now: new Date("2026-10-06T15:00:00Z"),
});

const raw = (patch: Record<string, unknown> = {}) => ({
	id: "T3JkZXI6MQ==",
	number: "1042",
	created: "2026-10-06T15:00:00+00:00",
	status: "UNFULFILLED",
	userEmail: "buyer@example.com",
	user: null,
	channel: { slug: "cad" },
	total: { gross: { amount: 100, currency: "CAD" } },
	transactions: [{ id: "tx-1", pspReference: "inst:60001", chargedAmount: { amount: 25 } }],
	privateMetafield: null,
	...patch,
});

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

describe("toSnapshot", () => {
	it("reads an order into money in cents, an email, and the deposit transaction", () => {
		expect(toSnapshot(raw())).toMatchObject({
			id: "T3JkZXI6MQ==",
			number: "1042",
			status: "UNFULFILLED",
			email: "buyer@example.com",
			channel: "cad",
			currency: "CAD",
			totalCents: 10000,
			transactions: [{ id: "tx-1", pspReference: "inst:60001", chargedCents: 2500 }],
			record: null,
			unreadablePlan: false,
		});
	});

	it("falls back to the account's email for a signed-in customer's order", () => {
		expect(toSnapshot(raw({ userEmail: null, user: { email: "member@example.com" } }))?.email).toBe(
			"member@example.com",
		);
		expect(toSnapshot(raw({ userEmail: null }))?.email).toBeNull();
	});

	it("reads the stored plan back, and flags a damaged one instead of treating it as no plan", () => {
		expect(toSnapshot(raw({ privateMetafield: serializeRecord(record) }))).toMatchObject({
			record,
			unreadablePlan: false,
		});
		expect(toSnapshot(raw({ privateMetafield: "{not json" }))).toMatchObject({
			record: null,
			unreadablePlan: true,
		});
	});

	it("rounds money without floating-point drift", () => {
		const snapshot = toSnapshot(
			raw({
				total: { gross: { amount: 19.99, currency: "cad" } },
				transactions: [{ id: "t", chargedAmount: { amount: 5.02 } }],
			}),
		);
		expect(snapshot).toMatchObject({ totalCents: 1999, currency: "CAD" });
		expect(snapshot?.transactions[0]).toMatchObject({ chargedCents: 502, pspReference: null });
	});

	it("is null for an order missing what we need, and ignores transactions without an id", () => {
		expect(toSnapshot(null)).toBeNull();
		expect(toSnapshot(raw({ id: undefined }))).toBeNull();
		expect(toSnapshot(raw({ channel: null }))).toBeNull();
		expect(toSnapshot(raw({ total: null }))).toBeNull();
		expect(toSnapshot(raw({ transactions: [{ pspReference: "x" }] }))?.transactions).toEqual([]);
	});
});

describe("fetchOrder", () => {
	it("asks Saleor for the order with the app's token", async () => {
		const impl = reply({ order: raw() });
		const result = await fetchOrder("T3JkZXI6MQ==", options(impl));
		expect(result).toMatchObject({ ok: true, value: { number: "1042" } });
		expect(bodyOf(impl).variables).toEqual({ id: "T3JkZXI6MQ==" });
		expect(vi.mocked(impl).mock.calls[0][1]).toMatchObject({
			headers: { Authorization: "Bearer app-token" },
		});
	});

	it("selects the stored plan from the order's private metadata", async () => {
		const impl = reply({ order: raw() });
		await fetchOrder("x", options(impl));
		expect(bodyOf(impl).query).toContain(`privateMetafield(key: "${RECORD_METADATA_KEY}")`);
	});

	it("says what's missing rather than throwing: no token, no URL, network down, bad status, GraphQL errors", async () => {
		expect(await fetchOrder("x", { apiUrl: "https://s/", token: null, fetchImpl: reply({}) })).toMatchObject({
			ok: false,
			message: expect.stringContaining("PAYMENTS_APP_TOKEN"),
		});
		expect(await fetchOrder("x", { apiUrl: "", token: "t", fetchImpl: reply({}) })).toMatchObject({
			ok: false,
		});
		const offline = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
		expect(await fetchOrder("x", options(offline))).toMatchObject({
			ok: false,
			message: "Couldn't reach Saleor.",
		});
		const bad = vi.fn(() =>
			Promise.resolve(new Response("nope", { status: 401 })),
		) as unknown as typeof fetch;
		expect(await fetchOrder("x", options(bad))).toMatchObject({ ok: false, message: "Saleor answered 401." });
		const denied = reply(
			{ order: null },
			{
				errors: [
					{ message: "To access this path, you need one of the following permissions: MANAGE_ORDERS" },
				],
			},
		);
		expect(await fetchOrder("x", options(denied))).toMatchObject({
			ok: false,
			message: expect.stringContaining("MANAGE_ORDERS"),
		});
	});

	it("returns null for an order that doesn't exist", async () => {
		expect(await fetchOrder("x", options(reply({ order: null })))).toEqual({ ok: true, value: null });
	});
});

describe("listing orders", () => {
	const page = (ids: string[], next: string | null) => ({
		orders: {
			edges: ids.map((number) => ({ node: raw({ id: `id-${number}`, number }) })),
			pageInfo: { hasNextPage: next !== null, endCursor: next },
		},
	});

	it("finds active plans by the public marker, following every page", async () => {
		const impl = vi
			.fn()
			.mockImplementationOnce(() => Promise.resolve(Response.json({ data: page(["1", "2"], "cursor-1") })))
			.mockImplementationOnce(() =>
				Promise.resolve(Response.json({ data: page(["3"], null) })),
			) as unknown as typeof fetch;
		const result = await listActiveOrders(options(impl));
		expect(result.ok && result.value.map((order) => order.number)).toEqual(["1", "2", "3"]);
		expect(bodyOf(impl, 0).variables.filter).toEqual({
			metadata: [{ key: STATUS_METADATA_KEY, value: "active" }],
		});
		expect(bodyOf(impl, 1).variables.after).toBe("cursor-1");
	});

	it("lists orders created since a date", async () => {
		const impl = reply(page(["9"], null));
		await listOrdersSince("2026-10-03", options(impl));
		expect(bodyOf(impl).variables.filter).toEqual({ created: { gte: "2026-10-03" } });
	});

	it("skips an order it can't read instead of failing the whole list", async () => {
		const impl = reply({
			orders: {
				edges: [{ node: raw({ number: "1" }) }, { node: { id: "broken" } }, { node: null }],
				pageInfo: { hasNextPage: false },
			},
		});
		const result = await listActiveOrders(options(impl));
		expect(result.ok && result.value).toHaveLength(1);
	});

	it("reports a failure rather than a falsely empty list", async () => {
		const denied = reply({ orders: null }, { errors: [{ message: "permission" }] });
		expect(await listActiveOrders(options(denied))).toMatchObject({ ok: false });
	});
});

describe("savePlan", () => {
	it("stores the full record privately and only the status publicly", async () => {
		const impl = reply({ updatePrivateMetadata: { errors: [] }, updateMetadata: { errors: [] } });
		expect(await savePlan("order-1", record, options(impl))).toEqual({ ok: true, value: true });

		const { variables } = bodyOf(impl);
		expect(variables.id).toBe("order-1");
		expect(variables.private).toEqual([{ key: RECORD_METADATA_KEY, value: serializeRecord(record) }]);
		expect(variables.public).toEqual([{ key: STATUS_METADATA_KEY, value: "active" }]);
		// Nothing about the saved card may be in the public metadata.
		expect(JSON.stringify(variables.public)).not.toContain("9001");
	});

	it("reports Saleor's reason when it refuses either update", async () => {
		const refusedPrivate = reply({
			updatePrivateMetadata: { errors: [{ message: "No." }] },
			updateMetadata: { errors: [] },
		});
		expect(await savePlan("o", record, options(refusedPrivate))).toEqual({ ok: false, message: "No." });
		const refusedPublic = reply({
			updatePrivateMetadata: { errors: [] },
			updateMetadata: { errors: [{ message: "Nope." }] },
		});
		expect(await savePlan("o", record, options(refusedPublic))).toEqual({ ok: false, message: "Nope." });
	});
});

describe("addOrderNote", () => {
	it("adds a note and reports a refusal", async () => {
		const ok = reply({ orderNoteAdd: { errors: [] } });
		expect(await addOrderNote("o", "hello", options(ok))).toEqual({ ok: true, value: true });
		expect(bodyOf(ok).variables).toEqual({ id: "o", message: "hello" });
		const refused = reply({ orderNoteAdd: { errors: [{ message: "Not allowed." }] } });
		expect(await addOrderNote("o", "x", options(refused))).toEqual({ ok: false, message: "Not allowed." });
	});
});
