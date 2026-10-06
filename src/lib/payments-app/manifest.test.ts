import { describe, expect, it } from "vitest";
import { PAYMENTS_APP_VERSION } from "./constants";
import { WEBHOOK_DEFINITIONS, buildPaymentsAppManifest } from "./manifest";

const manifest = buildPaymentsAppManifest("https://shop.example/");
const webhook = (slug: string) => {
	const definition = WEBHOOK_DEFINITIONS.find((candidate) => candidate.slug === slug)!;
	return (
		manifest.webhooks.find((candidate) => candidate.targetUrl.endsWith(`/webhooks/${slug}`)) ?? definition
	);
};

describe("payments app manifest", () => {
	it("asks for MANAGE_ORDERS as well as HANDLE_PAYMENTS, which the installment job needs to read and update orders", () => {
		expect(manifest.permissions).toEqual(["HANDLE_PAYMENTS", "MANAGE_ORDERS"]);
	});

	it("bumps the version so Saleor offers the upgrade, and says it handles Pay in 4", () => {
		expect(manifest.version).toBe(PAYMENTS_APP_VERSION);
		expect(PAYMENTS_APP_VERSION).not.toBe("1.1.0");
		expect(manifest.about).toMatch(/Pay in 4/);
	});

	it("gives each webhook either sync or async events, never both and never neither", () => {
		for (const hook of manifest.webhooks as Array<{
			syncEvents?: string[];
			asyncEvents?: string[];
			name: string;
		}>) {
			const kinds = [hook.syncEvents, hook.asyncEvents].filter(Boolean);
			expect(kinds, hook.name).toHaveLength(1);
		}
	});

	it("keeps the payment webhooks synchronous, exactly as before", () => {
		expect(
			manifest.webhooks
				.filter((hook) => "syncEvents" in hook)
				.map((hook) => (hook as { syncEvents: string[] }).syncEvents),
		).toEqual([
			["PAYMENT_GATEWAY_INITIALIZE_SESSION"],
			["TRANSACTION_INITIALIZE_SESSION"],
			["TRANSACTION_REFUND_REQUESTED"],
			["TRANSACTION_CANCELATION_REQUESTED"],
		]);
	});

	it("adds an asynchronous order-created webhook pointing at the app", () => {
		expect(webhook("order-created")).toMatchObject({
			asyncEvents: ["ORDER_CREATED"],
			targetUrl: "https://shop.example/api/saleor-app/webhooks/order-created",
			isActive: true,
		});
		expect(webhook("order-created")).not.toHaveProperty("syncEvents");
	});

	it("selects, on the checkout, everything the Pay in 4 deposit check reads", () => {
		const { query } = WEBHOOK_DEFINITIONS.find((hook) => hook.slug === "transaction-initialize")!;
		for (const field of ["totalPrice { gross { amount currency } }", "channel { slug }", "chargeStatus"]) {
			expect(query).toContain(field);
		}
	});

	it("asks only for the order's id when an order is created, since the job re-reads the order itself", () => {
		const { query } = WEBHOOK_DEFINITIONS.find((hook) => hook.slug === "order-created")!;
		expect(query).toMatch(/on OrderCreated/);
		expect(query).toContain("order { id }");
	});
});
