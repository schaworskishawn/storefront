import { describe, expect, it } from "vitest";
import { classifyStaff } from "./staff-check";

const user = (isStaff: boolean, codes: string[]) => ({
	status: "authenticated" as const,
	user: { id: "u1", email: "owner@example.com", isStaff, userPermissions: codes.map((code) => ({ code })) },
});

describe("classifyStaff", () => {
	it("lets in a staff account that can manage customers", () => {
		expect(classifyStaff(user(true, ["MANAGE_ORDERS", "MANAGE_USERS"]))).toEqual({
			ok: true,
			userId: "u1",
			email: "owner@example.com",
		});
	});

	it("turns away a customer, or staff without MANAGE_USERS, saying who is signed in", () => {
		expect(classifyStaff(user(false, ["MANAGE_USERS"]))).toEqual({
			ok: false,
			reason: "not-staff",
			email: "owner@example.com",
		});
		expect(classifyStaff(user(true, ["MANAGE_ORDERS"]))).toMatchObject({ ok: false, reason: "not-staff" });
	});

	it("only says signed out when there's no session, and 'can't check' when Saleor doesn't confirm one", () => {
		expect(classifyStaff({ status: "guest" })).toEqual({ ok: false, reason: "signed-out" });
		expect(classifyStaff({ status: "unavailable" })).toEqual({ ok: false, reason: "unavailable" });
	});
});
