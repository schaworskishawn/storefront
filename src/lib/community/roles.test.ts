import { describe, expect, it } from "vitest";
import { parseEmailList, roleFor } from "./roles";

describe("parseEmailList", () => {
	it("splits on commas, spaces and semicolons and ignores case", () => {
		expect([...parseEmailList(" A@x.com, b@x.com;C@X.com\nd@x.com ")]).toEqual([
			"a@x.com",
			"b@x.com",
			"c@x.com",
			"d@x.com",
		]);
	});
	it("is empty for nothing", () => {
		expect(parseEmailList(undefined).size).toBe(0);
		expect(parseEmailList("  ").size).toBe(0);
	});
});

describe("roleFor", () => {
	const env = { COMMUNITY_MODERATOR_EMAILS: "mod@x.com, Other@x.com" };

	it("makes staff accounts staff", () => {
		expect(roleFor({ email: "boss@x.com", isStaff: true }, env)).toBe("staff");
	});
	it("makes listed emails moderators, whatever the case", () => {
		expect(roleFor({ email: "MOD@x.com", isStaff: false }, env)).toBe("mod");
		expect(roleFor({ email: " other@x.com ", isStaff: false }, env)).toBe("mod");
	});
	it("puts staff above the list", () => {
		expect(roleFor({ email: "mod@x.com", isStaff: true }, env)).toBe("staff");
	});
	it("makes everyone else a member", () => {
		expect(roleFor({ email: "ava@x.com", isStaff: false }, env)).toBe("member");
		expect(roleFor({ email: null, isStaff: null }, env)).toBe("member");
		expect(roleFor({ email: "mod@x.com" }, {})).toBe("member");
	});
});
