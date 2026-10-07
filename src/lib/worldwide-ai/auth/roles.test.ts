import { describe, expect, it } from "vitest";
import { readConfig } from "../config";
import { operatorFor } from "./roles";

const config = readConfig({
	WORLDWIDE_AI_OWNER_EMAILS: "Olivia@Example.com",
	WORLDWIDE_AI_STAFF_EMAILS: "sam@example.com, pat@example.com",
});
const staffer = {
	id: "U1",
	email: "sam@example.com",
	firstName: "Sam",
	lastName: "Staff",
	isStaff: true,
	isActive: true,
};

describe("who may use the dashboard", () => {
	it("makes a listed staff account an owner or a staff member", () => {
		expect(
			operatorFor({ ...staffer, email: "OLIVIA@example.com", firstName: "Olivia", lastName: "" }, config),
		).toEqual({
			kind: "operator",
			id: "U1",
			label: "Olivia",
			role: "owner",
		});
		expect(operatorFor(staffer, config)).toEqual({
			kind: "operator",
			id: "U1",
			label: "Sam Staff",
			role: "staff",
		});
	});

	it("never lets an ordinary customer account in, even if its email is on a list", () => {
		expect(operatorFor({ ...staffer, isStaff: false }, config)).toBeNull();
		expect(operatorFor({ ...staffer, isStaff: null }, config)).toBeNull();
		expect(operatorFor({ ...staffer, isStaff: undefined, email: "olivia@example.com" }, config)).toBeNull();
	});

	it("keeps out a staff account that is switched off or not on a list", () => {
		expect(operatorFor({ ...staffer, isActive: false }, config)).toBeNull();
		expect(operatorFor({ ...staffer, email: "stranger@example.com" }, config)).toBeNull();
	});

	it("lets nobody in when no lists are configured", () => {
		expect(operatorFor(staffer, readConfig({}))).toBeNull();
	});

	it("needs an email and an id", () => {
		expect(operatorFor({ ...staffer, email: null }, config)).toBeNull();
		expect(operatorFor({ ...staffer, id: "" }, config)).toBeNull();
	});

	it("falls back to the email when the account has no name", () => {
		expect(operatorFor({ ...staffer, firstName: "", lastName: "" }, config)?.label).toBe("sam@example.com");
	});

	it("puts the owner list ahead of the staff list", () => {
		const both = readConfig({
			WORLDWIDE_AI_OWNER_EMAILS: "sam@example.com",
			WORLDWIDE_AI_STAFF_EMAILS: "sam@example.com",
		});
		expect(operatorFor(staffer, both)?.role).toBe("owner");
	});
});
