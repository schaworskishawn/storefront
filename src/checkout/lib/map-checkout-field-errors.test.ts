import { describe, expect, it } from "vitest";
import { FORM_ERROR_KEY, mapCheckoutFieldErrors } from "./map-checkout-field-errors";

const knownFields = ["email", "firstName", "postalCode", "streetAddress1"];

describe("mapCheckoutFieldErrors", () => {
	it("puts an error on the input it belongs to", () => {
		expect(
			mapCheckoutFieldErrors({
				fieldErrors: [{ field: "postalCode", message: "Invalid postal code", code: "INVALID" }],
				knownFields,
				fallbackMessage: "Invalid value",
			}),
		).toEqual({ postalCode: "Invalid postal code" });
	});

	it("shows an error for a field the form has no input for, instead of dropping it", () => {
		expect(
			mapCheckoutFieldErrors({
				fieldErrors: [
					{
						field: "quantity",
						message: "Could not add items Blue Razz. Only 0 remaining in stock.",
						code: "INSUFFICIENT_STOCK",
					},
				],
				knownFields,
				fallbackMessage: "Invalid value",
			}),
		).toEqual({ [FORM_ERROR_KEY]: "Could not add items Blue Razz. Only 0 remaining in stock." });
	});

	it("treats an error with no field the same way", () => {
		expect(
			mapCheckoutFieldErrors({
				fieldErrors: [{ field: null, message: "Something went wrong", code: "ERROR" }],
				knownFields,
				fallbackMessage: "Invalid value",
			}),
		).toEqual({ [FORM_ERROR_KEY]: "Something went wrong" });
	});

	it("swaps in the friendlier wording for a code when one is given", () => {
		expect(
			mapCheckoutFieldErrors({
				fieldErrors: [
					{ field: "quantity", message: "Only 0 remaining in stock.", code: "INSUFFICIENT_STOCK" },
				],
				knownFields,
				fallbackMessage: "Invalid value",
				messageByCode: { INSUFFICIENT_STOCK: "Some items can't be shipped to this address." },
			}),
		).toEqual({ [FORM_ERROR_KEY]: "Some items can't be shipped to this address." });
	});

	it("falls back when Saleor sent no message", () => {
		expect(
			mapCheckoutFieldErrors({
				fieldErrors: [{ field: "firstName", message: null, code: "REQUIRED" }],
				knownFields,
				fallbackMessage: "Invalid value",
			}),
		).toEqual({ firstName: "Invalid value" });
	});

	it("keeps the first message when several errors hit the same place", () => {
		expect(
			mapCheckoutFieldErrors({
				fieldErrors: [
					{ field: "quantity", message: "First", code: "INSUFFICIENT_STOCK" },
					{ field: "lines", message: "Second", code: "INVALID" },
				],
				knownFields,
				fallbackMessage: "Invalid value",
			}),
		).toEqual({ [FORM_ERROR_KEY]: "First" });
	});

	it("handles a mix of input and whole-form errors", () => {
		expect(
			mapCheckoutFieldErrors({
				fieldErrors: [
					{ field: "streetAddress1", message: "Required", code: "REQUIRED" },
					{ field: "quantity", message: "Out of stock", code: "INSUFFICIENT_STOCK" },
				],
				knownFields,
				fallbackMessage: "Invalid value",
			}),
		).toEqual({ streetAddress1: "Required", [FORM_ERROR_KEY]: "Out of stock" });
	});
});
