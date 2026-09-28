import { describe, expect, it } from "vitest";
import {
	buildIdentityVerificationMetadata,
	IDENTITY_VERIFICATION_METADATA,
	readIdentityVerificationState,
} from "./keys";

describe("buildIdentityVerificationMetadata", () => {
	it("writes namespaced session id, status, and a timestamp", () => {
		const metadata = buildIdentityVerificationMetadata("vs_123", "verified");

		expect(metadata).toEqual(
			expect.arrayContaining([
				{ key: IDENTITY_VERIFICATION_METADATA.sessionId, value: "vs_123" },
				{ key: IDENTITY_VERIFICATION_METADATA.status, value: "verified" },
			]),
		);
		expect(metadata.find((entry) => entry.key === IDENTITY_VERIFICATION_METADATA.updatedAt)?.value).toMatch(
			/^\d{4}-\d{2}-\d{2}T/,
		);
	});
});

describe("readIdentityVerificationState", () => {
	it("returns nulls when there is no persisted state", () => {
		expect(readIdentityVerificationState(null)).toEqual({ sessionId: null, status: null });
		expect(readIdentityVerificationState([])).toEqual({ sessionId: null, status: null });
	});

	it("reads back a previously written session id and status", () => {
		const metadata = buildIdentityVerificationMetadata("vs_456", "processing");

		expect(readIdentityVerificationState(metadata)).toEqual({ sessionId: "vs_456", status: "processing" });
	});

	it("ignores an unrecognized status value rather than trusting it blindly", () => {
		const metadata = [
			{ key: IDENTITY_VERIFICATION_METADATA.sessionId, value: "vs_789" },
			{ key: IDENTITY_VERIFICATION_METADATA.status, value: "not_a_real_status" },
		];

		expect(readIdentityVerificationState(metadata)).toEqual({ sessionId: "vs_789", status: null });
	});
});
