import { describe, expect, it } from "vitest";
import {
	AGECHECKER_METADATA,
	buildAgeCheckerMetadata,
	needsAgeCheckerPopup,
	readAgeCheckerVerificationState,
} from "./keys";

describe("buildAgeCheckerMetadata", () => {
	it("writes namespaced uuid, status, and a timestamp", () => {
		const metadata = buildAgeCheckerMetadata("uuid_123", "accepted");

		expect(metadata).toEqual(
			expect.arrayContaining([
				{ key: AGECHECKER_METADATA.uuid, value: "uuid_123" },
				{ key: AGECHECKER_METADATA.status, value: "accepted" },
			]),
		);
		expect(metadata.find((entry) => entry.key === AGECHECKER_METADATA.updatedAt)?.value).toMatch(
			/^\d{4}-\d{2}-\d{2}T/,
		);
	});

	it("omits the uuid key when not_created (no uuid returned by AgeChecker)", () => {
		const metadata = buildAgeCheckerMetadata(undefined, "not_created");

		expect(metadata.find((entry) => entry.key === AGECHECKER_METADATA.uuid)).toBeUndefined();
		expect(metadata.find((entry) => entry.key === AGECHECKER_METADATA.status)?.value).toBe("not_created");
	});
});

describe("readAgeCheckerVerificationState", () => {
	it("returns nulls when there is no persisted state", () => {
		expect(readAgeCheckerVerificationState(null)).toEqual({ uuid: null, status: null });
		expect(readAgeCheckerVerificationState([])).toEqual({ uuid: null, status: null });
	});

	it("reads back a previously written uuid and status", () => {
		const metadata = buildAgeCheckerMetadata("uuid_456", "photo_id");

		expect(readAgeCheckerVerificationState(metadata)).toEqual({ uuid: "uuid_456", status: "photo_id" });
	});

	it("ignores an unrecognized status value rather than trusting it blindly", () => {
		const metadata = [
			{ key: AGECHECKER_METADATA.uuid, value: "uuid_789" },
			{ key: AGECHECKER_METADATA.status, value: "not_a_real_status" },
		];

		expect(readAgeCheckerVerificationState(metadata)).toEqual({ uuid: "uuid_789", status: null });
	});
});

describe("needsAgeCheckerPopup", () => {
	it("is true for statuses AgeChecker's popup can resolve further", () => {
		expect(needsAgeCheckerPopup("signature")).toBe(true);
		expect(needsAgeCheckerPopup("photo_id")).toBe(true);
		expect(needsAgeCheckerPopup("phone_validation")).toBe(true);
		expect(needsAgeCheckerPopup("sms_sent")).toBe(true);
	});

	it("is false for terminal or non-popup statuses", () => {
		expect(needsAgeCheckerPopup("accepted")).toBe(false);
		expect(needsAgeCheckerPopup("denied")).toBe(false);
		expect(needsAgeCheckerPopup("pending")).toBe(false);
		expect(needsAgeCheckerPopup("not_created")).toBe(false);
	});
});
