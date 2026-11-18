import { describe, expect, it, vi } from "vitest";
import { handleAccountEmail } from "./handle";

const payload = {
	redirectUrl: "https://www.worldwidevapor.com/reset-password",
	token: "tok-1",
	user: { email: "owner@example.com", firstName: "Shawn", isConfirmed: true },
};

const deps = (ok = true, configured = true) => ({
	configured: () => configured,
	send: vi.fn(async (_to: string, _email: { subject: string; text: string; html: string }) => ({ ok })),
});

describe("handleAccountEmail", () => {
	it("emails the link to the account's address", async () => {
		const d = deps();
		expect(await handleAccountEmail("reset-password", payload, d)).toEqual({ status: 200, outcome: "sent" });
		const [to, email] = d.send.mock.calls[0] ?? [];
		expect(to).toBe("owner@example.com");
		expect(email?.text).toContain(
			"https://www.worldwidevapor.com/reset-password?email=owner%40example.com&token=tok-1",
		);
	});

	it("sends the staff email for a staff password", async () => {
		const d = deps();
		expect((await handleAccountEmail("staff-set-password", payload, d)).outcome).toBe("sent");
		expect(d.send.mock.calls[0]?.[1].subject).toContain("staff password");
	});

	it("doesn't ask an already-confirmed customer to confirm, but does ask a new one", async () => {
		const d = deps();
		expect((await handleAccountEmail("confirm-account", payload, d)).outcome).toBe("already-confirmed");
		const fresh = { ...payload, user: { ...payload.user, isConfirmed: false } };
		expect((await handleAccountEmail("confirm-account", fresh, d)).outcome).toBe("sent");
		expect(d.send).toHaveBeenCalledTimes(1);
	});

	it("asks Saleor to retry when the send fails, and not when there's nothing to send", async () => {
		expect(await handleAccountEmail("reset-password", payload, deps(false))).toEqual({
			status: 500,
			outcome: "failed",
		});
		expect(await handleAccountEmail("reset-password", payload, deps(true, false))).toEqual({
			status: 200,
			outcome: "not-configured",
		});
		expect((await handleAccountEmail("reset-password", { ...payload, user: null }, deps())).outcome).toBe(
			"missing-recipient",
		);
		expect((await handleAccountEmail("reset-password", { ...payload, token: null }, deps())).outcome).toBe(
			"missing-link",
		);
	});
});
