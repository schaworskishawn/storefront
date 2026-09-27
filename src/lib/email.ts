import "server-only";

/**
 * Outbound email + audience helpers (Resend). Configure with:
 *   RESEND_API_KEY        required
 *   AFFILIATE_INBOX_EMAIL where site notifications are delivered (applications, contact messages, sign-ups)
 *   AFFILIATE_FROM_EMAIL  optional verified sender, e.g. "Worldwide Vapor <hello@worldwidevapor.com>"
 *   RESEND_AUDIENCE_ID    optional: newsletter sign-ups are added to this Resend audience
 * Until a domain is verified in Resend, it only delivers to the account owner's own address.
 */

export type SendResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" };

const escapeHtml = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function isEmailConfigured(): boolean {
	return Boolean(process.env.RESEND_API_KEY);
}

export async function sendNotification({
	subject,
	text,
	replyTo,
}: {
	subject: string;
	text: string;
	replyTo?: string;
}): Promise<SendResult> {
	const key = process.env.RESEND_API_KEY;
	if (!key) return { ok: false, reason: "not_configured" };
	const to = process.env.AFFILIATE_INBOX_EMAIL || "support@worldwidevapor.com";
	const from = process.env.AFFILIATE_FROM_EMAIL || "Worldwide Vapor <onboarding@resend.dev>";
	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from,
				to: [to],
				...(replyTo ? { reply_to: replyTo } : {}),
				subject,
				text,
				html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
			}),
		});
		if (!res.ok) {
			console.error("[email] Resend failed", res.status, await res.text().catch(() => ""));
			return { ok: false, reason: "failed" };
		}
		return { ok: true };
	} catch (e) {
		console.error("[email] delivery error", e);
		return { ok: false, reason: "failed" };
	}
}

/** Adds an address to the configured Resend audience. Returns not_configured when no audience is set. */
export async function addToAudience(email: string): Promise<SendResult> {
	const key = process.env.RESEND_API_KEY;
	const audience = process.env.RESEND_AUDIENCE_ID;
	if (!key || !audience) return { ok: false, reason: "not_configured" };
	try {
		const res = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audience)}/contacts`, {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ email, unsubscribed: false }),
		});
		if (!res.ok) {
			console.error("[email] audience add failed", res.status, await res.text().catch(() => ""));
			return { ok: false, reason: "failed" };
		}
		return { ok: true };
	} catch (e) {
		console.error("[email] audience error", e);
		return { ok: false, reason: "failed" };
	}
}
