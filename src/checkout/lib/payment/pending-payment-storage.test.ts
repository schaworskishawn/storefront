import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearPendingPayment, readPendingPayment, writePendingPayment } from "./pending-payment-storage";

describe("pending-payment-storage", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
	});

	it("round-trips an attempt for its own checkout", () => {
		writePendingPayment("adyen", { checkoutId: "co-1", transactionId: "txn-1", paymentData: "pd" });
		expect(readPendingPayment("adyen", "co-1")).toEqual({
			checkoutId: "co-1",
			transactionId: "txn-1",
			paymentData: "pd",
		});
	});

	it("never returns an attempt belonging to another checkout", () => {
		writePendingPayment("crypto", { checkoutId: "co-1", transactionId: "txn-1" });
		expect(readPendingPayment("crypto", "co-2")).toBeNull();
	});

	it("keeps providers apart", () => {
		writePendingPayment("adyen", { checkoutId: "co-1", transactionId: "txn-a" });
		expect(readPendingPayment("crypto", "co-1")).toBeNull();
	});

	it("clears one provider without touching the other", () => {
		writePendingPayment("adyen", { checkoutId: "co-1", transactionId: "txn-a" });
		writePendingPayment("crypto", { checkoutId: "co-1", transactionId: "txn-c" });
		clearPendingPayment("adyen");
		expect(readPendingPayment("adyen", "co-1")).toBeNull();
		expect(readPendingPayment("crypto", "co-1")?.transactionId).toBe("txn-c");
	});

	it("ignores corrupt or incomplete entries", () => {
		sessionStorage.setItem("checkout:pending-payment:adyen", "{not json");
		expect(readPendingPayment("adyen", "co-1")).toBeNull();
		sessionStorage.setItem(
			"checkout:pending-payment:adyen",
			JSON.stringify({ checkoutId: "co-1", transactionId: "" }),
		);
		expect(readPendingPayment("adyen", "co-1")).toBeNull();
	});
});
