import { describe, expect, it } from "vitest";
import { type ReadonlyURLSearchParams } from "next/navigation";
import { buildPaymentReturnUrl } from "./build-payment-return-url";

const params = (search: string) => new URLSearchParams(search) as unknown as ReadonlyURLSearchParams;
const location = { origin: "https://shop.example", pathname: "/checkout" };

describe("buildPaymentReturnUrl", () => {
	it("returns to the payment step of the same checkout, flagged as processing", () => {
		const url = new URL(buildPaymentReturnUrl(params("checkout=co-1&step=information"), location));
		expect(url.origin + url.pathname).toBe("https://shop.example/checkout");
		expect(url.searchParams.get("checkout")).toBe("co-1");
		expect(url.searchParams.get("processingPayment")).toBe("true");
		expect(url.searchParams.get("step")).toBe("payment");
	});

	it("drops the leftovers of an earlier attempt", () => {
		const url = new URL(
			buildPaymentReturnUrl(params("checkout=co-1&redirectResult=old&transaction=tx-old"), location),
		);
		expect(url.searchParams.has("redirectResult")).toBe(false);
		expect(url.searchParams.has("transaction")).toBe(false);
		expect(url.searchParams.get("checkout")).toBe("co-1");
	});
});
